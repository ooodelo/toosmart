<?php
require_once __DIR__ . '/../../src/utils.php';
require_once __DIR__ . '/../../src/promo.php';

$cfg = require __DIR__ . '/../../src/config_loader.php';
$data = json_body();
$code = trim($data['code'] ?? '');
$email = trim($data['email'] ?? 'guest@example.com');
$productCode = $data['product_code'] ?? 'premium_course';

if ($code === '') {
  json_out(['success' => false, 'error' => 'code_required'], 400);
}

// load product price
$productsPath = __DIR__ . '/../../storage/products.json';
$products = file_exists($productsPath) ? json_decode(file_get_contents($productsPath), true) : null;
if (!is_array($products) || !isset($products[$productCode])) {
  json_out(['success' => false, 'error' => 'product_not_found'], 400);
}
$baseAmount = (float)$products[$productCode]['price'];

$promos = promo_load_all();
$promo = promo_find($code, $promos);
$usage = promo_load_usage();
$finalAmount = $baseAmount;
$reason = '';

if (!$promo || !promo_is_valid($promo, $email, $baseAmount, $usage, $finalAmount, $reason)) {
  json_out(['success' => false, 'error' => $reason ?: 'invalid'], 400);
}

json_out([
  'success' => true,
  'code' => $promo['code'],
  'type' => $promo['type'],
  'value' => $promo['value'],
  'amount' => $finalAmount,
  'base_amount' => $baseAmount
]);
