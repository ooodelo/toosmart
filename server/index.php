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
require_once __DIR__ . '/src/config_loader.php';
require_once __DIR__ . '/src/robokassa/helpers.php';
require_once __DIR__ . '/src/payment_success_store.php';

Config::load();
Security::initSession();
$cfg = require __DIR__ . '/src/config_loader.php';

function resolvePremiumHome(): string
{
    // 1) Пытаемся взять из собранного списка курса
    $menuPath = __DIR__ . '/../shared/menu.json';
    if (file_exists($menuPath)) {
        $json = @file_get_contents($menuPath);
        if ($json) {
            $data = json_decode($json, true);
            if (is_array($data)) {
                $courseItems = array_values(array_filter($data, function ($item) {
                    return isset($item['type']) && $item['type'] === 'course' && !empty($item['url']);
                }));
                if (!empty($courseItems)) {
                    // Сортировка по order, если задан
                    usort($courseItems, function ($a, $b) {
                        $oa = $a['order'] ?? 0;
                        $ob = $b['order'] ?? 0;
                        return $oa <=> $ob;
                    });
                    $first = $courseItems[0];
                    if (!empty($first['url'])) {
                        return $first['url'];
                    }
                }
            }
        }
    }

    // 2) Фолбэк на первую страницу курса по маске
    $courseDir = __DIR__ . '/../premium/course';
    if (is_dir($courseDir)) {
        $files = array_values(array_filter(scandir($courseDir), function ($f) {
            return preg_match('/^p-\\d+-.*\\.html$/', $f);
        }));
        sort($files, SORT_NATURAL);
        if (!empty($files)) {
            return '/premium/course/' . $files[0];
        }
    }

    // 3) Самый последний фолбэк
    return '/premium/course/p-1-osnova.html';
}

// Security Headers
header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://mc.yandex.ru; connect-src 'self' https://mc.yandex.ru; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.robokassa.ru;");

// Куда отправлять авторизованного пользователя
$premiumHome = resolvePremiumHome();

// Если уже авторизован → редирект на главную страницу курса
if (isset($_SESSION['premium_user'])) {
    header("Location: {$premiumHome}");
    exit;
}

// Генерация CSRF токена
$csrf_token = Security::generateCSRFToken();

// Обработка успешной оплаты
$showSuccessModal = false;
$successModalHtml = '';
$successPayload = null;

// Обработка успешной оплаты - ПРОСТАЯ ВЕРСИЯ БЕЗ ПРОВЕРОК
if (isset($_GET['payment']) && $_GET['payment'] === 'success') {
    $invId = isset($_GET['InvId']) ? (int)$_GET['InvId'] : null;
    $urlEmail = isset($_GET['Shp_email']) ? urldecode($_GET['Shp_email']) : null;

    // DEBUG - показываем что версия кода новая
    echo "<!-- CODE_VERSION: 2024-12-16-v2 invId=$invId urlEmail=$urlEmail -->";

    // 1. Сначала пробуем получить из store (если callback успел записать)
    if ($invId) {
        $payload = payment_success_consume($invId);
        if ($payload) {
            $successPayload = $payload;
        }
    }

    // 2. Если нет в store - пробуем сессию
    if (!$successPayload && isset($_SESSION['new_password']) && isset($_SESSION['new_password_email'])) {
        $successPayload = [
            'password' => $_SESSION['new_password'],
            'email' => $_SESSION['new_password_email']
        ];
        unset($_SESSION['new_password'], $_SESSION['new_password_email'], $_SESSION['new_password_timestamp']);
    }

    // 3. Если всё ещё нет данных, но есть email в URL - создаём пользователя прямо здесь
    if (!$successPayload && $urlEmail && filter_var($urlEmail, FILTER_VALIDATE_EMAIL)) {
        require_once __DIR__ . '/Database.php';

        // Генерируем пароль
        $password = Security::generatePassword(6);
        $password_hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $pdo = Database::getConnection();

            // Проверяем есть ли уже пользователь
            $stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE email = ? LIMIT 1");
            $stmt->execute([$urlEmail]);
            $existingUser = $stmt->fetch();

            if ($existingUser) {
                // Пользователь есть - обновляем пароль
                $stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE email = ?");
                $stmt->execute([$password_hash, $urlEmail]);
            } else {
                // Создаём нового
                $stmt = $pdo->prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)");
                $stmt->execute([$urlEmail, $password_hash, date('Y-m-d H:i:s')]);
            }

            $successPayload = [
                'email' => $urlEmail,
                'password' => $password
            ];

            // Отправляем email с паролем (не блокируем если не отправится)
            require_once __DIR__ . '/src/mailer.php';
            $templates_path = __DIR__ . '/storage/email-templates.json';
            $templates = file_exists($templates_path) ? json_decode(file_get_contents($templates_path), true) : null;
            if ($templates && isset($templates['welcome'])) {
                $site_url = $cfg['site']['base_url'] ?? 'https://toosmart.ru';
                $mail_reply_to = $cfg['emails']['reply_to'] ?? 'reply@toosmart.ru';
                $subject = $templates['welcome']['subject'];
                $message = str_replace(
                    ['{{email}}', '{{password}}', '{{site_url}}', '{{reply_to}}'],
                    [$urlEmail, $password, $site_url, $mail_reply_to],
                    $templates['welcome']['body']
                );
                @send_mail($urlEmail, $subject, $message);
            }

        } catch (Exception $e) {
            // DEBUG: показываем ошибку
            error_log("Success modal error: " . $e->getMessage());
            // Если ошибка БД - просто не показываем модалку с паролем
            $successPayload = null;
        }
    }

    // DEBUG: Если дошли сюда и нет payload - выводим причину
    if (!$successPayload) {
        error_log("No successPayload: invId=$invId, urlEmail=$urlEmail, store=" . ($payload ?? 'null'));
        echo "<!-- DEBUG: No payload! invId=$invId, urlEmail=$urlEmail -->";
    } else {
        echo "<!-- DEBUG: Got payload! email={$successPayload['email']} -->";
    }
}

