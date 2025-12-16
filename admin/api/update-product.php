<?php
/**
 * POST /admin/api/update-product.php
 * Сохранение настроек продукта
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
$name = trim($data['name'] ?? '');
$price = $data['price'] ?? null;

if (empty($name) || mb_strlen($name) > 255) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_name']));
}

if (!is_numeric($price) || $price <= 0 || $price > 999999) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_price']));
}

// Читаем products.json
$products_path = __DIR__ . '/../../server/storage/products.json';

if (!file_exists($products_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'products_not_found']));
}

$products = json_decode(file_get_contents($products_path), true);

// Обновляем
$products['premium_course']['name'] = $name;
$products['premium_course']['price'] = (float)$price;

// Сохраняем
file_put_contents($products_path, json_encode($products, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo json_encode([
    'success' => true
], JSON_UNESCAPED_UNICODE);
