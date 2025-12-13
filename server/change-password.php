<?php
/**
 * Change Password Handler (API)
 * Returns JSON responses for the settings modal
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/src/password_history.php';
require_once __DIR__ . '/src/mailer.php';

Config::load();
Security::initSession();

header('Content-Type: application/json');

// Check auth
if (!isset($_SESSION['premium_user'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit;
}

$user_email = $_SESSION['premium_user'];

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// Get JSON input or POST data
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    $input = $_POST;
}

$current_password = $input['current_password'] ?? '';
$new_password = $input['new_password'] ?? '';
$confirm_password = $input['confirm_password'] ?? '';

// Validation
if (strlen($current_password) < 6) {
    echo json_encode(['status' => 'error', 'message' => 'Некорректный текущий пароль']);
    exit;
}
if (strlen($new_password) < 6) {
    echo json_encode(['status' => 'error', 'message' => 'Новый пароль слишком короткий (мин. 6 символов)']);
    exit;
}
if ($new_password !== $confirm_password) {
    echo json_encode(['status' => 'error', 'message' => 'Пароли не совпадают']);
    exit;
}
if ($current_password === $new_password) {
    echo json_encode(['status' => 'error', 'message' => 'Новый пароль должен отличаться от текущего']);
    exit;
}

try {
    $pdo = Database::getConnection();
    $stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $user_email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($current_password, $user['password_hash'])) {
        echo json_encode(['status' => 'error', 'message' => 'Неверный текущий пароль']);
        exit;
    }

    // Сохраняем старый пароль в историю
    save_password_history((int) $user['id'], $user['password_hash'], Security::getClientIP());

    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("UPDATE users SET password_hash = :password_hash WHERE id = :user_id");
    $stmt->execute([':password_hash' => $new_hash, ':user_id' => $user['id']]);

    // Отправляем email уведомление
    $cfg = require __DIR__ . '/src/config_loader.php';
    $site_url = $cfg['site']['base_url'] ?? 'https://toosmart.ru';

    $subject = 'Пароль изменён - TooSmart';
    $message = "
Здравствуйте!

Ваш пароль для доступа к курсу был успешно изменён.

Если вы не меняли пароль, срочно свяжитесь с нами!

С уважением,
Команда TooSmart
";

    send_mail($user_email, $subject, $message, null, 'password_changed', (int) $user['id']);

    echo json_encode(['status' => 'success', 'message' => 'Пароль успешно изменен']);

} catch (Exception $e) {
    error_log($e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Системная ошибка']);
}