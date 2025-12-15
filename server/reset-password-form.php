<?php
/**
 * Reset Password Form
 * Set new password using token from email
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Generate CSRF token
$csrf_token = Security::generateCSRFToken();

// Get token from URL
$token = $_GET['token'] ?? '';

// Validate token format
$validToken = (strlen($token) === 64 && ctype_xdigit($token));

// Get error messages
$error = $_GET['error'] ?? '';
$errorMessage = '';

switch ($error) {
    case 'invalid_password':
        $errorMessage = 'Пароль должен быть от 6 до 128 символов';
        break;
    case 'password_mismatch':
        $errorMessage = 'Пароли не совпадают';
        break;
    case 'csrf':
        $errorMessage = 'Ошибка безопасности. Обновите страницу и попробуйте снова.';
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
        (function (m, e, t, r, i, k, a) {
            m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
            m[i].l = 1 * new Date();
            for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
            k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a)
        })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=105634847', 'ym');

        ym(105634847, 'init', { ssr: true, webvisor: true, clickmap: true, ecommerce: "dataLayer", accurateTrackBounce: true, trackLinks: true });
    </script>
    <noscript>
        <div><img src="https://mc.yandex.ru/watch/105634847" style="position:absolute; left:-9999px;" alt=""></div>
    </noscript>
    <!-- /Yandex.Metrika counter -->
    <title>Установка нового пароля</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/premium/assets/auth.css">
    <style>
        .password-hint {
            font-size: 13px;
            color: #666;
            margin-top: -8px;
            margin-bottom: 16px;
        }

        .toggle-password {
            cursor: pointer;
            user-select: none;
            font-size: 13px;
            color: #667eea;
            margin-top: -8px;
            margin-bottom: 16px;
        }

        .toggle-password:hover {
            text-decoration: underline;
        }
    </style>
</head>

<body class="auth-page">
    <div class="auth-container">
        <img src="/assets/CleanLogo.svg" alt="Clean" class="auth-logo">

        <?php if (!$validToken): ?>
            <h1>Недействительная ссылка</h1>
            <p style="color: #c62828; margin-bottom: 24px;">❌ Ссылка для восстановления пароля недействительна или устарела.
            </p>

            <div class="help-text" style="border-top: none; padding-top: 0;">
                <a href="forgot-password-form.php"
                    style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 8px;">Запросить
                    новую ссылку</a>
                <br><br>
                <a href="index.php">Вернуться к входу</a>
            </div>
        <?php else: ?>
            <h1>Установите новый пароль</h1>
            <p>Введите новый пароль для вашего аккаунта</p>

            <?php if ($errorMessage): ?>
                <div class="error" role="alert">⚠️
                    <?= htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8') ?>
                </div>
            <?php endif; ?>

            <form action="reset-password.php" method="POST" class="auth-form" id="resetForm">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">
                <input type="hidden" name="token" value="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>">

                <input type="password" name="new_password" id="newPassword" placeholder="Новый пароль" required autofocus
                    autocomplete="new-password" minlength="6" maxlength="128">
                <div class="password-hint">Минимум 6 символов</div>

                <input type="password" name="confirm_password" id="confirmPassword" placeholder="Подтвердите пароль"
                    required autocomplete="new-password" minlength="6" maxlength="128">

                <div class="toggle-password" onclick="togglePasswords()">
                    <span id="toggleText">👁️ Показать пароли</span>
                </div>

                <button type="submit">Установить новый пароль</button>
            </form>

            <div class="help-text">
                <a href="index.php">Вернуться к входу</a>
            </div>
        <?php endif; ?>
    </div>

    <script>
        let passwordsVisible = false;

        function togglePasswords() {
            passwordsVisible = !passwordsVisible;
            const type = passwordsVisible ? 'text' : 'password';
            document.getElementById('newPassword').type = type;
            document.getElementById('confirmPassword').type = type;
            document.getElementById('toggleText').textContent = passwordsVisible
                ? '🙈 Скрыть пароли'
                : '👁️ Показать пароли';
        }

        // Локализация валидационных сообщений
        document.addEventListener('DOMContentLoaded', function () {
            const form = document.getElementById('resetForm');
            if (form) {
                const inputs = form.querySelectorAll('input[required], input[minlength]');
                inputs.forEach(input => {
                    input.addEventListener('invalid', function (e) {
                        e.preventDefault();
                        if (this.validity.valueMissing) {
                            this.setCustomValidity('Пожалуйста, заполните это поле');
                        } else if (this.validity.tooShort) {
                            this.setCustomValidity(`Минимум ${this.minLength} символов`);
                        } else if (this.validity.tooLong) {
                            this.setCustomValidity(`Максимум ${this.maxLength} символов`);
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

        // Client-side password match validation
        document.getElementById('resetForm')?.addEventListener('submit', function (e) {
            const newPass = document.getElementById('newPassword').value;
            const confirmPass = document.getElementById('confirmPassword').value;

            if (newPass !== confirmPass) {
                e.preventDefault();
                alert('Пароли не совпадают. Пожалуйста, проверьте правильность ввода.');
                return false;
            }

            if (newPass.length < 6) {
                e.preventDefault();
                alert('Пароль должен содержать минимум 6 символов.');
                return false;
            }
        });
    </script>
</body>

</html>