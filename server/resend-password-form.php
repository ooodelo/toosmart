<?php
/**
 * Resend Password Form
 * For users who lost their initial password email
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Generate CSRF token
$csrf_token = Security::generateCSRFToken();

// Get error/success messages
$error = $_GET['error'] ?? '';
$success = $_GET['success'] ?? '';
$errorMessage = '';
$successMessage = '';

if ($success === '1') {
    $successMessage = 'Если email существует в нашей системе, на него отправлен новый пароль. Проверьте почту.';
}

switch ($error) {
    case 'invalid_email':
        $errorMessage = 'Некорректный формат email';
        break;
    case 'csrf':
        $errorMessage = 'Ошибка безопасности.'Обновите страницу и попробуйте снова.';
        break;
    case 'rate_limit':
        $time = (int) ($_GET['time'] ?? 0);
        $minutes = ceil($time / 60);
        $errorMessage = "Слишком много запросов. Попробуйте через $minutes мин.";
        break;
    case 'system':
        $errorMessage = 'Системная ошибка. Попробуйте позже.';
        break;
}
?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <!-- Yandex.Metrika counter -->
    <script type="text/javascript">
        (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
        })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=105634847', 'ym');

        ym(105634847, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", accurateTrackBounce:true, trackLinks:true});
    </script>
    <noscript><div><img src="https://mc.yandex.ru/watch/105634847" style="position:absolute; left:-9999px;" alt=""></div></noscript>
    <!-- /Yandex.Metrika counter -->
    <title>Повторная отправка пароля</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/premium/assets/auth.css">
</head>

<body class="auth-page">
    <div class="auth-container">
        <img src="/assets/CleanLogo.svg" alt="Clean" class="auth-logo">

        <h1>Не получили письмо с паролем?</h1>
        <p>Мы сгенерируем новый пароль и отправим его на ваш email</p>

        <?php if ($successMessage): ?>
        <div
            style="background: #e8f5e9; color: #2e7d32; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; text-align: center; border-left: 4px solid #4caf50;">
            ✅
            <?= htmlspecialchars($successMessage, ENT_QUOTES, 'UTF-8') ?>
        </div>
        <?php endif; ?>

        <?php if ($errorMessage): ?>
        <div class="error" role="alert">⚠️
            <?= htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8') ?>
        </div>
        <?php endif; ?>

        <form action="resend-password.php" method="POST" class="auth-form">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">

            <input type="email" name="email" placeholder="Email, который вы использовали при оплате" required autofocus
                autocomplete="email" maxlength="255">

            <button type="submit">Отправить новый пароль</button>
        </form>

        <div
            style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 14px; color: #856404;">
            <strong>⚠️ Важно:</strong> Старый пароль перестанет работать после отправки нового.
        </div>

        <div class="help-text">
            Уже есть пароль? <a href="index.php">Войти</a><br>
            Забыли пароль? <a href="forgot-password-form.php">Восстановить</a>
        </div>
    </div>

    <script>
        // Локализация валидационных сообщений
        document.addEventListener('DOMContentLoaded', function () {
            const form = document.querySelector('.auth-form');
            if (form) {
                const inputs = form.querySelectorAll('input[required], input[type="email"]');
                inputs.forEach(input => {
                    input.addEventListener('invalid', function (e) {
                        e.preventDefault();
                        if (this.validity.valueMissing) {
                            this.setCustomValidity('Пожалуйста, введите email');
                        } else if (this.validity.typeMismatch && this.type === 'email') {
                            this.setCustomValidity('Некорректный формат email');
                        } else {
                            this.setCustomValidity('');
                        }
                    });
                    input.addEventListener('input', function () {
                        this.setCustomValidity('');
                    });
                });
            }
        });
    </script>
</body>

</html>
