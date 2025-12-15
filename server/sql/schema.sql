-- =====================================================
-- TooSmart Database Schema
-- MySQL 8.0+ | InnoDB | utf8mb4
-- =====================================================

-- 1. USERS - основная таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  email_verified TINYINT DEFAULT 0,
  email_verification_token VARCHAR(255) NULL,
  last_login DATETIME NULL,
  is_active TINYINT DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email (email),
  KEY idx_email_verified (email_verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. ORDERS - заказы/платежи
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inv_id INT NOT NULL UNIQUE,
  user_id INT NULL,
  email VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  promo_code VARCHAR(64) NULL,
  promo_discount DECIMAL(10,2) NULL,
  status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  receipt_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  KEY idx_email (email),
  KEY idx_status (status),
  KEY idx_inv_id (inv_id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. ACCESS - права доступа к курсу
CREATE TABLE IF NOT EXISTS access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_id INT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME NULL,
  UNIQUE KEY uniq_user (user_id),
  CONSTRAINT fk_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. PASSWORD_RESET_TOKENS - токены сброса пароля
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_token (token),
  KEY idx_expires (expires_at),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. EMAIL_LOGS - логирование отправленных писем
CREATE TABLE IF NOT EXISTS email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  email_type ENUM('welcome', 'password_reset', 'password_changed', 'email_verification', 'other') DEFAULT 'other',
  status ENUM('sent', 'failed', 'pending') DEFAULT 'sent',
  error_message TEXT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_type (email_type),
  KEY idx_sent_at (sent_at),
  CONSTRAINT fk_email_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. PASSWORD_HISTORY - история смены паролей
CREATE TABLE IF NOT EXISTS password_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  old_password_hash VARCHAR(255) NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by_ip VARCHAR(45) NULL,
  KEY idx_user (user_id),
  CONSTRAINT fk_pwd_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. USER_DEVICES - устройства пользователей
CREATE TABLE IF NOT EXISTS user_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  device_hash VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  login_count INT DEFAULT 1,
  UNIQUE KEY uniq_user_device (user_id, device_hash),
  KEY idx_user (user_id),
  CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. LOGIN_HISTORY - история входов
CREATE TABLE IF NOT EXISTS login_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  device_id INT NULL,
  success TINYINT DEFAULT 1,
  failure_reason VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_created (created_at),
  KEY idx_success (success),
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_login_device FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. EMAIL_VERIFICATION_TOKENS - токены подтверждения email
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_token (token),
  KEY idx_user (user_id),
  CONSTRAINT fk_verify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. MAGIC_LINKS - одноразовые ссылки для входа
CREATE TABLE IF NOT EXISTS magic_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_token (token),
  KEY idx_user (user_id),
  CONSTRAINT fk_magic_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
