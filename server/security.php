<?php
/**
 * Security Utilities
 * Функции для защиты от типичных атак
 */

require_once __DIR__ . '/config.php';

class Security
{
    /**
     * Инициализация безопасной сессии
     */
    public static function initSession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        // Безопасные настройки сессии
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_secure', '1'); // Требует HTTPS
        ini_set('session.cookie_samesite', 'Strict');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');

        // Получаем session_name: сначала из settings.json, потом fallback на .env
        $settingsConfig = @include __DIR__ . '/src/config_loader.php';
        $sessionName = $settingsConfig['security']['session_name']
            ?? Config::get('SESSION_NAME', 'toosmart_cabinet');
        session_name($sessionName);
        session_start();

        // Проверка таймаута сессии
        $lifetime = Config::getInt('SESSION_LIFETIME', 86400); // 24 часа по умолчанию
        if (
            isset($_SESSION['last_activity']) &&
            (time() - $_SESSION['last_activity']) > $lifetime
        ) {
            self::destroySession();
            return false;
        }
        $_SESSION['last_activity'] = time();

        // Проверка IP (опционально, может быть проблемой с мобильными сетями)
        if (Config::getBool('SESSION_CHECK_IP', false)) {
            $currentIP = $_SERVER['REMOTE_ADDR'] ?? '';
            if (isset($_SESSION['user_ip']) && $_SESSION['user_ip'] !== $currentIP) {
                self::destroySession();
                return false;
            }
            $_SESSION['user_ip'] = $currentIP;
        }

        return true;
    }

    /**
     * Регенерация ID сессии (вызывать после логина)
     */
    public static function regenerateSession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
    }

    /**
     * Уничтожение сессии
     */
    public static function destroySession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            session_destroy();
        }
    }

    /**
     * Генерация CSRF токена
     */
    public static function generateCSRFToken()
    {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }

    /**
     * Проверка CSRF токена
     */
    public static function validateCSRFToken($token)
    {
        if (empty($_SESSION['csrf_token']) || empty($token)) {
            return false;
        }
        return hash_equals($_SESSION['csrf_token'], $token);
    }

    /**
     * Rate Limiting для предотвращения брутфорса
     *
     * @param string $identifier Уникальный идентификатор (email, IP и т.д.)
     * @param int $maxAttempts Максимальное количество попыток
     * @param int $windowSeconds Временное окно в секундах
     * @return bool True если попытка разрешена
     */
    public static function checkRateLimit($identifier, $maxAttempts = null, $windowSeconds = null)
    {
        if ($maxAttempts === null) {
            $maxAttempts = Config::getInt('RATE_LIMIT_MAX_ATTEMPTS', 5);
        }
        if ($windowSeconds === null) {
            $windowSeconds = Config::getInt('RATE_LIMIT_WINDOW', 900); // 15 минут
        }

        $key = 'rate_limit_' . md5($identifier);
        $now = time();

        if (!isset($_SESSION[$key])) {
            $_SESSION[$key] = ['attempts' => 0, 'reset_time' => $now + $windowSeconds];
        }

        $data = $_SESSION[$key];

        // Сбросить счетчик если окно истекло
        if ($now > $data['reset_time']) {
            $_SESSION[$key] = ['attempts' => 1, 'reset_time' => $now + $windowSeconds];
            return true;
        }

        // Проверить лимит
        if ($data['attempts'] >= $maxAttempts) {
            return false;
        }

        // Инкрементировать счетчик
        $_SESSION[$key]['attempts']++;
        return true;
    }

    /**
     * Получить оставшееся время блокировки
     */
    public static function getRateLimitTimeRemaining($identifier)
    {
        $key = 'rate_limit_' . md5($identifier);
        if (!isset($_SESSION[$key])) {
            return 0;
        }
        return max(0, $_SESSION[$key]['reset_time'] - time());
    }

    /**
     * Валидация email
     */
    public static function validateEmail($email)
    {
        $email = filter_var($email, FILTER_VALIDATE_EMAIL);
        if (!$email) {
            return false;
        }
        // Дополнительная проверка на опасные символы
        if (preg_match('/[\r\n]/', $email)) {
            return false;
        }
        return $email;
    }

    /**
     * Безопасное логирование (без чувствительных данных)
     */
    public static function secureLog($level, $message, $context = [])
    {
        $log = [
            'timestamp' => date('c'),
            'level' => strtoupper($level),
            'message' => $message,
            'ip' => self::getClientIP(),
            'context' => $context
        ];

        // Не логировать чувствительные данные
        unset($log['context']['password']);
        unset($log['context']['password_hash']);
        unset($log['context']['token']);

        error_log(json_encode($log, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Получение IP клиента (с учетом proxy)
     */
    public static function getClientIP()
    {
        $headers = [
            'HTTP_CF_CONNECTING_IP', // Cloudflare
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR'
        ];

        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
                // Если несколько IP через запятую, взять первый
                if (strpos($ip, ',') !== false) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }

        return 'unknown';
    }

    /**
     * Генерация криптографически безопасного пароля
     */
    public static function generatePassword($length = 16)
    {
        if ($length < 12) {
            $length = 12; // Минимум 12 символов
        }
        return bin2hex(random_bytes(ceil($length / 2)));
    }

    /**
     * Валидация пути (защита от path traversal)
     */
    public static function validatePath($basePath, $userPath)
    {
        $basePath = realpath($basePath);
        $fullPath = realpath($basePath . '/' . $userPath);

        if ($fullPath === false || strpos($fullPath, $basePath) !== 0) {
            throw new RuntimeException("Path traversal detected: $userPath");
        }

        return $fullPath;
    }
}
