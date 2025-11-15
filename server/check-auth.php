<?php
/**
 * Premium Version - Authentication Middleware
 * Проверяет сессию перед показом HTML страниц
 */
session_start();

// Проверка авторизации
if (!isset($_SESSION['premium_user'])) {
    header('Location: index.php');
    exit;
}

// Получить запрошенную страницу
$page = $_GET['page'] ?? 'home';

// Валидация имени файла (защита от path traversal)
if (preg_match('/[^a-z0-9_-]/i', $page)) {
    header('HTTP/1.0 400 Bad Request');
    exit('Invalid page name');
}

// Путь к файлу
$file = __DIR__ . "/{$page}.html";

// Проверка существования
if (!file_exists($file)) {
    header('HTTP/1.0 404 Not Found');
    echo '<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Страница не найдена</title>
    <style>
        body { font-family: sans-serif; text-align: center; padding: 100px; }
        h1 { color: #667eea; }
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

// Отдать содержимое файла
header('Content-Type: text/html; charset=UTF-8');
readfile($file);
?>
