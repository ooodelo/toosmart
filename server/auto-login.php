<?php
/**
 * Auto-login handler
 * Автоматический вход после успешной оплаты по одноразовому токену
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

$token = $_GET['token'] ?? '';

// Проверяем токен из сессии (одноразовый!)
if ($token &&
    isset($_SESSION['auto_login_token']) &&
    isset($_SESSION['auto_login_email']) &&
    hash_equals($_SESSION['auto_login_token'], $token)) {

    $email = $_SESSION['auto_login_email'];

    // Логируем автологин
    Security::secureLog('INFO', 'Auto-login successful', [
        'email_hash' => md5($email)
    ]);

    // Авторизуем пользователя
    $_SESSION['premium_user'] = $email;

    // Удаляем токен (одноразовый!)
    unset($_SESSION['auto_login_token']);
    unset($_SESSION['auto_login_email']);

    // Определяем куда редиректить (первая страница курса)
    $premiumHome = '/premium/course/p-1-osnova.html';

    // Пытаемся найти первую страницу из menu.json
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
                        $premiumHome = $first['url'];
                    }
                }
            }
        }
    }

    header("Location: $premiumHome");
    exit;
} else {
    // Токен недействителен или истек
    Security::secureLog('WARNING', 'Auto-login failed - invalid token', [
        'has_token' => !empty($token),
        'has_session_token' => isset($_SESSION['auto_login_token'])
    ]);

    header('Location: /server/?error=invalid_token');
    exit;
}
