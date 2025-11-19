<?php
/**
 * Database Connection Wrapper
 * Handles SQLite connection and schema initialization
 */

require_once __DIR__ . '/config.php';

class Database
{
    private static $pdo = null;

    public static function getConnection()
    {
        if (self::$pdo === null) {
            try {
                $dbPath = Config::getPath('db');
                $dir = dirname($dbPath);

                if (!is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }

                self::$pdo = new PDO("sqlite:$dbPath");
                self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

                // Initialize schema if needed
                self::initSchema();

            } catch (PDOException $e) {
                error_log("Database connection error: " . $e->getMessage());
                throw new Exception("Database error");
            }
        }
        return self::$pdo;
    }

    private static function initSchema()
    {
        $sql = "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            invoice_id TEXT,
            amount REAL
        );
        
        CREATE INDEX IF NOT EXISTS idx_email ON users(email);";

        self::$pdo->exec($sql);
    }
}
