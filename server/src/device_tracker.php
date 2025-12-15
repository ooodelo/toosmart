<?php
/**
 * Device Tracker
 * Tracks user devices and login history
 */

require_once __DIR__ . '/config_loader.php';
require_once __DIR__ . '/../Database.php';

/**
 * Generate device hash from IP and User-Agent
 */
function generate_device_hash(string $ip, string $user_agent): string
{
    return hash('sha256', $ip . '|' . $user_agent);
}

/**
 * Track user device on login
 * Returns device_id and whether this is a new device
 * 
 * @return array ['device_id' => int, 'is_new' => bool, 'device_count' => int]
 */
function track_device(int $user_id, string $ip, string $user_agent): array
{
    $device_hash = generate_device_hash($ip, $user_agent);

    try {
        $pdo = Database::getConnection();

        // Check if device exists
        $stmt = $pdo->prepare("
            SELECT id FROM user_devices 
            WHERE user_id = ? AND device_hash = ?
        ");
        $stmt->execute([$user_id, $device_hash]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Update last_seen and increment login_count
            $stmt = $pdo->prepare("
                UPDATE user_devices 
                SET last_seen = NOW(), login_count = login_count + 1 
                WHERE id = ?
            ");
            $stmt->execute([$existing['id']]);
            $device_id = (int) $existing['id'];
            $is_new = false;
        } else {
            // Insert new device
            $stmt = $pdo->prepare("
                INSERT INTO user_devices 
                (user_id, device_hash, ip_address, user_agent, first_seen, last_seen)
                VALUES (?, ?, ?, ?, NOW(), NOW())
            ");
            $stmt->execute([$user_id, $device_hash, $ip, $user_agent]);
            $device_id = (int) $pdo->lastInsertId();
            $is_new = true;
        }

        // Count total devices for user
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM user_devices WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $count = $stmt->fetch();

        return [
            'device_id' => $device_id,
            'is_new' => $is_new,
            'device_count' => (int) ($count['cnt'] ?? 1)
        ];

    } catch (PDOException $e) {
        error_log("Device tracking error: " . $e->getMessage());
        return ['device_id' => null, 'is_new' => false, 'device_count' => 0];
    }
}

/**
 * Log login attempt
 */
function log_login(
    int $user_id,
    string $ip,
    string $user_agent,
    bool $success,
    ?int $device_id = null,
    ?string $failure_reason = null
): void {
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO login_history 
            (user_id, ip_address, user_agent, device_id, success, failure_reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $user_id,
            $ip,
            $user_agent,
            $device_id,
            $success ? 1 : 0,
            $failure_reason
        ]);
    } catch (PDOException $e) {
        error_log("Login logging error: " . $e->getMessage());
    }
}

/**
 * Update user's last_login timestamp
 */
function update_last_login(int $user_id): void
{
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user_id]);
    } catch (PDOException $e) {
        error_log("Last login update error: " . $e->getMessage());
    }
}

/**
 * Get device count for user
 */
function get_user_device_count(int $user_id): int
{
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM user_devices WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $result = $stmt->fetch();
        return (int) ($result['cnt'] ?? 0);
    } catch (PDOException $e) {
        return 0;
    }
}
