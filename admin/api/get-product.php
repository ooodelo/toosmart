<?php
/**
 * GET /admin/api/get-product.php
 * Получение текущих настроек продукта
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

// Читаем products.json
$products_path = __DIR__ . '/../../server/storage/products.json';

if (!file_exists($products_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'products_not_found']));
}

$products = json_decode(file_get_contents($products_path), true);

if (!isset($products['premium_course'])) {
    http_response_code(404);
    die(json_encode(['error' => 'product_not_found']));
}

$product = $products['premium_course'];

echo json_encode([
    'success' => true,
    'product' => [
        'name' => $product['name'],
        'price' => $product['price'],
        'tax' => $product['tax'] ?? 'none',
        'payment_method' => $product['payment_method'] ?? 'full_payment',
        'payment_object' => $product['payment_object'] ?? 'service'
    ]
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
