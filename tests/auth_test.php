<?php
/**
 * Basic Auth Test
 */

require_once __DIR__ . '/../server/Database.php';
require_once __DIR__ . '/../server/security.php';

echo "Running Auth Tests...\n";

// Mock Config
class MockConfig
{
    public static function getPath($key)
    {
        return __DIR__ . '/../private/test_database.sqlite';
    }
}

// 1. Test Database Connection
try {
    $pdo = Database::getConnection();
    echo "✅ Database connection successful\n";
} catch (Exception $e) {
    die("❌ Database connection failed: " . $e->getMessage() . "\n");
}

// 2. Test Password Hashing
$password = "secret123";
$hash = password_hash($password, PASSWORD_DEFAULT);
if (password_verify($password, $hash)) {
    echo "✅ Password hashing works\n";
} else {
    echo "❌ Password hashing failed\n";
}

// 3. Test CSRF Token Generation
$_SESSION = [];
$token = Security::generateCSRFToken();
if (!empty($token) && strlen($token) === 64) {
    echo "✅ CSRF Token generation works\n";
} else {
    echo "❌ CSRF Token generation failed\n";
}

echo "Tests completed.\n";
