<?php
/**
 * Robokassa Success URL - страница после успешной оплаты
 * URL в настройках Robokassa: https://toosmart.com/premium/success.php
 * 
 * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ:
 * - Показывает пароль сразу после оплаты
 * - Пароль хранится в сессии временно
 * - Очищается после просмотра
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Получить данные из сессии (установлены robokassa-callback.php)
$password = $_SESSION['new_password'] ?? null;
$email = $_SESSION['new_password_email'] ?? $_GET['Shp_email'] ?? '';
$timestamp = $_SESSION['new_password_timestamp'] ?? null;

// Проверка на устаревание сессии (пароль действителен только 10 минут после генерации)
$password_expired = false;
if ($timestamp && (time() - $timestamp) > 600) {
    $password_expired = true;
    $password = null;
}

// Очистить пароль из сессии после отображения (или если устарел)
if (isset($_SESSION['new_password'])) {
    unset($_SESSION['new_password']);
    unset($_SESSION['new_password_email']);
    unset($_SESSION['new_password_timestamp']);
}
?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Оплата прошла успешно</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <style>
        .success-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }

        .success-container {
            background: white;
            padding: 48px;
            border-radius: 16px;
            max-width: 600px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .checkmark {
            font-size: 72px;
            color: #4caf50;
            margin-bottom: 24px;
            animation: checkmark-pop 0.5s ease-out;
        }

        @keyframes checkmark-pop {
            0% {
                transform: scale(0);
            }

            50% {
                transform: scale(1.1);
            }

            100% {
                transform: scale(1);
            }
        }

        .success-container h1 {
            color: #333;
            margin-bottom: 16px;
            font-size: 28px;
        }

        .success-container p {
            color: #666;
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .email-box {
            background: #f5f5f5;
            padding: 16px;
            border-radius: 8px;
            margin: 24px 0;
            font-family: monospace;
            font-size: 16px;
            color: #333;
        }

        .password-box {
            background: #fff3cd;
            border: 2px solid #ffc107;
            padding: 24px;
            border-radius: 12px;
            margin: 32px 0;
        }

        .password-box h2 {
            color: #856404;
            margin: 0 0 16px 0;
            font-size: 18px;
        }

        .password-display {
            background: white;
            padding: 16px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 24px;
            font-weight: bold;
            color: #333;
            letter-spacing: 2px;
            margin: 16px 0;
            word-break: break-all;
            position: relative;
        }

        .copy-button {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 12px;
            transition: all 0.2s;
        }

        .copy-button:hover {
            background: #5568d3;
            transform: translateY(-2px);
        }

        .copy-button:active {
            transform: translateY(0);
        }

        .copy-button.copied {
            background: #4caf50;
        }

        .warning-text {
            color: #856404;
            font-weight: 600;
            font-size: 14px;
            margin-top: 12px;
        }

        .btn-login {
            display: inline-block;
            padding: 16px 32px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 18px;
            margin-top: 24px;
            transition: transform 0.2s;
        }

        .btn-login:hover {
            transform: translateY(-2px);
        }

        .note {
            font-size: 14px;
            color: #999;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e0e0e0;
        }

        .expired-notice {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 16px;
            border-radius: 8px;
            margin: 24px 0;
        }
    </style>
</head>

<body class="success-page">
    <div class="success-container">
        <div class="checkmark">✓</div>
        <h1>Оплата прошла успешно!</h1>
        <p>Спасибо за покупку курса «Clean - Теория правильной уборки».</p>

        <?php if ($email): ?>
            <p><strong>Ваш email:</strong></p>
            <div class="email-box"><?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?></div>
        <?php endif; ?>

        <?php if ($password): ?>
            <!-- КРИТИЧЕСКОЕ УЛУЧШЕНИЕ UX: показываем пароль сразу -->
            <div class="password-box">
                <h2>🔑 Ваш пароль для входа:</h2>
                <div class="password-display" id="passwordDisplay">
                    <?= htmlspecialchars($password, ENT_QUOTES, 'UTF-8') ?>
                </div>
                <button class="copy-button" id="copyButton" onclick="copyPassword()">
                    📋 Скопировать пароль
                </button>
                <div class="warning-text">
                    ⚠️ Сохраните этот пароль! Он также отправлен на ваш email.
                </div>
            </div>

            <p><strong>Копия пароля отправлена на вашу почту.</strong></p>
            <p>Сейчас вы можете войти в закрытую версию курса, используя email и пароль выше.</p>

            <a href="index.php" class="btn-login">Войти в закрытую версию →</a>

        <?php elseif ($password_expired): ?>
            <!-- Если пароль устарел (прошло более 10 минут) -->
            <div class="expired-notice">
                <strong>⏰ Время показа пароля истекло</strong><br>
                Пожалуйста, проверьте ваш email. Мы отправили пароль на <?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?>
            </div>

            <p>Проверьте папку "Спам", если не видите письмо во входящих.</p>
            <a href="index.php" class="btn-login">Перейти к форме входа</a>

        <?php else: ?>
            <!-- Если пользователь обновил страницу или пароль не в сессии -->
            <p>Мы отправили вам письмо с данными для входа в закрытую версию курса.</p>
            <p>Письмо может прийти в течение 1-2 минут. Проверьте папку "Спам", если не видите письмо во входящих.</p>

            <a href="index.php" class="btn-login">Войти в закрытую версию →</a>
        <?php endif; ?>

        <div class="note">
            Не получили письмо?
            <a href="resend-password.html">Отправить пароль повторно</a> или
            <a
                href="mailto:<?= htmlspecialchars(Config::get('MAIL_REPLY_TO', 'support@toosmart.com'), ENT_QUOTES, 'UTF-8') ?>">напишите
                нам</a>
        </div>
    </div>

    <script>
        function copyPassword() {
            const passwordText = document.getElementById('passwordDisplay').textContent.trim();
            const button = document.getElementById('copyButton');

            // Современный API для копирования
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(passwordText).then(() => {
                    button.textContent = '✅ Пароль скопирован!';
                    button.classList.add('copied');

                    setTimeout(() => {
                        button.textContent = '📋 Скопировать пароль';
                        button.classList.remove('copied');
                    }, 3000);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    fallbackCopy(passwordText, button);
                });
            } else {
                // Fallback для старых браузеров
                fallbackCopy(passwordText, button);
            }
        }

        function fallbackCopy(text, button) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();

            try {
                document.execCommand('copy');
                button.textContent = '✅ Пароль скопирован!';
                button.classList.add('copied');

                setTimeout(() => {
                    button.textContent = '📋 Скопировать пароль';
                    button.classList.remove('copied');
                }, 3000);
            } catch (err) {
                alert('Не удалось скопировать. Пожалуйста, скопируйте пароль вручную.');
            }

            document.body.removeChild(textarea);
        }
    </script>
</body>

</html>