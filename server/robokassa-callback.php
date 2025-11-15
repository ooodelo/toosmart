<?php
/**
 * Robokassa Result URL - обработка успешной оплаты
 * URL в настройках Robokassa: https://toosmart.com/premium/robokassa-callback.php
 */

// Параметры от Robokassa
$out_sum = $_POST['OutSum'] ?? '';
$inv_id = $_POST['InvId'] ?? '';
$shp_email = $_POST['Shp_email'] ?? '';
$signature = $_POST['SignatureValue'] ?? '';

// Конфигурация Robokassa
// ⚠️ ВАЖНО: Замените на ваши реальные значения!
$merchant_password2 = 'YOUR_PASSWORD2_HERE'; // Password#2 из настроек Robokassa

// 1. ПРОВЕРКА ПОДПИСИ (КРИТИЧЕСКИ ВАЖНО!)
$expected_signature = strtoupper(md5("$out_sum:$inv_id:$merchant_password2:Shp_email=$shp_email"));

if (strtoupper($signature) !== $expected_signature) {
    error_log("Robokassa: Invalid signature. Expected: $expected_signature, Got: $signature");
    die('Bad signature');
}

// 2. ГЕНЕРАЦИЯ ПАРОЛЯ
$password = generateRandomPassword(8);
$password_hash = password_hash($password, PASSWORD_DEFAULT);

// 3. ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ В БАЗУ
$users_file = __DIR__ . '/../../private/users.json';

// Создать файл если не существует
if (!file_exists($users_file)) {
    $dir = dirname($users_file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($users_file, '[]');
}

$users = json_decode(file_get_contents($users_file), true);
if (!is_array($users)) {
    $users = [];
}

// Проверить, нет ли уже такого email
$user_exists = false;
foreach ($users as $user) {
    if ($user['email'] === $shp_email) {
        $user_exists = true;
        error_log("Robokassa: User already exists: $shp_email (invoice: $inv_id)");
        break;
    }
}

if (!$user_exists) {
    $users[] = [
        'email' => $shp_email,
        'password_hash' => $password_hash,
        'created_at' => date('Y-m-d H:i:s'),
        'invoice_id' => $inv_id,
        'amount' => $out_sum
    ];

    file_put_contents($users_file, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// 4. ОТПРАВКА EMAIL С ПАРОЛЕМ
$to = $shp_email;
$subject = 'Ваш доступ к курсу Clean - Теория правильной уборки';
$message = "
Здравствуйте!

Спасибо за покупку курса «Clean - Теория правильной уборки».

Ваши данные для входа в закрытую версию:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: $shp_email
Пароль: $password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ссылка для входа: https://toosmart.com/premium/

⚠️ ВАЖНО: Сохраните это письмо - пароль больше нигде не отображается.

Если у вас возникли проблемы со входом, напишите нам на support@toosmart.com

С уважением,
Команда TooSmart
";

$headers = "From: noreply@toosmart.com\r\n";
$headers .= "Reply-To: support@toosmart.com\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

mail($to, $subject, $message, $headers);

// 5. ОТВЕТ ROBOKASSA (ОБЯЗАТЕЛЬНО!)
echo "OK$inv_id";

// Логирование для отладки
error_log("Robokassa: Payment successful. Email: $shp_email, InvId: $inv_id, Password: $password");

/**
 * Генерация случайного пароля
 */
function generateRandomPassword($length = 8) {
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $password = '';
    $chars_length = strlen($chars);
    for ($i = 0; $i < $length; $i++) {
        $password .= $chars[random_int(0, $chars_length - 1)];
    }
    return $password;
}
?>