if ($successPayload) {
    echo "<!-- DEBUG: Building modal for {$successPayload['email']} -->";
    $password = $successPayload['password'];
    $email = $successPayload['email'];

        // Читаем HTML-шаблон модалки
        $template_path = __DIR__ . '/templates/payment-success.html';
        echo "<!-- DEBUG: template_path=$template_path exists=" . (file_exists($template_path) ? 'YES' : 'NO') . " -->";
        if (file_exists($template_path)) {
            $template = file_get_contents($template_path);

            // Читаем тексты из JSON
            $texts_path = __DIR__ . '/storage/success-modal-texts.json';
            $texts = file_exists($texts_path)
                ? json_decode(file_get_contents($texts_path), true)
                : [
                    'intro_hooks' => ['✅ Оплата прошла успешно!', 'Добро пожаловать в курс'],
                    'credentials_label' => 'Ваши данные для входа:',
                    'outro_hooks' => ['💾 Пароль также отправлен на ваш email'],
                    'button_text' => 'Войти в курс'
                ];

            // Формируем хуки в HTML
            $intro_hooks_html = '';
            foreach ($texts['intro_hooks'] as $hook) {
                $intro_hooks_html .= '<p class="modal-hook">' . htmlspecialchars($hook, ENT_QUOTES, 'UTF-8') . '</p>';
            }

            $outro_hooks_html = '';
            foreach ($texts['outro_hooks'] as $hook) {
                $outro_hooks_html .= '<p>' . htmlspecialchars($hook, ENT_QUOTES, 'UTF-8') . '</p>';
            }

            // Создаем токен для авто-логина (криптографически безопасный)
            $auto_login_token = bin2hex(random_bytes(32));
            $_SESSION['auto_login_token'] = $auto_login_token;
            $_SESSION['auto_login_email'] = $email;

            // Заменяем плейсхолдеры
            $successModalHtml = str_replace(
                ['{{INTRO_HOOKS}}', '{{CREDENTIALS_LABEL}}', '{{EMAIL}}', '{{PASSWORD}}', '{{OUTRO_HOOKS}}', '{{AUTO_LOGIN_URL}}', '{{BUTTON_TEXT}}'],
                [
                    $intro_hooks_html,
                    htmlspecialchars($texts['credentials_label'], ENT_QUOTES, 'UTF-8'),
                    htmlspecialchars($email, ENT_QUOTES, 'UTF-8'),
                    htmlspecialchars($password, ENT_QUOTES, 'UTF-8'),
                    $outro_hooks_html,
                    '/server/auto-login.php?token=' . $auto_login_token,
                    htmlspecialchars($texts['button_text'], ENT_QUOTES, 'UTF-8')
                ],
                $template
            );

            // Очистить одноразовые данные в сессии, если остались
            unset($_SESSION['new_password'], $_SESSION['new_password_email'], $_SESSION['new_password_timestamp']);

            $showSuccessModal = true;
            echo "<!-- DEBUG: showSuccessModal set to TRUE -->";
        } else {
            echo "<!-- DEBUG: Template NOT found! -->";
        }
    }

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
    case 'invalid_token':
        $errorMessage = 'Недействительная ссылка для восстановления';
        break;
    case 'token_used':
        $errorMessage = 'Эта ссылка уже использована';
        break;
    case 'token_expired':
        $errorMessage = 'Ссылка для восстановления устарела';
        break;
    case '1':
        // Для обратной совместимости
        $errorMessage = 'Неверный email или пароль';
        break;
}

// Success messages
$success = $_GET['success'] ?? '';
$successMessage = '';

if ($success === 'password_reset') {
    $successMessage = 'Пароль успешно изменен! Войдите с новым паролем.';
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
    <title>Вход в закрытую версию курса</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/premium/assets/auth.css">
</head>

<body class="auth-page">
    <div class="auth-container">
        <img src="../free/assets/CleanLogo.svg" alt="Clean" class="auth-logo">

        <h1>Вход в закрытую версию курса</h1>
        <p>Введите данные, отправленные на email после оплаты</p>

        <?php if ($successMessage): ?>
            <div
                style="background: #e8f5e9; color: #2e7d32; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; text-align: center; border-left: 4px solid #4caf50;">
                ✅ <?= htmlspecialchars($successMessage, ENT_QUOTES, 'UTF-8') ?>
            </div>
        <?php endif; ?>

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
            Забыли пароль? <a href="forgot-password-form.php">Восстановить</a><br>
            Еще нет доступа? <a href="/">Вернуться к бесплатной версии</a><br>
            Проблемы со входом? <a
                href="mailto:<?= htmlspecialchars(Config::get('MAIL_REPLY_TO', 'support@toosmart.ru'), ENT_QUOTES, 'UTF-8') ?>">Напишите
                нам</a>
        </div>
    </div>

    <?php if ($showSuccessModal): ?>
        <?= $successModalHtml ?>
        <script>document.body.style.overflow = 'hidden';</script>
    <?php endif; ?>
</body>

</html>
