<?php
/**
 * Premium Version - Login Form
 * Форма входа в закрытую версию курса
 */
session_start();

// Если уже авторизован → редирект на главную
if (isset($_SESSION['premium_user'])) {
    header('Location: home.html');
    exit;
}

$error = $_GET['error'] ?? '';
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
        .error {
            background: #ffebee;
            color: #c62828;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            text-align: center;
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
    </style>
</head>
<body class="auth-page">
    <div class="auth-container">
        <img src="../free/assets/CleanLogo.svg" alt="Clean" class="auth-logo">

        <h1>Вход в закрытую версию курса</h1>
        <p>Введите данные, отправленные на email после оплаты</p>

        <?php if ($error === '1'): ?>
            <div class="error">❌ Неверный email или пароль</div>
        <?php endif; ?>

        <form action="auth.php" method="POST" class="auth-form">
            <input type="email"
                   name="email"
                   placeholder="Email"
                   required
                   autofocus
                   autocomplete="email">
            <input type="password"
                   name="password"
                   placeholder="Пароль из письма"
                   required
                   autocomplete="current-password">
            <button type="submit">Войти в курс</button>
        </form>

        <div class="help-text">
            Еще нет доступа? <a href="/free/">Вернуться к бесплатной версии</a><br>
            Проблемы со входом? <a href="mailto:support@toosmart.com">Напишите нам</a>
        </div>
    </div>
</body>
</html>
