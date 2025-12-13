<?php
/**
 * Reset Password Handler
 * Validates token and updates user password
 * 
 * Security features:
 * - Token validation
 * - Expiry check
 * - Password strength validation
 * - CSRF protection
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/src/password_history.php';
require_once __DIR__ . '/src/mailer.php';

Config::load();
Security::initSession();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php?error=invalid_method');
    exit;
}

// Get form data
$token = trim($_POST['token'] ?? '');
$new_password = $_POST['new_password'] ?? '';
$confirm_password = $_POST['confirm_password'] ?? '';
$csrf_token = $_POST['csrf_token'] ?? '';

// 1. CSRF PROTECTION
if (!Security::validateCSRFToken($csrf_token)) {
    Security::secureLog('WARNING', 'CSRF validation failed in reset password', [
        'ip' => Security::getClientIP()
    ]);
    header('Location: reset-password-form.php?token=' . urlencode($token) . '&error=csrf');
    exit;
}

// 2. VALIDATE TOKEN FORMAT
if (strlen($token) !== 64 || !ctype_xdigit($token)) {
    Security::secureLog('WARNING', 'Invalid token format in reset password', [
        'token_length' => strlen($token)
    ]);
    header('Location: index.php?error=invalid_token');
    exit;
}

// 3. VALIDATE PASSWORD
if (strlen($new_password) < 6 || strlen($new_password) > 128) {
    header('Location: reset-password-form.php?token=' . urlencode($token) . '&error=invalid_password');
    exit;
}

// 4. CHECK PASSWORD MATCH
if ($new_password !== $confirm_password) {
    header('Location: reset-password-form.php?token=' . urlencode($token) . '&error=password_mismatch');
    exit;
}

try {
    $pdo = Database::getConnection();
    $pdo->beginTransaction();

    // 5. VALIDATE TOKEN AND CHECK EXPIRY
    $stmt = $pdo->prepare("
        SELECT user_id, expires_at, consumed_at 
        FROM password_reset_tokens 
        WHERE token = :token 
        LIMIT 1
    ");
    $stmt->execute([':token' => $token]);
    $token_data = $stmt->fetch();

    if (!$token_data) {
        Security::secureLog('WARNING', 'Non-existent token used in reset password');
        header('Location: index.php?error=invalid_token');
        exit;
    }

    // Check if already consumed
    if ($token_data['consumed_at'] !== null) {
        Security::secureLog('WARNING', 'Already consumed token used in reset password', [
            'user_id' => $token_data['user_id']
        ]);
        header('Location: index.php?error=token_used');
        exit;
    }

    // Check if expired
    if (strtotime($token_data['expires_at']) < time()) {
        Security::secureLog('WARNING', 'Expired token used in reset password', [
            'user_id' => $token_data['user_id'],
            'expires_at' => $token_data['expires_at']
        ]);
        header('Location: index.php?error=token_expired');
        exit;
    }

    $user_id = $token_data['user_id'];

    // Получаем текущий хеш пароля и email для истории
    $stmt = $pdo->prepare("SELECT email, password_hash FROM users WHERE id = :user_id LIMIT 1");
    $stmt->execute([':user_id' => $user_id]);
    $user_data = $stmt->fetch();
    $old_password_hash = $user_data['password_hash'] ?? null;
    $user_email = $user_data['email'] ?? '';

    // 6. Сохраняем старый пароль в историю
    save_password_history($user_id, $old_password_hash, Security::getClientIP());

    // 7. UPDATE PASSWORD
    $password_hash = password_hash($new_password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("UPDATE users SET password_hash = :password_hash WHERE id = :user_id");
    $stmt->execute([
        ':password_hash' => $password_hash,
        ':user_id' => $user_id
    ]);

    // 8. MARK TOKEN AS CONSUMED
    $stmt = $pdo->prepare("UPDATE password_reset_tokens SET consumed_at = NOW() WHERE token = :token");
    $stmt->execute([':token' => $token]);

    $pdo->commit();

    // 9. Отправляем email о смене пароля
    $cfg = require __DIR__ . '/src/config_loader.php';
    $site_url = $cfg['site']['base_url'] ?? 'https://toosmart.ru';

    $subject = 'Пароль изменён - TooSmart';
    $message = "
Здравствуйте!

Ваш пароль для доступа к курсу «Clean - Теория правильной уборки» был успешно изменён.

Если вы не меняли пароль, срочно свяжитесь с нами!

Ссылка для входа: $site_url/server/

С уважением,
Команда TooSmart
";

    send_mail($user_email, $subject, $message, null, 'password_changed', $user_id);

    Security::secureLog('INFO', 'Password successfully reset', [
        'user_id' => $user_id
    ]);

    // Redirect to login with success message
    header('Location: index.php?success=password_reset');
    exit;

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    Security::secureLog('ERROR', 'Database error in reset password', ['error' => $e->getMessage()]);
    header('Location: reset-password-form.php?token=' . urlencode($token) . '&error=system');
    exit;
}
?>