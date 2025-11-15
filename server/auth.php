<?php
/**
 * Premium Version - Authentication Handler
 * Проверка email и пароля пользователя
 */
session_start();

$email = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

// Путь к базе пользователей (ВНЕ public_html!)
// Измените путь в соответствии с вашим хостингом
$users_file = __DIR__ . '/../../private/users.json';

// Проверка существования файла
if (!file_exists($users_file)) {
    error_log('Users file not found: ' . $users_file);
    header('Location: index.php?error=1');
    exit;
}

// Чтение базы пользователей
$users_json = file_get_contents($users_file);
$users = json_decode($users_json, true);

if (!$users || !is_array($users)) {
    error_log('Invalid users.json format');
    header('Location: index.php?error=1');
    exit;
}

// Поиск пользователя и проверка пароля
foreach ($users as $user) {
    if ($user['email'] === $email && password_verify($password, $user['password_hash'])) {
        // Успешная авторизация
        $_SESSION['premium_user'] = $email;
        $_SESSION['login_time'] = time();

        // Обновить время последнего входа (опционально)
        // можно добавить логику обновления users.json

        // Редирект на главную страницу курса
        header('Location: home.html');
        exit;
    }
}

// Неверные учетные данные
header('Location: index.php?error=1');
exit;
?>
