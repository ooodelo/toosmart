<?php
/**
 * Premium Version - Login Form
 * Форма входа в закрытую версию курса
 *
 * SECURITY IMPROVEMENTS:
 * - CSRF token generation
 * - Better error messages
 * - Rate limit display
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Если уже авторизован → редирект на главную
if (isset($_SESSION['premium_user'])) {
    header('Location: home.html');
    exit;
}

// Генерация CSRF токена
$csrf_token = Security::generateCSRFToken();

// Получение кода ошибки
$error = $_GET['error'] ?? '';
$errorMessage = '';

switch ($error) {
    case 'invalid_credentials':
        $errorMessage = 'Неверный email или пароль';
        break;
    case 'invalid_email':
        $errorMessage = 'Некорректный формат email';
        break;
    case 'invalid_password':
        $errorMessage = 'Некорректный пароль';
        break;
    case 'csrf':
        $errorMessage = 'Ошибка безопасности. Обновите страницу и попробуйте снова.';
        break;
    case 'rate_limit':
        $time = (int) ($_GET['time'] ?? 0);
        $minutes = ceil($time / 60);
        $errorMessage = "Слишком много попыток входа. Попробуйте через $minutes мин.";
        break;
    case 'session_expired':
        $errorMessage = 'Сессия истекла. Войдите снова.';
        break;
    case 'system':
        $errorMessage = 'Системная ошибка. Попробуйте позже.';
        break;
    case '1':
        // Для обратной совместимости
        $errorMessage = 'Неверный email или пароль';
        break;
}
?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Вход в закрытую версию курса</title>
    <link rel="stylesheet" href="../free/styles.css">
    <link rel="stylesheet" href="assets/auth.css">
</head>

<body class="auth-page">
    <div class="auth-container">
        <img src="../free/assets/CleanLogo.svg" alt="Clean" class="auth-logo">

        <h1>Вход в закрытую версию курса</h1>
        <p>Введите данные, отправленные на email после оплаты</p>

        <?php if ($errorMessage): ?>
            <div class="error" role="alert">⚠️ <?= htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8') ?></div>
        <?php endif; ?>

        <form action="auth.php" method="POST" class="auth-form">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">

            <input type="email" name="email" placeholder="Email" required autofocus autocomplete="email"
                maxlength="255">

            <input type="password" name="password" placeholder="Пароль из письма" required
                autocomplete="current-password" minlength="6" maxlength="128">

            <button type="submit">Войти в курс</button>
        </form>

        <div class="help-text">
            Еще нет доступа? <a href="/free/">Вернуться к бесплатной версии</a><br>
            Проблемы со входом? <a
                href="mailto:<?= htmlspecialchars(Config::get('MAIL_REPLY_TO', 'support@toosmart.com'), ENT_QUOTES, 'UTF-8') ?>">Напишите
                нам</a>
        </div>
    </div>
</body>

</html>