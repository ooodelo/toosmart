<?php
/**
 * Resend Password Handler
 * Generates new password and sends to user
 * Use when user lost initial password email
 * 
 * Security features:
 * - Rate limiting (max 2 per hour)
 * - CSRF protection
 * - Email validation
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/Database.php';

Config::load();
Security::initSession();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: resend-password.html?error=invalid_method');
    exit;
}

// Get form data
$email = trim($_POST['email'] ?? '');
$csrf_token = $_POST['csrf_token'] ?? '';

// 1. CSRF PROTECTION
if (!Security::validateCSRFToken($csrf_token)) {
    Security::secureLog('WARNING', 'CSRF validation failed in resend password', [
        'email' => $email,
        'ip' => Security::getClientIP()
    ]);
    header('Location: resend-password.html?error=csrf');
    exit;
}

// 2. EMAIL VALIDATION
$validated_email = Security::validateEmail($email);
if (!$validated_email) {
    Security::secureLog('WARNING', 'Invalid email format in resend password', ['email' => $email]);
    header('Location: resend-password.html?error=invalid_email');
    exit;
}

// 3. RATE LIMITING (max 2 requests per hour = 3600 seconds)
if (!Security::checkRateLimit('resend_password_' . $validated_email, 2, 3600)) {
    $timeRemaining = Security::getRateLimitTimeRemaining('resend_password_' . $validated_email);
    Security::secureLog('WARNING', 'Rate limit exceeded for resend password', [
        'email' => $validated_email,
        'time_remaining' => $timeRemaining
    ]);
    header("Location: resend-password.html?error=rate_limit&time=$timeRemaining");
    exit;
}

try {
    $pdo = Database::getConnection();

    // 4. CHECK IF USER EXISTS
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $validated_email]);
    $user = $stmt->fetch();

    if (!$user) {
        // Security: Don't reveal if email exists or not
        Security::secureLog('INFO', 'Password resend requested for non-existent email', [
            'email_hash' => md5($validated_email)
        ]);
        // Still show success message to prevent email enumeration
        header('Location: resend-password.html?success=1');
        exit;
    }

    $user_id = $user['id'];

    // 5. GENERATE NEW PASSWORD
    $new_password = Security::generatePassword(16);
    $password_hash = password_hash($new_password, PASSWORD_DEFAULT);

    // 6. UPDATE PASSWORD IN DATABASE
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("UPDATE users SET password_hash = :password_hash WHERE id = :user_id");
    $stmt->execute([
        ':password_hash' => $password_hash,
        ':user_id' => $user_id
    ]);

    $pdo->commit();

    Security::secureLog('INFO', 'New password generated for resend request', [
        'email_hash' => md5($validated_email),
        'user_id' => $user_id
    ]);

    // 7. SEND EMAIL WITH NEW PASSWORD
    $site_url = Config::get('SITE_URL', 'https://toosmart.com');
    $mail_from = Config::get('MAIL_FROM', 'noreply@toosmart.com');
    $mail_reply_to = Config::get('MAIL_REPLY_TO', 'support@toosmart.com');

    $subject = 'Ваш новый пароль - Clean';
    $message = "
Здравствуйте!

Вы запросили повторную отправку пароля для доступа к курсу «Clean - Теория правильной уборки».

Ваши данные для входа в закрытую версию:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: $validated_email
Новый пароль: $new_password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ссылка для входа: $site_url/premium/

⚠️ ВАЖНО: Сохраните это письмо - пароль больше нигде не отображается.

После входа вы можете изменить пароль в настройках профиля.

С уважением,
Команда TooSmart
";

    $headers = [];
    $headers[] = "From: $mail_from";
    $headers[] = "Reply-To: $mail_reply_to";
    $headers[] = "Content-Type: text/plain; charset=UTF-8";
    $headers[] = "X-Mailer: PHP/" . phpversion();

    if (mail($validated_email, $subject, $message, implode("\r\n", $headers))) {
        Security::secureLog('INFO', 'Resend password email sent', [
            'email_hash' => md5($validated_email),
            'user_id' => $user_id
        ]);
    } else {
        Security::secureLog('ERROR', 'Failed to send resend password email', [
            'email_hash' => md5($validated_email),
            'user_id' => $user_id
        ]);
    }

    // Always show success to prevent email enumeration
    header('Location: resend-password.html?success=1');
    exit;

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    Security::secureLog('ERROR', 'Database error in resend password', ['error' => $e->getMessage()]);
    header('Location: resend-password.html?error=system');
    exit;
}
?>