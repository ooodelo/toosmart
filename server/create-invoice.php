<?php
/**
 * API endpoint для создания счёта в Robokassa
 *
 * Принимает:
 * - POST JSON: { "email": "user@example.com" }
 *
 * Возвращает:
 * - { "success": true, "robokassa_url": "https://..." }
 * - { "success": false, "error": "..." }
 *
 * SECURITY:
 * - CSRF protection через Referer check
 * - Email validation
 * - Rate limiting
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

// CORS and security headers
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

Config::load();
Security::initSession();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Basic CSRF protection - check Referer
$referer = $_SERVER['HTTP_REFERER'] ?? '';
$allowedHost = Config::get('SITE_URL', 'https://toosmart.ru');
if (!str_starts_with($referer, $allowedHost)) {
    Security::secureLog('WARNING', 'Invalid referer for invoice creation', [
        'referer' => $referer
    ]);
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid request origin']);
    exit;
}

// Read JSON input
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['email'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email is required']);
    exit;
}

// Validate email
$email = Security::validateEmail($data['email']);
if (!$email) {
    Security::secureLog('WARNING', 'Invalid email for invoice', [
        'email' => $data['email']
    ]);
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid email format']);
    exit;
}

// Rate limiting (max 5 invoice creations per 15 minutes per email)
if (!Security::checkRateLimit($email, 5, 900)) {
    $timeRemaining = Security::getRateLimitTimeRemaining($email);
    Security::secureLog('WARNING', 'Rate limit for invoice creation', [
        'email' => $email,
        'time_remaining' => $timeRemaining
    ]);
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'error' => 'Too many requests. Please try again later.',
        'retry_after' => $timeRemaining
    ]);
    exit;
}

// Load Robokassa configuration
try {
    $merchantLogin = Config::require('ROBOKASSA_LOGIN');
    $password1 = Config::require('ROBOKASSA_PASSWORD1');
    $isTest = Config::getBool('ROBOKASSA_IS_TEST', true);
} catch (RuntimeException $e) {
    Security::secureLog('ERROR', 'Robokassa configuration missing', [
        'error' => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Payment system configuration error']);
    exit;
}

// Load pricing from config
$siteConfigPath = __DIR__ . '/../config/site.json';
$siteConfig = [];
if (file_exists($siteConfigPath)) {
    $siteConfig = json_decode(file_get_contents($siteConfigPath), true) ?? [];
}

$amount = $siteConfig['pricing']['currentAmount'] ?? 990;
$currency = $siteConfig['pricing']['currency'] ?? 'RUB';

// Generate unique invoice ID
$invoiceId = uniqid('CLEAN_', true);

// Calculate signature (MerchantLogin:OutSum:InvId:Password1:Shp_email)
$signatureString = "$merchantLogin:$amount:$invoiceId:$password1:Shp_email=$email";
$signature = md5($signatureString);

// Build Robokassa URL
$baseUrl = $isTest
    ? 'https://auth.robokassa.ru/Merchant/Index.aspx'
    : 'https://auth.robokassa.ru/Merchant/Index.aspx';

$params = [
    'MerchantLogin' => $merchantLogin,
    'OutSum' => $amount,
    'InvId' => $invoiceId,
    'Description' => urlencode('Курс "Clean - Теория правильной уборки"'),
    'SignatureValue' => $signature,
    'Shp_email' => $email,
    'Culture' => 'ru',
    'Encoding' => 'utf-8'
];

if ($isTest) {
    $params['IsTest'] = '1';
}

$robokassaUrl = $baseUrl . '?' . http_build_query($params);

Security::secureLog('INFO', 'Invoice created', [
    'invoice_id' => $invoiceId,
    'email_hash' => md5($email),
    'amount' => $amount
]);

// Return success response
echo json_encode([
    'success' => true,
    'robokassa_url' => $robokassaUrl,
    'invoice_id' => $invoiceId,
    'amount' => $amount,
    'currency' => $currency
]);
?>
