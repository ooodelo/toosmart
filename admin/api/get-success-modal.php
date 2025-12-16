<?php
/**
 * GET /admin/api/get-success-modal.php
 * Получение текстов модального окна успеха
 */

header('Content-Type: application/json; charset=utf-8');

// Читаем success-modal-texts.json
$texts_path = __DIR__ . '/../../server/storage/success-modal-texts.json';

if (!file_exists($texts_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'texts_not_found']));
}

$texts = json_decode(file_get_contents($texts_path), true);

echo json_encode([
    'success' => true,
    'texts' => $texts
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
