<?php
/**
 * Migration Script: JSON to SQLite
 */

require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/Database.php';

echo "Starting migration...\n";

$jsonFile = __DIR__ . '/../../private/users.json';

if (!file_exists($jsonFile)) {
    die("No users.json found. Skipping migration.\n");
}

$jsonContent = file_get_contents($jsonFile);
$users = json_decode($jsonContent, true);

if (!is_array($users)) {
    die("Invalid JSON format.\n");
}

$pdo = Database::getConnection();
$stmt = $pdo->prepare("INSERT OR IGNORE INTO users (email, password_hash, created_at, invoice_id, amount) VALUES (:email, :password_hash, :created_at, :invoice_id, :amount)");

$count = 0;
$pdo->beginTransaction();

try {
    foreach ($users as $user) {
        $stmt->execute([
            ':email' => $user['email'],
            ':password_hash' => $user['password_hash'],
            ':created_at' => $user['created_at'] ?? date('Y-m-d H:i:s'),
            ':invoice_id' => $user['invoice_id'] ?? null,
            ':amount' => $user['amount'] ?? 0
        ]);
        $count++;
    }
    $pdo->commit();
    echo "Successfully migrated $count users.\n";
} catch (Exception $e) {
    $pdo->rollBack();
    die("Migration failed: " . $e->getMessage() . "\n");
}
