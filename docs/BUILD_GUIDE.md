# Руководство по сборке и тестированию TooSmart

## 1. Расположение файлов контента

### Структура директорий

```
content/
├── intro/              # Введение (всегда публичное)
│   └── 00_intro.md
├── course/             # Разделы курса
│   ├── 01_название.md
│   ├── 02_название.md
│   └── ...
├── appendix/           # Приложения (только premium)
│   ├── A_название.md
│   └── B_название.md
├── recommendations/    # SEO-статьи
│   └── eco-cleaning.md
├── legal/              # Юридические документы
│   └── offer.md
└── images/             # Картинки для контента
```

### Правила именования файлов

| Тип контента | Формат имени | Пример |
|--------------|--------------|--------|
| Введение | `00_intro.md` | `00_intro.md` |
| Курс | `NN_название.md` | `01_basics.md`, `02_advanced.md` |
| Приложения | `X_название.md` | `A_materials.md`, `B_resources.md` |
| Рекомендации | `любое-имя.md` | `eco-cleaning.md` |

### Структура файлов курса

```markdown
# Заголовок раздела

Контент до разделителя показывается в бесплатной версии.

---

## Остальной контент

Этот текст скрыт paywall в free версии.
```

### Структура файлов рекомендаций

```markdown
---
title: "Название статьи"
teaser: "Краткое описание для превью"
image: "/images/reco/picture.png"
order: 10
slug: "url-статьи"
---

# Заголовок

Содержимое статьи...
```

### Вставка картинок в Markdown

**Путь к картинкам**: помещайте файлы в `content/images/`

```markdown
# Относительный путь (рекомендуется)
![Описание](../images/picture.png)

# Абсолютный путь от корня сайта
![Описание](/images/picture.png "Подсказка")

# Для рекомендаций в front matter
image: "/images/reco/eco.png"
```

---

## 2. Файлы шаблонов

### Расположение: `src/`

| Файл | Назначение |
|------|------------|
| `template.html` | Основной шаблон для всех страниц |
| `template-paywall.html` | Шаблон для free версии с ограниченным CSP |
| `template-full.html` | Шаблон для premium версии |

### Вспомогательные файлы

| Файл | Назначение |
|------|------------|
| `script.js` | Основная клиентская логика |
| `styles.css` | Все стили (минифицируются при сборке) |
| `mode-utils.js` | Определение режима (free/premium) |
| `cta.js` | Логика кнопок призыва к действию |
| `legal-modals.js` | Модальные окна с юр. информацией |

### Placeholder'ы в шаблонах

Система сборки заменяет:
- `<title>{{title}}</title>` → заголовок страницы
- `<div id="article-content">{{body}}</div>` → контент страницы
- Мета-теги вставляются перед `</head>`
- Schema.org JSON-LD вставляется перед `</body>`

---

## 3. Сборка и запуск

### Папка результата сборки

```
dist/
├── free/       # Бесплатная версия
├── premium/    # Полная версия
└── shared/     # Общие ресурсы (JSON, конфиги)
```

### Команды сборки

```bash
# Установка зависимостей
npm install

# Полная сборка
npm run build

# Сборка отдельных версий
npm run build:free
npm run build:premium

# Очистка dist/
npm run clean
```

### Запуск локального сервера

```bash
# Free версия на http://localhost:3003
npm run preview:free

# Premium версия на http://localhost:3004
npm run preview:premium

# Dev-сервер src/ на http://localhost:3000
npm run dev

# Админ-панель на http://localhost:3001
npm run admin
```

---

## 4. Тестирование авторизации

### Настройка базы данных

База SQLite создаётся автоматически по пути из `.env`:

```env
DATABASE_PATH=/private/database.sqlite
```

### Структура таблицы users

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  invoice_id TEXT,
  amount REAL
);
```

### Создание тестового пользователя

```php
<?php
// test-create-user.php
require_once 'server/Database.php';

$email = 'test@example.com';
$password = 'testpassword123';
$hash = password_hash($password, PASSWORD_DEFAULT);

$db = Database::getConnection();
$stmt = $db->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
$stmt->execute([$email, $hash]);

