# API Reference

[← Back to CLAUDE.md](../CLAUDE.md)

Описание backend эндпоинтов и интеграций.

## PHP Backend (Premium Version)

Все PHP эндпоинты находятся в `/server/` и деплоятся в `dist/premium/`.

### Authentication

#### POST `/auth.php`

Авторизация пользователя.

**Request:**
```
Content-Type: application/x-www-form-urlencoded

email=user@example.com&password=secret&csrf_token=xxx
```

**Response:**
- Success: Redirect to `/premium/index.html`
- Error: Redirect to `/premium/index.php?error=1`

**Security:**
- CSRF token validation
- Rate limiting (5 attempts / 15 min)
- Session creation with HTTPOnly cookie

---

#### GET `/check-auth.php`

Проверка авторизации. Используется на защищённых страницах.

**Response:**
- Authorized: 200 OK
- Unauthorized: Redirect to `/premium/index.php`

**Usage (в .htaccess):**
```apache
RewriteCond %{REQUEST_FILENAME} \.html$
RewriteCond %{REQUEST_URI} !^/premium/index\.php
RewriteRule ^ - [E=AUTH_CHECK:1]
```

---

#### GET `/logout.php`

Завершение сессии.

**Response:**
Redirect to `/premium/index.php`

---

### Payment

#### POST `/create-invoice.php`

Создание платёжного счёта в Robokassa.

**Request:**
```
Content-Type: application/x-www-form-urlencoded

email=user@example.com&csrf_token=xxx
```

**Response:**
Redirect to Robokassa payment page.

**Invoice Format:**
```
InvId: {prefix}_{timestamp}_{random}
Example: CLEAN_1700000000_abc123
```

---

#### POST `/robokassa-callback.php`

Обработка callback от Robokassa после успешной оплаты.

**Request (from Robokassa):**
```
OutSum=3400&InvId=CLEAN_1234567890_abc&SignatureValue=xxx&Email=user@example.com
```

**Actions:**
1. Валидация подписи
2. Создание пользователя в `users.json`
3. Генерация временного пароля
4. Отправка email с учётными данными

**Response:**
```
OK{InvId}
```

---

#### GET `/success.php`

Страница успешной оплаты.

**Content:**
- Подтверждение оплаты
- Инструкции для входа
- Ссылка на страницу входа

---

### Configuration

#### `/config.php`

Загрузчик конфигурации (internal, не HTTP endpoint).

```php
<?php
$config = loadConfig();
// Returns array from config/site.json
```

---

### Security Utilities

#### `/security.php`

Утилиты безопасности (internal).

**Functions:**
```php
generateCsrfToken()              // Generate CSRF token
validateCsrfToken($token)        // Validate CSRF token
checkRateLimit($ip, $action)     // Rate limiting
validateEmail($email)            // RFC email validation
validatePassword($password)      // Length validation (6-128)
escapeHtml($string)              // XSS prevention
logSecurityEvent($event, $data)  // Security logging
```

---

## Admin API (Node.js)

Admin panel API на порту 3001.

### GET `/api/config`

Получение текущей конфигурации.

**Response:**
```json
{
  "domain": "toosmart.ru",
  "pricing": { ... },
  "ctaTexts": { ... },
  "footer": { ... },
  "robokassa": { ... }
}
```

---

### POST `/api/config`

Сохранение конфигурации.

**Request:**
```json
{
  "domain": "toosmart.ru",
  "pricing": {
    "currentAmount": 3400
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

### POST `/api/build`

Запуск сборки проекта.

**Request:**
```json
{
  "target": "all"  // "free" | "premium" | "all"
}
```

**Response (streaming):**
```
Build started...
Building free version...
Building premium version...
Build completed successfully.
```

---

## Robokassa Integration

### Configuration

В `config/site.json`:

```json
{
  "robokassa": {
    "merchantLogin": "SHOP_ID",
    "password1": "HASH_FOR_REQUESTS",
    "password2": "HASH_FOR_CALLBACKS",
    "isTest": true,
    "invoicePrefix": "CLEAN",
    "successUrl": "/success.php",
    "resultUrl": "/robokassa-callback.php"
  }
}
```

### Payment Flow

```
1. User clicks CTA
   ↓
2. POST /create-invoice.php (email)
   ↓
3. Redirect to Robokassa
   ↓
4. User pays
   ↓
5. Robokassa → POST /robokassa-callback.php
   ↓
6. Create user account
   ↓
7. Send email with credentials
   ↓
8. User → /success.php
   ↓
9. User logs in → /auth.php
```

### Signature Calculation

```php
// For requests (password1)
$signature = md5("{$merchantLogin}:{$amount}:{$invId}:{$password1}");

// For callbacks (password2)
$signature = md5("{$outSum}:{$invId}:{$password2}");
```

### Test Mode

Когда `isTest: true`:
- Используется тестовый URL Robokassa
- Тестовые карты: 4111 1111 1111 1111

---

## Data Models

### User (users.json)

```json
{
  "user@example.com": {
    "password": "$2y$10$hash...",
    "created_at": "2024-01-15T10:30:00Z",
    "invoice_id": "CLEAN_1705312200_abc123",
    "ip": "192.168.1.1"
  }
}
```

---

### Recommendations (shared/recommendations.json)

```json
[
  {
    "slug": "eco-cleaning",
    "title": "Экологичная уборка",
    "teaser": "Как убираться без химии",
    "image": "/images/reco/eco.png",
    "readingTimeMinutes": 8,
    "order": 1
  }
]
```

---

## Security Headers

### .htaccess Configuration

```apache
# Security headers
Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "DENY"
Header set X-XSS-Protection "1; mode=block"
Header set Referrer-Policy "strict-origin-when-cross-origin"

# Protect sensitive files
<FilesMatch "\.(json|log|md)$">
    Require all denied
</FilesMatch>

# Protect users.json specifically
<Files "users.json">
    Require all denied
</Files>
```

---

## Error Codes

### Authentication Errors

| Code | Description |
|------|-------------|
| `error=1` | Invalid credentials |
| `error=2` | Rate limit exceeded |
| `error=3` | CSRF token invalid |
| `error=4` | Session expired |

### Payment Errors

| Code | Description |
|------|-------------|
| `error=10` | Invalid email |
| `error=11` | Payment creation failed |
| `error=12` | Signature mismatch |

---

## Environment Variables

Для production рекомендуется использовать `.env`:

```bash
# .env (не коммитить!)
ROBOKASSA_LOGIN=YOUR_SHOP_ID
ROBOKASSA_PASSWORD1=YOUR_HASH1
ROBOKASSA_PASSWORD2=YOUR_HASH2
ROBOKASSA_TEST=false

# Email settings
SMTP_HOST=smtp.example.com
SMTP_USER=noreply@example.com
SMTP_PASSWORD=xxx
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth.php` | 5 attempts | 15 minutes |
| `/create-invoice.php` | 10 requests | 1 hour |

---

## CORS

Admin API позволяет CORS только для localhost:

```javascript
res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001');
```

Premium backend не требует CORS (same-origin).

---

## Related Documentation

- [Codebase Overview](CODEBASE.md) - Расположение PHP файлов
- [Build System](BUILD_SYSTEM.md) - Как деплоятся PHP файлы
- [Security Fixes](SECURITY_FIXES_CHANGELOG.md) - История исправлений безопасности
