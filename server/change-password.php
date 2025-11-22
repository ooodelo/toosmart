<?php
/**
 * Change Password Handler (User Settings)
 * Allows authenticated users to change their password
 * 
 * Security features:
 * - Requires active session
 * - Verifies current password
 * - CSRF protection
 * - Password strength validation
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/Database.php';

Config::load();

// Инициализация сессии с проверками безопасности
if (!Security::initSession()) {
    header('Location: index.php?error=session_expired');
    exit;
}

// Проверка авторизации
if (!isset($_SESSION['premium_user'])) {
    Security::secureLog('WARNING', 'Unauthorized access attempt to change password');
    header('Location: index.php');
    exit;
}

$user_email = $_SESSION['premium_user'];

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: settings.html?error=invalid_method');
    exit;
}

// Get form data
$current_password = $_POST['current_password'] ?? '';
$new_password = $_POST['new_password'] ?? '';
$confirm_password = $_POST['confirm_password'] ?? '';
$csrf_token = $_POST['csrf_token'] ?? '';

// 1. CSRF PROTECTION
if (!Security::validateCSRFToken($csrf_token)) {
    Security::secureLog('WARNING', 'CSRF validation failed in change password', [
        'email' => $user_email
    ]);
    header('Location: settings.html?error=csrf');
    exit;
}

// 2. VALIDATE PASSWORDS
if (strlen($current_password) < 6 || strlen($current_password) > 128) {
    header('Location: settings.html?error=invalid_current_password');
    exit;
}

if (strlen($new_password) < 6 || strlen($new_password) > 128) {
    header('Location: settings.html?error=invalid_new_password');
    exit;
}

// 3. CHECK PASSWORD MATCH
if ($new_password !== $confirm_password) {
    header('Location: settings.html?error=password_mismatch');
    exit;
}

// 4. NEW PASSWORD MUST BE DIFFERENT
if ($current_password === $new_password) {
    header('Location: settings.html?error=same_password');
    exit;
}

try {
    $pdo = Database::getConnection();

    // 5. GET CURRENT USER
    $stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $user_email]);
    $user = $stmt->fetch();

    if (!$user) {
        Security::secureLog('ERROR', 'User not found during password change', [
            'email' => $user_email
        ]);
        header('Location: index.php?error=session_expired');
        // Destroy session for safety
        session_destroy();
        exit;
    }

    // 6. VERIFY CURRENT PASSWORD
    if (!password_verify($current_password, $user['password_hash'])) {
        Security::secureLog('WARNING', 'Incorrect current password in change attempt', [
            'email' => $user_email
        ]);
        header('Location: settings.html?error=wrong_current_password');
        exit;
    }

    // 7. UPDATE TO NEW PASSWORD
    $new_password_hash = password_hash($new_password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("UPDATE users SET password_hash = :password_hash WHERE id = :user_id");
    $stmt->execute([
        ':password_hash' => $new_password_hash,
        ':user_id' => $user['id']
    ]);

    Security::secureLog('INFO', 'Password changed successfully', [
        'email' => $user_email,
        'user_id' => $user['id']
    ]);

    // Redirect with success message
    header('Location: settings.html?success=password_changed');
    exit;

} catch (Exception $e) {
    Security::secureLog('ERROR', 'Database error in password change', [
        'error' => $e->getMessage(),
        'email' => $user_email
    ]);
    header('Location: settings.html?error=system');
    exit;
}
?>