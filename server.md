Вот **ПОЛНЫЙ НАБОР ДАННЫХ И КОНФИГУРАЦИЯ** для отправки/приема писем с адреса [reply@toosmart.ru](mailto:reply@toosmart.ru) и управления данными пользователей:

------

## **1. КОНФИГУРАЦИЯ ПОЧТОВОГО ЯЩИКА**

**Почтовый ящик:**

- Email: `reply@toosmart.ru`
- Пароль: `2000$martuser`

------

## **2. КОНФИГУРАЦИЯ SMTP (ДЛЯ ОТПРАВКИ ПИСЕМ)**

```
text
SMTP_HOST = server291.hosting.reg.ru
SMTP_PORT = 587
SMTP_USER = reply@toosmart.ru
SMTP_PASSWORD = 2000$martuser
SMTP_ENCRYPTION = TLS
SMTP_FROM = reply@toosmart.ru
SMTP_FROM_NAME = TooSmart
```

------

## **3. КОНФИГУРАЦИЯ IMAP (ДЛЯ ПРИЕМА ПИСЕМ)**

```
text
IMAP_HOST = server291.hosting.reg.ru
IMAP_PORT = 993
IMAP_USER = reply@toosmart.ru
IMAP_PASSWORD = 2000$martuser
IMAP_ENCRYPTION = SSL
```

------

## **4. КОНФИГУРАЦИЯ MYSQL**

**Основная БД для приложения:**

- **Имя БД**: `u3345393_toosmart`
- **Host**: `localhost`
- **Username**: `u3345393_toosmart` (или `u3345393_default`)
- **Password**: `6ALYKmmb65C2hT7r`
- **MySQL версия**: 8.0.25
- **Порт**: 3306 (по умолчанию)

------

## **5. ТАБЛИЦЫ MYSQL ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ**

## **Таблица 1: Хранение пользователей и паролей**

```
sql
CREATE TABLE `users` (
  `user_id` INT PRIMARY KEY AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `password_reset_token` VARCHAR(255),
  `password_reset_expires` DATETIME,
  `email_verified` TINYINT DEFAULT 0,
  `email_verification_token` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login` DATETIME,
  `is_active` TINYINT DEFAULT 1,
  KEY `email_idx` (`email`),
  KEY `username_idx` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## **Таблица 2: Логирование отправки писем**

