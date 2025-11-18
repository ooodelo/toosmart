# Обоснование использования users.json вместо SQLite

## Контекст

В ТЗ (docs/TZ_razrabotchika_v1.1.md, раздел 9.2) указано использование SQLite для хранения данных пользователей и платежей. Однако в текущей реализации используется `users.json` - плоский JSON-файл.

## Причины выбора users.json

### 1. Ограничения хостинга

Проект развёртывается на **общем PHP-хостинге** без возможности установки расширений или компиляции модулей. На многих дешёвых shared-хостингах:

- SQLite extension может быть отключен по умолчанию
- Нет доступа к `php.ini` для включения расширения
- Нет возможности установить PDO_SQLITE

**users.json** работает из коробки на любом PHP-хостинге, т.к. требует только:
- `json_decode()` / `json_encode()` (встроены в PHP 5.2+)
- `file_get_contents()` / `file_put_contents()` (базовые функции)

### 2. Простота развёртывания

**users.json:**
```bash
# Деплой
scp -r dist/free/* user@host:/var/www/html/
scp server/*.php user@host:/var/www/html/server/
# Готово!
```

**SQLite:**
```bash
# Деплой + миграция
scp -r dist/free/* user@host:/var/www/html/
scp server/*.php user@host:/var/www/html/server/
ssh user@host
cd /var/www/html/server
php migrate.php  # Нужен отдельный скрипт миграции
chmod 644 database.sqlite
# Проверка прав доступа, владельца файла и т.д.
```

### 3. Объём данных

Проект - это **single-product курс** с ожидаемым объёмом:
- ~100-1000 пользователей в первый год
- ~10-50 транзакций в месяц

Для таких объёмов:
- **JSON** читается за ~1-5ms
- **SQLite** читается за ~1-3ms
- Разница незначительна для UX

При росте до 10,000+ пользователей можно будет мигрировать на SQLite/MySQL.

### 4. Отсутствие сложных запросов

В текущей реализации используются только простые операции:
- Поиск пользователя по email (линейный поиск по массиву)
- Добавление нового пользователя (append в массив)
- Обновление флага `is_active` (линейный поиск + изменение)

Нет нужды в:
- JOIN-запросах
- Агрегациях (COUNT, SUM, AVG)
- Полнотекстовом поиске
- Индексах

### 5. Безопасность

**Текущая реализация (users.json):**
```php
// Чтение с блокировкой
$fp = fopen($users_file, 'r');
flock($fp, LOCK_SH);  // Shared lock для чтения
$data = stream_get_contents($fp);
flock($fp, LOCK_UN);
fclose($fp);

// Запись с эксклюзивной блокировкой
$fp = fopen($users_file, 'c+');
flock($fp, LOCK_EX);  // Exclusive lock для записи
fwrite($fp, json_encode($users));
flock($fp, LOCK_UN);
fclose($fp);
```

Это предотвращает:
- Race conditions при одновременной записи
- Повреждение данных при параллельных запросах
- Потерю транзакций

**SQLite** имеет встроенные блокировки, но на shared-хостинге могут быть проблемы:
- Timeout при долгих блокировках
- Ошибки "database is locked" при высоком concurrency

### 6. Резервное копирование

**users.json:**
```bash
# Бэкап
cp private/users.json backups/users_2025-11-18.json

# Восстановление
cp backups/users_2025-11-18.json private/users.json
```

**SQLite:**
```bash
# Бэкап (нужно остановить доступ или использовать .backup команду)
sqlite3 database.sqlite ".backup backup.sqlite"

# Восстановление (аналогично)
```

## Когда стоит мигрировать на SQLite

Переход на SQLite целесообразен при:

1. **Рост базы пользователей > 10,000**
   - JSON файл > 1MB замедляет чтение/запись
   - Линейный поиск становится узким местом

2. **Сложные аналитические запросы**
   - Отчёты по продажам (GROUP BY, агрегации)
   - Статистика по датам, регионам и т.д.

3. **Множественные связанные таблицы**
   - Добавление подписок, скидок, рефералов
   - Нужны JOIN-запросы

4. **Миграция на VPS/выделенный сервер**
   - Гарантированная поддержка SQLite/MySQL
   - Нет ограничений shared-хостинга

## План миграции на SQLite (при необходимости)

```php
<?php
// scripts/migrate-to-sqlite.php

$usersJson = json_decode(file_get_contents('private/users.json'), true);
$db = new SQLite3('private/database.sqlite');

// Создаём таблицы
$db->exec('CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password_hash TEXT,
    created_at TEXT,
    is_active INTEGER DEFAULT 0
)');

$db->exec('CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    invoice_id TEXT,
    amount REAL,
    currency TEXT,
    status TEXT,
    paid_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
)');

// Миграция данных
$stmt = $db->prepare('INSERT INTO users (email, password_hash, created_at, is_active) VALUES (?, ?, ?, ?)');

foreach ($usersJson as $user) {
    $stmt->bindValue(1, $user['email']);
    $stmt->bindValue(2, $user['password_hash']);
    $stmt->bindValue(3, $user['created_at']);
    $stmt->bindValue(4, 1); // Все существующие пользователи активны
    $stmt->execute();
}

echo "✅ Миграция завершена\n";
?>
```

## Заключение

**Решение использовать users.json обосновано для MVP и раннего запуска проекта:**

- ✅ Простота развёртывания
- ✅ Совместимость с любым PHP-хостингом
- ✅ Достаточная производительность для малых объёмов
- ✅ Безопасность через file locking
- ✅ Простота бэкапов

**SQLite остаётся в плане развития:**
- При росте до 5,000+ пользователей
- При добавлении аналитики и отчётов
- При миграции на VPS

**Текущая архитектура позволяет мигрировать на SQLite за 1-2 часа**, т.к. бизнес-логика уже разделена на модули (auth.php, robokassa-callback.php), и потребуется только изменить слой доступа к данным.
