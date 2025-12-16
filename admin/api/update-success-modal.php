<?php
/**
 * POST /admin/api/update-success-modal.php
 * Сохранение текстов модального окна успеха
 */

header('Content-Type: application/json; charset=utf-8');

// Получаем данные
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_json']));
}

// Валидация
$intro_hooks = $data['intro_hooks'] ?? [];
$credentials_label = trim($data['credentials_label'] ?? '');
$outro_hooks = $data['outro_hooks'] ?? [];
$button_text = trim($data['button_text'] ?? '');

if (!is_array($intro_hooks) || empty($intro_hooks)) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_intro_hooks']));
}

if (empty($credentials_label) || mb_strlen($credentials_label) > 500) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_credentials_label']));
}

if (!is_array($outro_hooks) || empty($outro_hooks)) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_outro_hooks']));
}

if (empty($button_text) || mb_strlen($button_text) > 500) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_button_text']));
}

// Проверяем каждый хук
foreach ($intro_hooks as $hook) {
    if (!is_string($hook) || mb_strlen($hook) > 500) {
        http_response_code(400);
        die(json_encode(['error' => 'invalid_hook_length']));
    }
}

foreach ($outro_hooks as $hook) {
    if (!is_string($hook) || mb_strlen($hook) > 500) {
        http_response_code(400);
        die(json_encode(['error' => 'invalid_hook_length']));
    }
}

// Читаем success-modal-texts.json
$texts_path = __DIR__ . '/../../server/storage/success-modal-texts.json';

$texts = [
    'intro_hooks' => $intro_hooks,
    'credentials_label' => $credentials_label,
    'outro_hooks' => $outro_hooks,
    'button_text' => $button_text
];

// Сохраняем
file_put_contents($texts_path, json_encode($texts, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo json_encode([
    'success' => true
], JSON_UNESCAPED_UNICODE);
