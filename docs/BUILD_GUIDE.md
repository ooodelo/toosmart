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

### Конфигурация в `.env`

```env
# Email отправителя
MAIL_FROM=noreply@yourdomain.com
MAIL_REPLY_TO=support@yourdomain.com

# URL сайта (для письма)
SITE_URL=https://yourdomain.com

# Robokassa (тестовый режим)
ROBOKASSA_TEST_MODE=true
ROBOKASSA_MERCHANT_LOGIN=your_login
ROBOKASSA_PASSWORD1=password1
ROBOKASSA_PASSWORD2=password2
```

### Как работает отправка

Email отправляется автоматически при успешной оплате:
1. Robokassa вызывает `/robokassa-callback.php`
2. Система создаёт пользователя с случайным паролем
3. Пароль отправляется на email покупателя

### Тестирование через логи (рекомендуется)

**Способ 1: Перехват mail()**

Добавьте в начало `robokassa-callback.php`:

```php
// Для тестирования - логировать вместо отправки
function test_mail($to, $subject, $message, $headers) {
    $log_file = __DIR__ . '/../logs/mail.log';
    $log_entry = sprintf(
        "[%s]\nTo: %s\nSubject: %s\nHeaders: %s\nBody:\n%s\n\n%s\n",
        date('Y-m-d H:i:s'),
        $to,
        $subject,
        $headers,
        $message,
        str_repeat('=', 50)
    );
    file_put_contents($log_file, $log_entry, FILE_APPEND);
    return true;
}

// Замените mail() на test_mail() в функции sendPasswordEmail()
```

**Способ 2: Использовать MailHog**

```bash
# Установка
go install github.com/mailhog/MailHog@latest

# Запуск (SMTP на :1025, Web UI на :8025)
MailHog

# Настройка PHP
# В php.ini:
sendmail_path = /usr/local/bin/mhsendmail
```

Откройте http://localhost:8025 для просмотра писем.

**Способ 3: Проверка логов**

После callback'а проверьте лог:

```bash
# Ищите записи об отправке
grep "Password email sent" /var/log/apache2/error.log
```

Пример записи в логе:
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

### Тестирование платёжного callback

```bash
# Имитация callback от Robokassa
# Подпись: MD5(OutSum:InvId:Password2:Shp_email=email)

INV_ID=12345
OUT_SUM=990.00
EMAIL=test@example.com
PASSWORD2=your_password2
SIGN=$(echo -n "${OUT_SUM}:${INV_ID}:${PASSWORD2}:Shp_email=${EMAIL}" | md5sum | cut -d' ' -f1)

curl -X POST http://localhost:8000/robokassa-callback.php \
  -d "OutSum=${OUT_SUM}" \
  -d "InvId=${INV_ID}" \
  -d "SignatureValue=${SIGN}" \
  -d "Shp_email=${EMAIL}"
```

При успехе вернётся: `OK${INV_ID}`

### Проверка созданного пользователя

```bash
sqlite3 /private/database.sqlite \
  "SELECT email, invoice_id, amount, created_at FROM users WHERE invoice_id='12345';"
```

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