```
sql
CREATE TABLE `email_logs` (
  `log_id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT,
  `recipient_email` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `email_type` VARCHAR(50),
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `status` VARCHAR(50) DEFAULT 'sent',
  `error_message` TEXT,
  `reset_token` VARCHAR(255),
  `confirmation_token` VARCHAR(255),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  KEY `sent_at_idx` (`sent_at`),
  KEY `status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## **Таблица 3: История смены паролей**

```
sql
CREATE TABLE `password_history` (
  `history_id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `old_password_hash` VARCHAR(255),
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `changed_by_ip` VARCHAR(45),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  KEY `user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## **Таблица 4: Токены доступа и сессии**

```
sql
CREATE TABLE `password_reset_tokens` (
  `token_id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used` TINYINT DEFAULT 0,
  `used_at` DATETIME,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  KEY `token_idx` (`token`),
  KEY `expires_at_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## **Таблица 5: Письма в очереди отправки**

```
sql
CREATE TABLE `email_queue` (
  `queue_id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT,
  `to_email` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `body` LONGTEXT,
  `email_type` VARCHAR(50),
  `priority` INT DEFAULT 0,
  `attempts` INT DEFAULT 0,
  `max_attempts` INT DEFAULT 3,
  `status` VARCHAR(50) DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `scheduled_at` DATETIME,
  `sent_at` DATETIME,
  `error` TEXT,
  KEY `status_idx` (`status`),
  KEY `scheduled_at_idx` (`scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

------

## **6. PHP КОНФИГУРАЦИЯ ДЛЯ ОТПРАВКИ ПИСЕМ**

```
php
<?php
// config/mail.php

return [
    'driver' => 'smtp',
    'host' => 'server291.hosting.reg.ru',
    'port' => 587,
    'encryption' => 'tls',
    'username' => 'reply@toosmart.ru',
    'password' => '2000$martuser',
    'from' => [
        'address' => 'reply@toosmart.ru',
        'name' => 'TooSmart'
    ],
    'timeout' => 10,
    'verify_peer' => false,
    'verify_peer_name' => false
];
?>
```

## **Пример класса для отправки писем с восстановлением пароля:**

```
php
<?php
// app/Mail/PasswordResetMail.php

use PHPMailer\PHPMailer\PHPMailer;

class PasswordResetMail {
    private $mail;
    private $config;
    
    public function __construct() {
        $this->mail = new PHPMailer(true);
        $this->config = [
            'host' => 'server291.hosting.reg.ru',
            'port' => 587,
            'username' => 'reply@toosmart.ru',
            'password' => '2000$martuser',
            'encryption' => 'tls'
        ];
    }
    
    public function sendPasswordReset($userEmail, $resetToken) {
        try {
            $this->mail->isSMTP();
            $this->mail->Host = $this->config['host'];
            $this->mail->Port = $this->config['port'];
            $this->mail->SMTPAuth = true;
            $this->mail->Username = $this->config['username'];
            $this->mail->Password = $this->config['password'];
            $this->mail->SMTPSecure = $this->config['encryption'];
            
            $this->mail->setFrom('reply@toosmart.ru', 'TooSmart');
            $this->mail->addAddress($userEmail);
            
            $this->mail->Subject = 'Восстановление пароля - TooSmart';
            $resetLink = 'https://toosmart.ru/reset-password?token=' . $resetToken;
            
            $this->mail->Body = "
                <h2>Восстановление пароля</h2>
                <p>Привет!</p>
                <p>Вы запросили восстановление пароля. Перейдите по ссылке ниже:</p>
                <p><a href='{$resetLink}'>Восстановить пароль</a></p>
                <p>Или скопируйте ссылку: {$resetLink}</p>
                <p>Ссылка действительна 24 часа.</p>
            ";
            
            $this->mail->isHTML(true);
            $this->mail->send();
            
            return true;
        } catch (Exception $e) {
            error_log("Mail Error: " . $e->getMessage());
            return false;
        }
    }
}
?>
```

------

## **7. SQL ЗАПРОСЫ ДЛЯ УПРАВЛЕНИЯ ПАРОЛЯМИ**

## **Создание токена сброса пароля:**

```
sql
INSERT INTO `password_reset_tokens` 
(`user_id`, `token`, `expires_at`) 
VALUES 
(1, SHA2(CONCAT(RAND(), NOW()), 256), DATE_ADD(NOW(), INTERVAL 24 HOUR));
```

## **Логирование отправки письма:**

```
sql
INSERT INTO `email_logs` 
(`user_id`, `recipient_email`, `subject`, `email_type`, `status`, `reset_token`) 
VALUES 
(1, 'user@example.com', 'Восстановление пароля', 'password_reset', 'sent', 'token_here');
```

## **Обновление пароля пользователя:**

```
sql
UPDATE `users` 
SET `password_hash` = SHA2('new_password', 256), 
    `password_reset_token` = NULL,
    `password_reset_expires` = NULL
WHERE `user_id` = 1;
```

------

## **8. СТРУКТУРА ФАЙЛОВ НА СЕРВЕРЕ**

```
text
/public_html/
├── config/
│   ├── mail.php
│   ├── database.php
│   └── app.php
├── app/
│   ├── Mail/
│   │   ├── PasswordResetMail.php
│   │   ├── EmailVerificationMail.php
│   │   └── WelcomeMail.php
│   └── Controllers/
│       ├── AuthController.php
│       └── PasswordController.php
├── database/
│   ├── migrations/
│   │   └── create_tables.sql
│   └── seeds/
└── public/
    └── reset-password.php
```

------

## **9. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (.env файл)**

```
text
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=u3345393_toosmart
DB_USERNAME=u3345393_toosmart
DB_PASSWORD=6ALYKmmb65C2hT7r

MAIL_DRIVER=smtp
MAIL_HOST=server291.hosting.reg.ru
MAIL_PORT=587
MAIL_USERNAME=reply@toosmart.ru
MAIL_PASSWORD=2000$martuser
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=reply@toosmart.ru
MAIL_FROM_NAME=TooSmart
```

------

## **10. ВАЖНЫЕ ЗАМЕЧАНИЯ**

1. **Все пароли хранить в БД хешированными** (используйте `password_hash()` в PHP или `SHA2()` в MySQL)
2. **Токены восстановления** должны быть уникальными и с ограничением по времени (24 часа)
3. **HTTPS обязателен** при передаче токенов и чувствительных данных
4. **Логирование** всех операций с паролями и письмами для безопасности
5. **Обработка ошибок SMTP** - использовать очередь писем (таблица `email_queue`)

Все готово для использования!