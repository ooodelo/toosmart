<?php
/**
 * Password History
 * Tracks password changes for security
 */

require_once __DIR__ . '/config_loader.php';
require_once __DIR__ . '/../Database.php';

/**
 * Save old password hash to history before changing
 */
function save_password_history(int $user_id, ?string $old_password_hash, ?string $ip = null): void
{
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO password_history 
            (user_id, old_password_hash, changed_at, changed_by_ip)
            VALUES (?, ?, NOW(), ?)
        ");
        $stmt->execute([$user_id, $old_password_hash, $ip]);
    } catch (PDOException $e) {
        error_log("Password history save error: " . $e->getMessage());
    }
}

/**
 * Get password change count for user
 */
function get_password_change_count(int $user_id): int
{
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM password_history WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $result = $stmt->fetch();
        return (int) ($result['cnt'] ?? 0);
    } catch (PDOException $e) {
        return 0;
    }
}
