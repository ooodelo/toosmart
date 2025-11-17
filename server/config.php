<?php
/**
 * Configuration Loader
 * Загрузка переменных окружения из .env файла
 */

class Config {
    private static $loaded = false;
    private static $config = [];

    /**
     * Загрузить .env файл
     */
    public static function load($envPath = null) {
        if (self::$loaded) {
            return;
        }

        if ($envPath === null) {
            $envPath = __DIR__ . '/../.env';
        }

        if (!file_exists($envPath)) {
            error_log("Warning: .env file not found at: $envPath");
            self::$loaded = true;
            return;
        }

        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            // Пропустить комментарии
            if (strpos(trim($line), '#') === 0) {
                continue;
            }

            // Парсинг KEY=VALUE
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);

                // Удалить кавычки если есть
                if (preg_match('/^(["\'])(.*)\1$/', $value, $matches)) {
                    $value = $matches[2];
                }

                self::$config[$key] = $value;

                // Также установить в $_ENV и putenv для совместимости
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }

        self::$loaded = true;
    }

    /**
     * Получить значение из конфига
     */
    public static function get($key, $default = null) {
        self::load();

        // Проверить в порядке приоритета: $_ENV, self::$config, getenv
        if (isset($_ENV[$key])) {
            return $_ENV[$key];
        }

        if (isset(self::$config[$key])) {
            return self::$config[$key];
        }

        $value = getenv($key);
        if ($value !== false) {
            return $value;
        }

        return $default;
    }

    /**
     * Получить обязательное значение (бросает исключение если не найдено)
     */
    public static function require($key) {
        $value = self::get($key);
        if ($value === null) {
            throw new RuntimeException("Required configuration key '$key' is not set");
        }
        return $value;
    }

    /**
     * Получить boolean значение
     */
    public static function getBool($key, $default = false) {
        $value = self::get($key);
        if ($value === null) {
            return $default;
        }
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Получить integer значение
     */
    public static function getInt($key, $default = 0) {
        $value = self::get($key);
        if ($value === null) {
            return $default;
        }
        return (int)$value;
    }
}
