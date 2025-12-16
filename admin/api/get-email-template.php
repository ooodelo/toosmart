<?php
/**
 * GET /admin/api/get-email-template.php
 * Получение email-шаблона
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

// Читаем email-templates.json
$templates_path = __DIR__ . '/../../server/storage/email-templates.json';

if (!file_exists($templates_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'templates_not_found']));
}

$templates = json_decode(file_get_contents($templates_path), true);

if (!isset($templates['welcome'])) {
    http_response_code(404);
    die(json_encode(['error' => 'template_not_found']));
}

$template = $templates['welcome'];

echo json_encode([
    'success' => true,
    'template' => [
        'subject' => $template['subject'],
        'body' => $template['body']
    ]
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
