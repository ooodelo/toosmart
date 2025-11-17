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
        $time = (int)($_GET['time'] ?? 0);
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
    <style>
        .auth-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        .auth-container {
            background: white;
            padding: 48px;
            border-radius: 16px;
            max-width: 440px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .auth-logo {
            display: block;
            margin: 0 auto 24px;
            max-width: 200px;
        }
        .auth-container h1 {
            text-align: center;
            margin-bottom: 12px;
            font-size: 24px;
            color: #333;
        }
        .auth-container > p {
            text-align: center;
            color: #666;
            margin-bottom: 32px;
        }
        .auth-form input {
            width: 100%;
            padding: 14px;
            margin-bottom: 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.2s;
            box-sizing: border-box;
        }
        .auth-form input:focus {
            border-color: #667eea;
            outline: none;
        }
        .auth-form button {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .auth-form button:hover {
            transform: translateY(-2px);
        }
        .auth-form button:active {
            transform: translateY(0);
        }
        .auth-form button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .error {
            background: #ffebee;
            color: #c62828;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            text-align: center;
            border-left: 4px solid #c62828;
        }
        .help-text {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid #e0e0e0;
        }
        .help-text a {
            color: #667eea;
            text-decoration: none;
        }
        .help-text a:hover {
            text-decoration: underline;
        }
        @media (max-width: 480px) {
            .auth-container {
                padding: 32px 24px;
            }
        }
    </style>
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

            <input type="email"
                   name="email"
                   placeholder="Email"
                   required
                   autofocus
                   autocomplete="email"
                   maxlength="255">

            <input type="password"
                   name="password"
                   placeholder="Пароль из письма"
                   required
                   autocomplete="current-password"
                   minlength="6"
                   maxlength="128">

            <button type="submit">Войти в курс</button>
        </form>

        <div class="help-text">
            Еще нет доступа? <a href="/free/">Вернуться к бесплатной версии</a><br>
            Проблемы со входом? <a href="mailto:<?= htmlspecialchars(Config::get('MAIL_REPLY_TO', 'support@toosmart.com'), ENT_QUOTES, 'UTF-8') ?>">Напишите нам</a>
        </div>
    </div>
</body>
</html>
