<?php
/**
 * Premium Version - Authentication Middleware
 * Проверяет сессию перед показом HTML страниц
 *
 * SECURITY IMPROVEMENTS:
 * - Session timeout check
 * - Path traversal protection
 * - Proper file validation
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();

// Инициализация сессии с проверками безопасности
if (!Security::initSession()) {
    // Сессия истекла или невалидна
    header('Location: index.php?error=session_expired');
    exit;
}

// Проверка авторизации
if (!isset($_SESSION['premium_user'])) {
    Security::secureLog('WARNING', 'Unauthorized access attempt', [
        'page' => $_GET['page'] ?? 'unknown'
    ]);
    header('Location: index.php');
    exit;
}

// Получить запрошенную страницу
$page = $_GET['page'] ?? 'home';

// Валидация имени файла (защита от path traversal)
// Разрешены буквы, цифры, дефисы, подчеркивания и слеши (для вложенных путей)
if (!preg_match('/^[a-z0-9_\-\/]+$/i', $page) || strpos($page, '..') !== false) {
    Security::secureLog('WARNING', 'Invalid page name', [
        'page' => $page,
        'user' => $_SESSION['premium_user']
    ]);
    http_response_code(400);
    exit('Invalid page name');
}

// Путь к файлу
$file = __DIR__ . "/{$page}.html";

// Дополнительная проверка на path traversal
$realpath = realpath($file);
$basepath = realpath(__DIR__);

if ($realpath === false || strpos($realpath, $basepath) !== 0) {
    Security::secureLog('WARNING', 'Path traversal attempt', [
        'page' => $page,
        'user' => $_SESSION['premium_user'],
        'attempted_path' => $file
    ]);
    http_response_code(403);
    exit('Access denied');
}

// Проверка существования
if (!file_exists($file)) {
    Security::secureLog('INFO', 'Page not found', [
        'page' => $page,
        'user' => $_SESSION['premium_user']
    ]);

    http_response_code(404);
    echo '<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Страница не найдена</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            text-align: center;
            padding: 100px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        h1 { font-size: 72px; margin: 0; }
        p { font-size: 18px; margin: 20px 0; }
        a {
            color: white;
            background: rgba(255,255,255,0.2);
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            display: inline-block;
            margin-top: 20px;
        }
        a:hover { background: rgba(255,255,255,0.3); }
    </style>
</head>
<body>
    <h1>404</h1>
    <p>Страница не найдена</p>
    <p><a href="home.html">Вернуться на главную</a></p>
</body>
</html>';
    exit;
}

// Обновить время последней активности
$_SESSION['last_activity'] = time();

// Отдать содержимое файла
header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');

readfile($file);
?>