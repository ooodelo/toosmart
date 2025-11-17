<?php
/**
 * Premium Version - Authentication Handler
 * Проверка email и пароля пользователя
 *
 * SECURITY IMPROVEMENTS:
 * - CSRF protection
 * - Rate limiting (5 attempts per 15 minutes)
 * - Email validation
 * - Password length validation
 * - Session regeneration after login
 * - Secure logging
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Получить данные из POST
$email = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';
$csrf_token = $_POST['csrf_token'] ?? '';

// 1. CSRF PROTECTION
if (!Security::validateCSRFToken($csrf_token)) {
    Security::secureLog('WARNING', 'CSRF validation failed', [
        'email' => $email,
        'ip' => Security::getClientIP()
    ]);
    header('Location: index.php?error=csrf');
    exit;
}

// 2. EMAIL VALIDATION
$validated_email = Security::validateEmail($email);
if (!$validated_email) {
    Security::secureLog('WARNING', 'Invalid email format', ['email' => $email]);
    header('Location: index.php?error=invalid_email');
    exit;
}

// 3. PASSWORD LENGTH VALIDATION
if (strlen($password) < 6 || strlen($password) > 128) {
    Security::secureLog('WARNING', 'Invalid password length', ['email' => $validated_email]);
    header('Location: index.php?error=invalid_password');
    exit;
}

// 4. RATE LIMITING (защита от брутфорса)
if (!Security::checkRateLimit($validated_email)) {
    $timeRemaining = Security::getRateLimitTimeRemaining($validated_email);
    Security::secureLog('WARNING', 'Rate limit exceeded', [
        'email' => $validated_email,
        'time_remaining' => $timeRemaining
    ]);
    header("Location: index.php?error=rate_limit&time=$timeRemaining");
    exit;
}

// 5. ЗАГРУЗКА БАЗЫ ПОЛЬЗОВАТЕЛЕЙ
$users_file = Config::get('USERS_FILE_PATH', __DIR__ . '/../../private/users.json');

if (!file_exists($users_file)) {
    Security::secureLog('ERROR', 'Users file not found', ['path' => $users_file]);
    header('Location: index.php?error=system');
    exit;
}

// Чтение базы пользователей с блокировкой
$fp = fopen($users_file, 'r');
if (!$fp) {
    Security::secureLog('ERROR', 'Cannot open users file', ['path' => $users_file]);
    header('Location: index.php?error=system');
    exit;
}

if (flock($fp, LOCK_SH)) {
    $users_json = stream_get_contents($fp);
    flock($fp, LOCK_UN);
} else {
    Security::secureLog('ERROR', 'Cannot lock users file', ['path' => $users_file]);
    fclose($fp);
    header('Location: index.php?error=system');
    exit;
}

fclose($fp);

$users = json_decode($users_json, true);

if (!$users || !is_array($users)) {
    Security::secureLog('ERROR', 'Invalid users.json format');
    header('Location: index.php?error=system');
    exit;
}

// 6. ПОИСК ПОЛЬЗОВАТЕЛЯ И ПРОВЕРКА ПАРОЛЯ
$authenticated = false;
foreach ($users as $user) {
    if ($user['email'] === $validated_email) {
        if (password_verify($password, $user['password_hash'])) {
            // УСПЕШНАЯ АВТОРИЗАЦИЯ
            $authenticated = true;

            // Регенерация ID сессии (защита от session fixation)
            Security::regenerateSession();

            // Установка данных сессии
            $_SESSION['premium_user'] = $validated_email;
            $_SESSION['login_time'] = time();
            $_SESSION['last_activity'] = time();

            // Установка IP для дополнительной проверки (опционально)
            if (Config::getBool('SESSION_CHECK_IP', false)) {
                $_SESSION['user_ip'] = $_SERVER['REMOTE_ADDR'] ?? '';
            }

            Security::secureLog('INFO', 'User logged in successfully', [
                'email' => $validated_email
            ]);

            // Редирект на главную страницу курса
            header('Location: home.html');
            exit;
        } else {
            // Неверный пароль
            Security::secureLog('WARNING', 'Invalid password attempt', [
                'email' => $validated_email
            ]);
            break;
        }
    }
}

// Если не авторизованы - неверные учетные данные
if (!$authenticated) {
    Security::secureLog('WARNING', 'Login failed', ['email' => $validated_email]);
    header('Location: index.php?error=invalid_credentials');
    exit;
}
?>
