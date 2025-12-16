<?php
/**
 * POST /admin/api/update-email-template.php
 * Сохранение email-шаблона
 */

header('Content-Type: application/json; charset=utf-8');

// Проверка авторизации
$token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
$config_path = __DIR__ . '/../../server/storage/settings.json';

if (!file_exists($config_path)) {
    http_response_code(500);
    die(json_encode(['error' => 'Config not found']));
}

$config = json_decode(file_get_contents($config_path), true);
$expected_token = $config['security']['admin_token'] ?? null;

if (!$expected_token || !hash_equals($expected_token, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'forbidden']));
}

// Получаем данные
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_json']));
}

// Валидация
$subject = trim($data['subject'] ?? '');
$body = $data['body'] ?? '';

if (empty($subject) || mb_strlen($subject) > 255) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_subject']));
}

if (empty($body) || mb_strlen($body) > 10000) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_body']));
}

// Проверяем наличие обязательных плейсхолдеров
if (strpos($body, '{{email}}') === false || strpos($body, '{{password}}') === false) {
    http_response_code(400);
    die(json_encode(['error' => 'missing_required_placeholders']));
}

// Читаем email-templates.json
$templates_path = __DIR__ . '/../../server/storage/email-templates.json';

if (!file_exists($templates_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'templates_not_found']));
}

$templates = json_decode(file_get_contents($templates_path), true);

// Обновляем
$templates['welcome']['subject'] = $subject;
$templates['welcome']['body'] = $body;

// Сохраняем
file_put_contents($templates_path, json_encode($templates, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo json_encode([
    'success' => true
], JSON_UNESCAPED_UNICODE);
