<?php
/**
 * Robokassa Result URL - обработка успешной оплаты
 * URL в настройках Robokassa: https://toosmart.ru/server/robokassa-callback.php
 *
 * SECURITY IMPROVEMENTS:
 * - Passwords are NOT logged
 * - Merchant password from environment variables
 * - File locking to prevent race conditions
 * - Email validation to prevent injection
 * - Cryptographically secure password generation
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/src/promo.php';
require_once __DIR__ . '/src/robokassa/helpers.php';
require_once __DIR__ . '/src/utils.php';
require_once __DIR__ . '/src/config_loader.php';
require_once __DIR__ . '/src/mailer.php';
require_once __DIR__ . '/src/payment_success_store.php';

// Загрузить конфигурацию
Config::load();

// Получение параметров от Robokassa
$out_sum = $_POST['OutSum'] ?? '';
$inv_id = $_POST['InvId'] ?? '';
$shp_email = $_POST['Shp_email'] ?? '';
$signature = $_POST['SignatureValue'] ?? '';
$shp_promo = $_POST['Shp_promo'] ?? '';

// Логирование входящего запроса (БЕЗ чувствительных данных)
Security::secureLog('INFO', 'Robokassa callback received', [
    'invoice_id' => $inv_id,
    'amount' => $out_sum,
    'email_hash' => md5($shp_email)
]);

$cfg = require __DIR__ . '/src/config_loader.php';
$isTest = !empty($cfg['robokassa']['is_test']);
$merchant_password2 = $isTest
    ? ($cfg['robokassa']['test_password2'] ?? $cfg['robokassa']['pass2'] ?? null)
    : ($cfg['robokassa']['pass2'] ?? null);
if (!$merchant_password2) {
    Security::secureLog('ERROR', 'Robokassa configuration missing', ['error' => 'pass2 not set']);
    http_response_code(500);
    die('Configuration error');
}

// 1. ПРОВЕРКА ПОДПИСИ (КРИТИЧЕСКИ ВАЖНО!)
$shp = rk_extract_shp($_POST);
$expected_signature = strtoupper(rk_make_signature_result($out_sum, $inv_id, $merchant_password2, $shp, $cfg['robokassa']['signature_alg'] ?? 'md5'));

if (!hash_equals(strtoupper($signature), $expected_signature)) {
    Security::secureLog('ERROR', 'Invalid Robokassa signature', [
        'invoice_id' => $inv_id,
        'expected' => $expected_signature,
        'received' => strtoupper($signature)
    ]);
    http_response_code(403);
    die('Bad signature');
}

// 2. ВАЛИДАЦИЯ EMAIL
$validated_email = Security::validateEmail($shp_email);
if (!$validated_email) {
    Security::secureLog('ERROR', 'Invalid email in payment', [
        'invoice_id' => $inv_id,
        'email_provided' => $shp_email
    ]);
    http_response_code(400);
    die('Invalid email');
}

// 3. ГЕНЕРАЦИЯ БЕЗОПАСНОГО ПАРОЛЯ
$password = Security::generatePassword(6); // Криптографически безопасный, 6 символов по требованию
$password_hash = password_hash($password, PASSWORD_DEFAULT);

// 4. ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ В БАЗУ С FILE LOCKING
require_once __DIR__ . '/Database.php';

try {
    $pdo = Database::getConnection();
    $pdo->beginTransaction();

    // Проверить, нет ли уже такого email
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $validated_email]);
    $existingUser = $stmt->fetch();

    $user_exists = false;

    if ($existingUser) {
        $user_exists = true;

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При дублирующем платеже обновляем пароль и переотправляем
        Security::secureLog('WARNING', 'Duplicate payment attempt - updating password', [
            'email' => $validated_email,
            'invoice_id' => $inv_id
        ]);

        // Обновить пароль существующего пользователя
        $stmt = $pdo->prepare("UPDATE users SET password_hash = :password_hash WHERE email = :email");
        $stmt->execute([
            ':password_hash' => $password_hash,
            ':email' => $validated_email
        ]);

        Security::secureLog('INFO', 'Password updated for existing user', [
            'email' => $validated_email,
            'invoice_id' => $inv_id
        ]);
    } else {
        // Добавить нового пользователя
        $stmt = $pdo->prepare("INSERT INTO users (email, password_hash, created_at) VALUES (:email, :password_hash, :created_at)");
        $stmt->execute([
            ':email' => $validated_email,
            ':password_hash' => $password_hash,
            ':created_at' => date('Y-m-d H:i:s')
        ]);

        Security::secureLog('INFO', 'New user created', [
            'email' => $validated_email,
            'invoice_id' => $inv_id
        ]);
    }

    $pdo->commit();

    // Промокоды: фиксируем использование после успешной оплаты
    if (!empty($shp_promo) && !empty($validated_email)) {
        promo_increment_usage($shp_promo, $validated_email);
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохранить пароль в сессии для показа на success.php
    Security::initSession();
    $_SESSION['new_password'] = $password;
    $_SESSION['new_password_email'] = $validated_email;
    $_SESSION['new_password_timestamp'] = time();

    Security::secureLog('INFO', 'Password stored in session for success page', [
        'email_hash' => md5($validated_email)
    ]);

    // Дополнительно: сохранить данные в file-store, чтобы success-страница могла их показать по InvId
    payment_success_store((int)$inv_id, $validated_email, $password, (float)$out_sum, 900);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    Security::secureLog('ERROR', 'Database error processing payment', [
        'error' => $e->getMessage(),
        'invoice_id' => $inv_id
    ]);
    http_response_code(500);
    die('Internal error');
}

// 5. ОТПРАВКА EMAIL С ПАРОЛЕМ через SMTP
$site_url = $cfg['site']['base_url'] ?? 'https://toosmart.ru';
$mail_reply_to = $cfg['emails']['reply_to'] ?? 'reply@toosmart.ru';

// Загрузка email-шаблона из JSON
$templates_path = __DIR__ . '/storage/email-templates.json';
$templates = file_exists($templates_path)
    ? json_decode(file_get_contents($templates_path), true)
    : null;

if (!$templates || !isset($templates['welcome'])) {
    Security::secureLog('ERROR', 'Email template not found', [
        'template_path' => $templates_path
    ]);
    http_response_code(500);
    die('Email template error');
}

$template = $templates['welcome'];
$subject = $template['subject'];
$message = str_replace(
    ['{{email}}', '{{password}}', '{{site_url}}', '{{reply_to}}'],
    [$validated_email, $password, $site_url, $mail_reply_to],
    $template['body']
);

// Получаем user_id для логирования
$user_id = get_user_id_by_email($validated_email);

if (send_mail($validated_email, $subject, $message, null, 'welcome', $user_id)) {
    Security::secureLog('INFO', 'Password email sent via SMTP', [
        'email' => $validated_email,
        'invoice_id' => $inv_id
    ]);
} else {
    Security::secureLog('ERROR', 'Failed to send password email', [
        'email' => $validated_email,
        'invoice_id' => $inv_id
    ]);
}

// 6. ОТВЕТ ROBOKASSA (ОБЯЗАТЕЛЬНО!)
echo "OK$inv_id";

Security::secureLog('INFO', 'Payment processing completed', [
    'invoice_id' => $inv_id,
    'user_created' => !$user_exists
]);
?>
