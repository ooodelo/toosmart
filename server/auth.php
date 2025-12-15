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
require_once __DIR__ . '/src/device_tracker.php';

Config::load();
Security::initSession();

function resolvePremiumHome(): string
{
    // 1) Пытаемся взять из собранного списка курса
    $menuPath = __DIR__ . '/../shared/menu.json';
    if (file_exists($menuPath)) {
        $json = @file_get_contents($menuPath);
        if ($json) {
            $data = json_decode($json, true);
            if (is_array($data)) {
                $courseItems = array_values(array_filter($data, function ($item) {
                    return isset($item['type']) && $item['type'] === 'course' && !empty($item['url']);
                }));
                if (!empty($courseItems)) {
                    usort($courseItems, function ($a, $b) {
                        $oa = $a['order'] ?? 0;
                        $ob = $b['order'] ?? 0;
                        return $oa <=> $ob;
                    });
                    $first = $courseItems[0];
                    if (!empty($first['url'])) {
                        return $first['url'];
                    }
                }
            }
        }
    }

    // 2) Фолбэк на первую страницу курса по маске
    $courseDir = __DIR__ . '/../premium/course';
    if (is_dir($courseDir)) {
        $files = array_values(array_filter(scandir($courseDir), function ($f) {
            return preg_match('/^p-\\d+-.*\\.html$/', $f);
        }));
        sort($files, SORT_NATURAL);
        if (!empty($files)) {
            return '/premium/course/' . $files[0];
        }
    }

    // 3) Самый последний фолбэк
    return '/premium/course/p-1-osnova.html';
}

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

// 5. ПОИСК ПОЛЬЗОВАТЕЛЯ И ПРОВЕРКА ПАРОЛЯ
require_once __DIR__ . '/Database.php';

try {
    $pdo = Database::getConnection();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $validated_email]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password_hash'])) {
        // УСПЕШНАЯ АВТОРИЗАЦИЯ
        $authenticated = true;

        // Регенерация ID сессии (защита от session fixation)
        Security::regenerateSession();

        // Установка данных сессии
        $_SESSION['premium_user'] = $validated_email;
        $_SESSION['login_time'] = time();
        $_SESSION['last_activity'] = time();

        // Установка cookie для клиентского JS (чтобы делать редирект с главной)
        setcookie('premium_access', '1', [
            'expires' => 0, // Session cookie
            'path' => '/',
            'secure' => true,
            'httponly' => false, // JS needs to read this
            'samesite' => 'Strict'
        ]);

        // Установка IP для дополнительной проверки (опционально)
        if (Config::getBool('SESSION_CHECK_IP', false)) {
            $_SESSION['user_ip'] = $_SERVER['REMOTE_ADDR'] ?? '';
        }

        // Отслеживание устройства и логирование входа
        $ip = Security::getClientIP();
        $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $device_info = track_device((int) $user['id'], $ip, $user_agent);
        log_login((int) $user['id'], $ip, $user_agent, true, $device_info['device_id']);
        update_last_login((int) $user['id']);

        $_SESSION['device_count'] = $device_info['device_count'];

        Security::secureLog('INFO', 'User logged in successfully', [
            'email' => $validated_email,
            'device_count' => $device_info['device_count'],
            'is_new_device' => $device_info['is_new']
        ]);

        // Редирект на главную страницу курса
        $premiumHome = resolvePremiumHome();
        header("Location: {$premiumHome}");
        exit;
    } else {
        // Неверный пароль или пользователь не найден
        Security::secureLog('WARNING', 'Invalid password or user not found', [
            'email' => $validated_email
        ]);
    }
} catch (Exception $e) {
    Security::secureLog('ERROR', 'Database error during login', ['error' => $e->getMessage()]);
    header('Location: index.php?error=system');
    exit;
}

// Если не авторизованы - неверные учетные данные
if (!$authenticated) {
    Security::secureLog('WARNING', 'Login failed', ['email' => $validated_email]);
    header('Location: index.php?error=invalid_credentials');
    exit;
}
?>