echo "Пользователь создан: $email / $password\n";
```

### Тестирование логина

1. Запустите PHP-сервер:
   ```bash
   php -S localhost:8000 -t server/
   ```

2. Отправьте POST-запрос на `/auth.php`:
   ```bash
   curl -X POST http://localhost:8000/auth.php \
     -d "email=test@example.com" \
     -d "password=testpassword123" \
     -d "csrf_token=YOUR_TOKEN" \
     -c cookies.txt -b cookies.txt -L -v
   ```

3. Проверьте редирект на `home.html` при успехе

### Просмотр логов

Логи пишутся через `error_log()`. Местоположение:
- Apache: `/var/log/apache2/error.log`
- PHP built-in server: вывод в терминал
- Настраиваемый путь через `php.ini`

### Проверка записи в БД

```bash
sqlite3 /private/database.sqlite "SELECT id, email, created_at FROM users;"
```

---

## 5. Настройка и тестирование отправки email

### Как это работает

Когда пользователь оплачивает курс через Robokassa, происходит следующее:

1. **Robokassa уведомляет сервер** — после успешной оплаты Robokassa отправляет POST-запрос на `/robokassa-callback.php`
2. **Создаётся аккаунт** — система генерирует криптографически безопасный пароль (16 символов) и сохраняет пользователя в базу
3. **Отправляется письмо** — пароль отправляется на email покупателя через стандартную PHP-функцию `mail()`

### С какого адреса приходит письмо

Адрес отправителя настраивается в файле `.env`:

```env
MAIL_FROM=noreply@yourdomain.com      # От кого придёт письмо
MAIL_REPLY_TO=support@yourdomain.com  # Куда пойдёт ответ пользователя
```

**По умолчанию** (если не настроено): `noreply@toosmart.com`

### Что получит покупатель

```
Тема: Ваш доступ к курсу Clean - Теория правильной уборки

Здравствуйте!

Спасибо за покупку курса «Clean - Теория правильной уборки».

Ваши данные для входа в закрытую версию:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: buyer@example.com
Пароль: a8Kj2mNx9pQr4sLw
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ссылка для входа: https://yourdomain.com/premium/

⚠️ ВАЖНО: Сохраните это письмо - пароль больше нигде не отображается.
```

### Настройка email на сервере

#### Требования

Функция PHP `mail()` требует настроенный почтовый сервер (MTA) на хостинге:
- **sendmail** — стандартный MTA на Linux
- **postfix** — популярная альтернатива
- **msmtp** — лёгкий клиент для отправки через внешний SMTP

На большинстве хостингов (Beget, TimeWeb, REG.RU и т.д.) `mail()` работает "из коробки".

#### Конфигурация `.env`

Скопируйте `.env.example` в `.env` и заполните:

```env
# === Email настройки ===
MAIL_FROM=noreply@yourdomain.com      # Адрес отправителя
MAIL_REPLY_TO=support@yourdomain.com  # Адрес для ответов
SITE_URL=https://yourdomain.com       # URL сайта (для ссылки в письме)

