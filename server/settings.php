<?php
/**
 * User Settings Page
 * Password change and profile settings for authenticated users
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();

// Инициализация сессии с проверками безопасности
if (!Security::initSession()) {
    header('Location: index.php?error=session_expired');
    exit;
}

// Проверка авторизации
if (!isset($_SESSION['premium_user'])) {
    Security::secureLog('WARNING', 'Unauthorized access attempt to settings');
    header('Location: index.php');
    exit;
}

// Обновить время последней активности
$_SESSION['last_activity'] = time();

$user_email = $_SESSION['premium_user'];

// Generate CSRF token
$csrf_token = Security::generateCSRFToken();

// Get error/success messages
$error = $_GET['error'] ?? '';
$success = $_GET['success'] ?? '';
$errorMessage = '';
$successMessage = '';

if ($success === 'password_changed') {
    $successMessage = 'Пароль успешно изменен!';
}

switch ($error) {
    case 'invalid_current_password':
        $errorMessage = 'Некорректная длина текущего пароля';
        break;
    case 'invalid_new_password':
        $errorMessage = 'Новый пароль должен быть от 6 до 128 символов';
        break;
    case 'password_mismatch':
        $errorMessage = 'Пароли не совпадают';
        break;
    case 'wrong_current_password':
        $errorMessage = 'Неверный текущий пароль';
        break;
    case 'same_password':
        $errorMessage = 'Новый пароль должен отличаться от текущего';
        break;
    case 'csrf':
        $errorMessage = 'Ошибка безопасности. Обновите страницу и попробуйте снова.';
        break;
    case 'system':
        $errorMessage = 'Системная ошибка. Попробуйте позже.';
        break;
    case 'session_expired':
        $errorMessage = 'Сессия истекла. Войдите снова.';
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
    <title>Настройки профиля</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/premium/assets/auth.css">
    <style>
        .settings-container {
            background: white;
            padding: 48px;
            border-radius: 16px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .settings-section {
            margin-bottom: 32px;
            padding-bottom: 32px;
            border-bottom: 1px solid #e0e0e0;
        }

        .settings-section:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .settings-section h2 {
            font-size: 20px;
            margin-bottom: 8px;
            color: #333;
        }

        .settings-section p {
            color: #666;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .info-box {
            background: #f5f5f5;
            padding: 16px;
            border-radius: 8px;
            margin: 16px 0;
            font-family: monospace;
        }

        .info-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
        }

        .info-value {
            font-size: 16px;
            color: #333;
            font-weight: 600;
        }

        .btn-secondary {
            display: inline-block;
            padding: 12px 24px;
            background: #e0e0e0;
            color: #333;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: background 0.2s;
            border: none;
            cursor: pointer;
        }

        .btn-secondary:hover {
            background: #d0d0d0;
        }
    </style>
</head>

<body class="auth-page">
    <div class="settings-container">
        <h1 style="text-align: center; margin-bottom: 32px;">Настройки профиля</h1>

        <?php if ($successMessage): ?>
        <div
            style="background: #e8f5e9; color: #2e7d32; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; text-align: center; border-left: 4px solid #4caf50;">
            ✅
            <?= htmlspecialchars($successMessage, ENT_QUOTES, 'UTF-8') ?>
        </div>
        <?php endif; ?>

        <?php if ($errorMessage): ?>
        <div class="error" role="alert">⚠️
            <?= htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8') ?>
        </div>
        <?php endif; ?>

        <!-- Account Info Section -->
        <div class="settings-section">
            <h2>Информация об аккаунте</h2>
            <p>Ваши учетные данные для доступа к курсу</p>

            <div class="info-box">
                <div class="info-label">Email</div>
                <div class="info-value">
                    <?= htmlspecialchars($user_email, ENT_QUOTES, 'UTF-8') ?>
                </div>
            </div>
        </div>

        <!-- Change Password Section -->
        <div class="settings-section">
            <h2>Смена пароля</h2>
            <p>Измените пароль для входа в закрытую версию курса</p>

            <form action="change-password.php" method="POST" class="auth-form" id="changePasswordForm">
                <input type="hidden" name="csrf_token"
                    value="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">

                <input type="password" name="current_password" id="currentPassword" placeholder="Текущий пароль"
                    required autocomplete="current-password" minlength="6" maxlength="128">

                <input type="password" name="new_password" id="newPassword" placeholder="Новый пароль" required
                    autocomplete="new-password" minlength="6" maxlength="128">

                <input type="password" name="confirm_password" id="confirmPassword"
                    placeholder="Подтвердите новый пароль" required autocomplete="new-password" minlength="6"
                    maxlength="128">

                <div style="font-size: 13px; color: #666; margin-top: -8px; margin-bottom: 16px;">
                    Минимум 6 символов
                </div>

                <button type="submit">Изменить пароль</button>
            </form>
        </div>

        <!-- Navigation Section -->
        <div style="text-align: center; margin-top: 32px;">
            <a href="/premium/course/p-1-osnova.html" class="btn-secondary">← Вернуться к курсу</a>
            <a href="logout.php" class="btn-secondary"
                style="background: #ffebee; color: #c62828; margin-left: 8px;">Выйти</a>
        </div>
    </div>

    <script>
        // Client-side password validation
        document.getElementById('changePasswordForm')?.addEventListener('submit', function (e) {
            const currentPass = document.getElementById('currentPassword').value;
            const newPass = document.getElementById('newPassword').value;
            const confirmPass = document.getElementById('confirmPassword').value;

            if (newPass !== confirmPass) {
                e.preventDefault();
                alert('Новые пароли не совпадают. Пожалуйста, проверьте правильность ввода.');
                return false;
            }

            if (newPass === currentPass) {
                e.preventDefault();
                alert('Новый пароль должен отличаться от текущего.');
                return false;
            }

            if (newPass.length < 6) {
                e.preventDefault();
                alert('Новый пароль должен содержать минимум 6 символов.');
                return false;
            }
        });
    </script>
</body>

</html>
