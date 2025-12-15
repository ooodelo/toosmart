<?php
// ТЕСТОВАЯ ВЕРСИЯ БЕЗ ФИСКАЛИЗАЦИИ - для отладки ошибки "No payment methods available"
// Используйте этот файл временно, чтобы проверить минимальный набор параметров

ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();

require_once __DIR__ . '/../../src/utils.php';
require_once __DIR__ . '/../../src/robokassa/helpers.php';

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

// Fixed test amount
$amount = 5490.0;
$outSum = rk_format_outsum($amount);

// Create order
$pdo = db();
do {
  $invId = random_int(1, 2147483647);
  $stmt = $pdo->prepare("SELECT id FROM orders WHERE inv_id=?");
  $stmt->execute([$invId]);
  $exists = $stmt->fetch();
} while ($exists);

$stmt = $pdo->prepare("INSERT INTO orders (inv_id,email,amount,status) VALUES (?,?,?,?)");
$stmt->execute([$invId, $email, $outSum, 'pending']);

// Minimal params without Receipt
$shp = ['Shp_email' => $email];

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

// MINIMAL PARAMS - без Receipt, без OutSumCurrency
$params = [
  'MerchantLogin' => $cfg['robokassa']['merchant_login'],
  'OutSum' => $outSum,
  'InvId' => $invId,
  'Description' => 'Курс Clean - Теория правильной уборки',
  'SignatureValue' => $sign,
  'Email' => $email,
  'Shp_email' => $email,
  'Culture' => 'ru',
  'Encoding' => 'utf-8',
];

if ($isTest) {
  $params['IsTest'] = 1;
}

// Debug info
$debug = [
  'test_mode' => $isTest,
  'merchant' => $cfg['robokassa']['merchant_login'],
  'amount' => $outSum,
  'invId' => $invId,
  'password_used' => $isTest ? 'test_password1' : 'pass1',
  'signature_formula' => "{$cfg['robokassa']['merchant_login']}:{$outSum}:{$invId}:Shp_email={$email}:{password}",
  'signature_result' => $sign
];

json_out([
  'endpoint' => $endpoint,
  'params' => $params,
  'debug' => $debug
]);