# === Robokassa ===
ROBOKASSA_MERCHANT_LOGIN=your_login   # Логин магазина
ROBOKASSA_PASSWORD1=password1         # Пароль #1 (для создания счёта)
ROBOKASSA_PASSWORD2=password2         # Пароль #2 (для проверки callback)
ROBOKASSA_TEST_MODE=true              # true для тестов, false для продакшена
```

#### Проверка работы mail() на сервере

```php
<?php
// test-mail.php - проверка отправки
$result = mail(
    'your-email@gmail.com',
    'Тест отправки',
    'Если вы видите это письмо, mail() работает!',
    'From: noreply@yourdomain.com'
);
echo $result ? 'Отправлено!' : 'Ошибка отправки';
```

### Локальное тестирование (без реальной отправки)

На локальной машине `mail()` обычно не работает. Есть 3 способа тестировать:

#### Способ 1: Логирование в файл (самый простой)

Временно замените отправку на запись в лог. В файле `server/robokassa-callback.php` найдите строку:

```php
if (mail($to, $subject, $message, implode("\r\n", $headers))) {
```

И замените на:

```php
// Для локального тестирования - пишем в файл вместо отправки
$log_file = __DIR__ . '/../logs/mail.log';
$log_entry = sprintf(
    "=== %s ===\nTo: %s\nSubject: %s\n\n%s\n\n",
    date('Y-m-d H:i:s'),
    $to,
    $subject,
    $message
);
file_put_contents($log_file, $log_entry, FILE_APPEND);
$mail_sent = true; // Имитируем успешную отправку

if ($mail_sent) {
```

Теперь письма будут сохраняться в `logs/mail.log`. Не забудьте создать папку:

```bash
mkdir -p logs
```

#### Способ 2: MailHog (визуальный интерфейс)

MailHog — это фейковый SMTP-сервер с веб-интерфейсом для просмотра писем.

```bash
# Установка (нужен Go)
go install github.com/mailhog/MailHog@latest

# Или через Docker
docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog

# Запуск
MailHog
```

Настройте PHP использовать MailHog. В `php.ini`:

```ini
sendmail_path = /usr/local/bin/mhsendmail
```

Или для Docker/macOS:

```ini
sendmail_path = "/usr/bin/env php -r 'print_r(stream_socket_client(\"tcp://127.0.0.1:1025\"));'"
```

Откройте http://localhost:8025 — там будут все "отправленные" письма.

#### Способ 3: Проверка через логи системы

Даже без реальной отправки, система логирует попытки:

```bash
# Ищите записи об отправке в логах PHP
grep "Password email sent" /var/log/apache2/error.log

# Или для встроенного PHP-сервера - смотрите вывод в терминале
```

Пример записи:
```json
{
  "level": "INFO",
  "message": "Password email sent",
  "context": {
    "email": "buyer@example.com",
    "invoice_id": "12345"
  }
}
```

### Тестирование полного процесса оплаты

Чтобы проверить весь процесс (оплата → создание пользователя → отправка письма):

#### 1. Запустите локальный PHP-сервер

```bash
php -S localhost:8000 -t server/
```

#### 2. Имитируйте callback от Robokassa

Robokassa отправляет POST-запрос с подписью. Создайте её так:

```bash
# Параметры платежа
INV_ID=12345
OUT_SUM=990.00
EMAIL=test@example.com
PASSWORD2=your_password2   # Из .env (ROBOKASSA_PASSWORD2)

# Генерация подписи: MD5(OutSum:InvId:Password2:Shp_email=email)
SIGN=$(echo -n "${OUT_SUM}:${INV_ID}:${PASSWORD2}:Shp_email=${EMAIL}" | md5sum | cut -d' ' -f1)

# Отправка запроса
curl -X POST http://localhost:8000/robokassa-callback.php \
  -d "OutSum=${OUT_SUM}" \
  -d "InvId=${INV_ID}" \
  -d "SignatureValue=${SIGN}" \
  -d "Shp_email=${EMAIL}"
```

При успехе ответ: `OK12345`

#### 3. Проверьте результат

```bash
# Пользователь в базе
sqlite3 /private/database.sqlite \
  "SELECT email, invoice_id, amount, created_at FROM users WHERE invoice_id='12345';"

# Письмо в логе (если использовали способ 1)
cat logs/mail.log
```

### Частые проблемы

| Проблема | Причина | Решение |
|----------|---------|---------|
| `mail()` возвращает `false` | Не настроен MTA | Установите sendmail/postfix или используйте внешний SMTP |
| Письма в спаме | Нет SPF/DKIM записей | Добавьте DNS записи для домена |
| Письма не доходят | Блокировка провайдером | Используйте сервис типа SendGrid/Mailgun |
| `Bad signature` в callback | Неверный PASSWORD2 | Проверьте ROBOKASSA_PASSWORD2 в .env |

### Использование внешних сервисов (рекомендуется для продакшена)

Для надёжной доставки используйте API почтовых сервисов:
- **SendGrid** — 100 писем/день бесплатно
- **Mailgun** — 5000 писем/месяц бесплатно
- **Unisender** — российский сервис

Потребуется заменить `mail()` на HTTP-запрос к API сервиса.

---

## Полезные команды

```bash
# Проверка ссылок в контенте
npm run lint:links

# Просмотр конфигурации
cat config/site.json | jq

# Подсчёт слов в курсе
find content/course -name "*.md" -exec wc -w {} +
```
