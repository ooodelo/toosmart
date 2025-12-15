<?php
/**
 * Email Logger
 * Logs all sent emails to email_logs table
 */

require_once __DIR__ . '/config_loader.php';
require_once __DIR__ . '/../Database.php';

/**
 * Log email sending attempt
 * 
 * @param int|null $user_id User ID if known
 * @param string $to Recipient email
 * @param string $subject Email subject
 * @param string $type Email type: welcome, password_reset, password_changed, email_verification, other
 * @param bool $success Whether email was sent successfully
 * @param string|null $error Error message if failed
 */
function log_email(
    ?int $user_id,
    string $to,
    string $subject,
    string $type = 'other',
    bool $success = true,
    ?string $error = null
): void {
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO email_logs 
            (user_id, recipient_email, subject, email_type, status, error_message, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $user_id,
            $to,
            $subject,
            $type,
            $success ? 'sent' : 'failed',
            $error
        ]);
    } catch (PDOException $e) {
        error_log("Failed to log email: " . $e->getMessage());
    }
}

/**
 * Get user ID by email
 */
function get_user_id_by_email(string $email): ?int
{
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        return $user ? (int) $user['id'] : null;
    } catch (PDOException $e) {
        return null;
    }
}
