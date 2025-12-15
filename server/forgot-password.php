<?php
/**
 * Forgot Password Handler
 * Sends password reset email with token
 * 
 * Security features:
 * - Rate limiting (max 3 requests per 15 minutes)
 * - CSRF protection
 * - Email validation
 * - Secure token generation
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/src/mailer.php';

Config::load();
Security::initSession();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: forgot-password-form.php?error=invalid_method');
    exit;
}

// Get form data
$email = trim($_POST['email'] ?? '');
$csrf_token = $_POST['csrf_token'] ?? '';

// 1. CSRF PROTECTION
if (!Security::validateCSRFToken($csrf_token)) {
    Security::secureLog('WARNING', 'CSRF validation failed in forgot password', [
        'email' => $email,
        'ip' => Security::getClientIP()
    ]);
    header('Location: forgot-password-form.php?error=csrf');
    exit;
}

// 2. EMAIL VALIDATION
$validated_email = Security::validateEmail($email);
if (!$validated_email) {
    Security::secureLog('WARNING', 'Invalid email format in forgot password', ['email' => $email]);
    header('Location: forgot-password-form.php?error=invalid_email');
    exit;
}

// 3. RATE LIMITING (max 3 requests per 15 minutes)
if (!Security::checkRateLimit('forgot_password_' . $validated_email, 3, 900)) {
    $timeRemaining = Security::getRateLimitTimeRemaining('forgot_password_' . $validated_email);
    Security::secureLog('WARNING', 'Rate limit exceeded for forgot password', [
        'email' => $validated_email,
        'time_remaining' => $timeRemaining
    ]);
    header("Location: forgot-password-form.php?error=rate_limit&time=$timeRemaining");
    exit;
}

try {
    $pdo = Database::getConnection();

    // 4. CHECK IF USER EXISTS
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $validated_email]);
    $user = $stmt->fetch();

    if (!$user) {
        // Security: Don't reveal if email exists or not (timing-safe)
        Security::secureLog('INFO', 'Password reset requested for non-existent email', [
            'email_hash' => md5($validated_email)
        ]);
        // Still show success message to prevent email enumeration
        header('Location: forgot-password-form.php?success=1');
        exit;
    }

    $user_id = $user['id'];

    // 5. GENERATE SECURE TOKEN
    $token = bin2hex(random_bytes(32)); // 64 character hex string
    $expires_at = date('Y-m-d H:i:s', time() + 3600); // 1 hour from now

    // 6. STORE TOKEN IN DATABASE
    $pdo->beginTransaction();

    // Invalidate any existing tokens for this user
    $stmt = $pdo->prepare("UPDATE password_reset_tokens SET consumed_at = NOW() WHERE user_id = :user_id AND consumed_at IS NULL");
    $stmt->execute([':user_id' => $user_id]);

    // Create new token
    $stmt = $pdo->prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (:user_id, :token, :expires_at)");
    $stmt->execute([
        ':user_id' => $user_id,
        ':token' => $token,
        ':expires_at' => $expires_at
    ]);

    $pdo->commit();

    // 7. SEND EMAIL WITH RESET LINK via SMTP
    $cfg = require __DIR__ . '/src/config_loader.php';
    $site_url = $cfg['site']['base_url'] ?? 'https://toosmart.ru';

    $reset_link = "$site_url/server/reset-password-form.php?token=$token";

    $subject = 'Восстановление пароля - Clean';
    $message = "
Здравствуйте!

Вы (или кто-то другой) запросили восстановление пароля для доступа к курсу «Clean - Теория правильной уборки».

Чтобы установить новый пароль, перейдите по ссылке:
$reset_link

⚠️ Ссылка действительна в течение 1 часа.

Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.

С уважением,
Команда TooSmart
";

    if (send_mail($validated_email, $subject, $message, null, 'password_reset', $user_id)) {
        Security::secureLog('INFO', 'Password reset email sent via SMTP', [
            'email_hash' => md5($validated_email),
            'user_id' => $user_id
        ]);
    } else {
        Security::secureLog('ERROR', 'Failed to send password reset email', [
            'email_hash' => md5($validated_email),
            'user_id' => $user_id
        ]);
    }

    // Always show success to prevent email enumeration
    header('Location: forgot-password-form.php?success=1');
    exit;

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    Security::secureLog('ERROR', 'Database error in forgot password', ['error' => $e->getMessage()]);
    header('Location: forgot-password-form.php?error=system');
    exit;
}
?>