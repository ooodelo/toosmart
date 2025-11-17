<?php
/**
 * Robokassa Result URL - обработка успешной оплаты
 * URL в настройках Robokassa: https://toosmart.com/premium/robokassa-callback.php
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

// Загрузить конфигурацию
Config::load();

// Получение параметров от Robokassa
$out_sum = $_POST['OutSum'] ?? '';
$inv_id = $_POST['InvId'] ?? '';
$shp_email = $_POST['Shp_email'] ?? '';
$signature = $_POST['SignatureValue'] ?? '';

// Логирование входящего запроса (БЕЗ чувствительных данных)
Security::secureLog('INFO', 'Robokassa callback received', [
    'invoice_id' => $inv_id,
    'amount' => $out_sum,
    'email_hash' => md5($shp_email)
]);

// Получение конфигурации Robokassa из переменных окружения
try {
    $merchant_password2 = Config::require('ROBOKASSA_PASSWORD2');
} catch (RuntimeException $e) {
    Security::secureLog('ERROR', 'Robokassa configuration missing', ['error' => $e->getMessage()]);
    http_response_code(500);
    die('Configuration error');
}

// 1. ПРОВЕРКА ПОДПИСИ (КРИТИЧЕСКИ ВАЖНО!)
$expected_signature = strtoupper(md5("$out_sum:$inv_id:$merchant_password2:Shp_email=$shp_email"));

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
$password = Security::generatePassword(16); // Криптографически безопасный, 16+ символов
$password_hash = password_hash($password, PASSWORD_DEFAULT);

// 4. ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ В БАЗУ С FILE LOCKING
$users_file = Config::get('USERS_FILE_PATH', __DIR__ . '/../../private/users.json');

// Создать директорию если не существует
$dir = dirname($users_file);
if (!is_dir($dir)) {
    if (!mkdir($dir, 0755, true)) {
        Security::secureLog('ERROR', 'Failed to create users directory', ['path' => $dir]);
        http_response_code(500);
        die('Internal error');
    }
}

// Создать файл если не существует
if (!file_exists($users_file)) {
    file_put_contents($users_file, '[]');
    chmod($users_file, 0600); // Только владелец может читать/писать
}

// Открыть файл с эксклюзивной блокировкой
$fp = fopen($users_file, 'c+');
if (!$fp) {
    Security::secureLog('ERROR', 'Failed to open users file', ['path' => $users_file]);
    http_response_code(500);
    die('Internal error');
}

if (flock($fp, LOCK_EX)) {
    try {
        // Прочитать текущих пользователей
        $content = stream_get_contents($fp);
        $users = json_decode($content, true);

        if (!is_array($users)) {
            $users = [];
        }

        // Проверить, нет ли уже такого email
        $user_exists = false;
        foreach ($users as $user) {
            if ($user['email'] === $validated_email) {
                $user_exists = true;
                Security::secureLog('WARNING', 'Duplicate payment attempt', [
                    'email' => $validated_email,
                    'invoice_id' => $inv_id
                ]);
                break;
            }
        }

        if (!$user_exists) {
            // Добавить нового пользователя
            $users[] = [
                'email' => $validated_email,
                'password_hash' => $password_hash,
                'created_at' => date('Y-m-d H:i:s'),
                'invoice_id' => $inv_id,
                'amount' => $out_sum
            ];

            // Записать обратно в файл
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            fflush($fp);

            Security::secureLog('INFO', 'New user created', [
                'email' => $validated_email,
                'invoice_id' => $inv_id
            ]);
        }

        flock($fp, LOCK_UN);
    } catch (Exception $e) {
        flock($fp, LOCK_UN);
        Security::secureLog('ERROR', 'Error processing payment', [
            'error' => $e->getMessage(),
            'invoice_id' => $inv_id
        ]);
        fclose($fp);
        http_response_code(500);
        die('Internal error');
    }
}

fclose($fp);

// 5. ОТПРАВКА EMAIL С ПАРОЛЕМ (только для новых пользователей)
if (!$user_exists) {
    $site_url = Config::get('SITE_URL', 'https://toosmart.com');
    $mail_from = Config::get('MAIL_FROM', 'noreply@toosmart.com');
    $mail_reply_to = Config::get('MAIL_REPLY_TO', 'support@toosmart.com');

    $to = $validated_email;
    $subject = 'Ваш доступ к курсу Clean - Теория правильной уборки';
    $message = "
Здравствуйте!

Спасибо за покупку курса «Clean - Теория правильной уборки».

Ваши данные для входа в закрытую версию:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: $validated_email
Пароль: $password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ссылка для входа: $site_url/premium/

⚠️ ВАЖНО: Сохраните это письмо - пароль больше нигде не отображается.

Если у вас возникли проблемы со входом, напишите нам на $mail_reply_to

С уважением,
Команда TooSmart
";

    // Безопасные заголовки email (защита от injection)
    $headers = [];
    $headers[] = "From: $mail_from";
    $headers[] = "Reply-To: $mail_reply_to";
    $headers[] = "Content-Type: text/plain; charset=UTF-8";
    $headers[] = "X-Mailer: PHP/" . phpversion();
    $headers[] = "X-Invoice-ID: $inv_id"; // Для трекинга

    if (mail($to, $subject, $message, implode("\r\n", $headers))) {
        Security::secureLog('INFO', 'Password email sent', [
            'email' => $validated_email,
            'invoice_id' => $inv_id
        ]);
    } else {
        Security::secureLog('ERROR', 'Failed to send password email', [
            'email' => $validated_email,
            'invoice_id' => $inv_id
        ]);
    }
}

// 6. ОТВЕТ ROBOKASSA (ОБЯЗАТЕЛЬНО!)
echo "OK$inv_id";

Security::secureLog('INFO', 'Payment processing completed', [
    'invoice_id' => $inv_id,
    'user_created' => !$user_exists
]);
?>
