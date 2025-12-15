<?php
require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../robokassa/helpers.php';

$cfg = require __DIR__ . '/../config_loader.php';
$data = json_body();
$email = trim($data['email'] ?? '');
if (!$email)
  json_out(['error' => 'email_required'], 400);
if (!filter_var($email, FILTER_VALIDATE_EMAIL))
  json_out(['error' => 'email_invalid'], 400);

// product_code comes from request OR settings
$product_code = $data['product_code'] ?? ($cfg['robokassa']['product_code'] ?? null);
if (!$product_code)
  json_out(['error' => 'product_code_required'], 400);

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
$outSum = rk_format_outsum($amount_server);

// if client sent amount and it doesn't match, reject (anti-price-tamper)
if (isset($data['amount'])) {
  $amount_client = (float) $data['amount'];
  if (abs($amount_client - $amount_server) > 0.001) {
    json_out(['error' => 'amount_mismatch'], 400);
  }
}

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

$stmt = $pdo->prepare("INSERT INTO orders (inv_id,email,amount,status,receipt_json) VALUES (?,?,?,?,?)");
$stmt->execute([$invId, $email, $outSum, 'pending', $receipt_json]);

$shp = ['Shp_email' => $email, 'Shp_product' => $product_code];

$isTest = !empty($cfg['robokassa']['is_test']);
$pass1 = $isTest
  ? ($cfg['robokassa']['test_password1'] ?? $cfg['robokassa']['pass1'])
  : $cfg['robokassa']['pass1'];

$sign = rk_make_signature_start(
  $cfg['robokassa']['merchant_login'],
  $outSum,
  $invId,
  $pass1,
  $receipt_urlenc, // Receipt ОБЯЗАТЕЛЬНО участвует в подписи для режима Робочеки
  $shp,
  $cfg['robokassa']['signature_alg'] ?? 'md5'
);

$endpoint = "https://auth.robokassa.ru/Merchant/Index.aspx";

json_out([
  'endpoint' => $endpoint,
  'params' => [
    'MerchantLogin' => $cfg['robokassa']['merchant_login'],
    'OutSum' => $outSum,
    'InvId' => $invId,
    'Description' => $product['name'],
    'SignatureValue' => $sign,
    'IsTest' => ($cfg['robokassa']['is_test'] ?? false) ? 1 : 0,
    'Email' => $email,
    'Receipt' => $receipt_urlenc,
    'Shp_email' => $email,
    'Shp_product' => $product_code,
    'Culture' => 'ru',
    'Encoding' => 'utf-8',
    'SuccessURL' => $cfg['robokassa']['success_url'] ?? null,
    'FailURL' => $cfg['robokassa']['fail_url'] ?? null,
  ]
]);
