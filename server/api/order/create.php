<?php
// Подавляем вывод ошибок в stdout — всё в JSON
ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();

require_once __DIR__ . '/../../src/utils.php';
require_once __DIR__ . '/../../src/robokassa/helpers.php';
require_once __DIR__ . '/../../src/promo.php';

// Глобальный обработчик ошибок для возврата JSON
set_exception_handler(function ($e) {
  ob_end_clean();
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => 'server_error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
  exit;
});

$cfg = require __DIR__ . '/../../src/config_loader.php';
$data = json_body();
$email = trim($data['email'] ?? '');
if (!$email)
  json_out(['error' => 'email_required'], 400);
if (!filter_var($email, FILTER_VALIDATE_EMAIL))
  json_out(['error' => 'email_invalid'], 400);

// product_code comes from request OR settings
$product_code = $data['product_code'] ?? ($cfg['robokassa']['product_code'] ?? 'premium_course');

// load products
$products_path = __DIR__ . '/../../storage/products.json';
$products = file_exists($products_path) ? json_decode(file_get_contents($products_path), true) : null;
if (!is_array($products)) {
  $products = json_decode(file_get_contents(__DIR__ . '/../../storage/products.json.example'), true);
}

if (!isset($products[$product_code])) {
  json_out(['error' => 'product_not_found'], 400);
}
$product = $products[$product_code];

// server-side price is the source of truth
$amount_server = (float) $product['price'];
$promoCode = trim($data['promo_code'] ?? '');
$usage = promo_load_usage();
$promos = promo_load_all();
$promo = $promoCode ? promo_find($promoCode, $promos) : null;
$finalAmount = $amount_server;
$promoReason = '';
if ($promo) {
  if (!promo_is_valid($promo, $email, $amount_server, $usage, $finalAmount, $promoReason)) {
    json_out(['error' => 'promo_invalid', 'reason' => $promoReason], 400);
  }
}
$outSum = rk_format_outsum($finalAmount);

// if client sent amount and it doesn't match, reject (anti-price-tamper)
// Клиентская сумма игнорируется, серверная истина

// build receipt
$receipt = [
  'sno' => $cfg['robokassa']['default_sno'] ?? null,
  'items' => [
    [
      'name' => $product['name'],
      'quantity' => 1,
      'sum' => $outSum,
      'tax' => $product['tax'] ?? ($cfg['robokassa']['default_tax'] ?? 'none'),
      'payment_method' => $product['payment_method'] ?? 'full_payment',
      'payment_object' => $product['payment_object'] ?? 'service',
    ]
  ]
];
$receipt_json = json_encode($receipt, JSON_UNESCAPED_UNICODE);
$receipt_urlenc = rawurlencode($receipt_json);

// create order with unique InvId
$pdo = db();
do {
  $invId = random_int(1, 2147483647);
  $stmt = $pdo->prepare("SELECT id FROM orders WHERE inv_id=?");
  $stmt->execute([$invId]);
  $exists = $stmt->fetch();
} while ($exists);

$stmt = $pdo->prepare("INSERT INTO orders (inv_id,email,amount,promo_code,promo_discount,status,receipt_json) VALUES (?,?,?,?,?,?,?)");
$stmt->execute([$invId, $email, $outSum, $promo ? $promo['code'] : null, $promo ? $outSum : null, 'pending', $receipt_json]);

$shp = ['Shp_email' => $email, 'Shp_product' => $product_code];
if ($promo) {
  $shp['Shp_promo'] = $promo['code'];
}

$isTest = !empty($cfg['robokassa']['is_test']);
$pass1 = $isTest
  ? ($cfg['robokassa']['test_password1'] ?? $cfg['robokassa']['pass1'])
  : $cfg['robokassa']['pass1'];

$sign = rk_make_signature_start(
  $cfg['robokassa']['merchant_login'],
  $outSum,
  $invId,
  $pass1,
  $shp,
  $cfg['robokassa']['signature_alg'] ?? 'md5'
);

$endpoint = "https://auth.robokassa.ru/Merchant/Index.aspx";

$params = [
  'MerchantLogin' => $cfg['robokassa']['merchant_login'],
  'OutSum' => $outSum,
  'OutSumCurrency' => 'RUB',
  'InvId' => $invId,
  'Description' => $product['name'],
  'SignatureValue' => $sign,
  'Email' => $email,
  // Receipt параметр убран, так как в ЛК Robokassa выбрано "Самостоятельное" (без интеграции)
  // Чек сохраняется в БД (receipt_json) для последующей самостоятельной фискализации
  'Shp_email' => $email,
  'Shp_product' => $product_code,
  'Culture' => 'ru',
  'Encoding' => 'utf-8',
  'SuccessURL' => $cfg['robokassa']['success_url'] ?? null,
  'FailURL' => $cfg['robokassa']['fail_url'] ?? null,
];
if ($isTest) {
  $params['IsTest'] = 1;
}
if ($promo) {
  $params['Shp_promo'] = $promo['code'];
}
// remove nulls
$params = array_filter($params, fn($v) => $v !== null && $v !== '');

// DEBUG: Log parameters for troubleshooting
$debug_info = [
  'endpoint' => $endpoint,
  'params' => $params,
  'debug' => [
    'isTest' => $isTest,
    'merchant_login' => $cfg['robokassa']['merchant_login'],
    'amount' => $outSum,
    'invId' => $invId,
    'signature' => $sign,
    'receipt_saved_to_db' => true // чек сохранен в БД для самостоятельной фискализации
  ]
];

json_out([
  'endpoint' => $endpoint,
  'params' => $params
]);
