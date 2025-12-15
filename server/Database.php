<?php
/**
 * Database Connection Wrapper
 * MySQL connection using settings from config_loader
 */

require_once __DIR__ . '/src/config_loader.php';

class Database
{
    private static $pdo = null;

    /**
     * Get PDO connection to MySQL
     */
    public static function getConnection()
    {
        if (self::$pdo === null) {
            $config = require __DIR__ . '/src/config_loader.php';

            $dsn = $config['db']['dsn'] ?? 'mysql:host=localhost;dbname=toosmart;charset=utf8mb4';
            $user = $config['db']['user'] ?? '';
            $pass = $config['db']['pass'] ?? '';

            try {
                self::$pdo = new PDO($dsn, $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
                ]);

            } catch (PDOException $e) {
                error_log("Database connection error: " . $e->getMessage());
                throw new Exception("Database connection failed");
            }
        }
        return self::$pdo;
    }

    /**
     * Initialize database schema
     */
    public static function initSchema()
    {
        $pdo = self::getConnection();
        $schemaFile = __DIR__ . '/sql/schema.sql';

        if (file_exists($schemaFile)) {
            $sql = file_get_contents($schemaFile);
            // Split by semicolon to execute multiple statements
            $statements = array_filter(array_map('trim', explode(';', $sql)));

            foreach ($statements as $statement) {
                if (!empty($statement) && !str_starts_with($statement, '--')) {
                    try {
                        $pdo->exec($statement);
                    } catch (PDOException $e) {
                        // Ignore "table already exists" errors
                        if (strpos($e->getMessage(), 'already exists') === false) {
                            error_log("Schema init error: " . $e->getMessage());
                        }
                    }
                }
            }
        }
    }

    /**
     * Check if connection is alive
     */
    public static function isConnected(): bool
    {
        try {
            $pdo = self::getConnection();
            $pdo->query("SELECT 1");
            return true;
        } catch (Exception $e) {
            return false;
        }
    }
}
