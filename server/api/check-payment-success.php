<?php
/**
 * API endpoint to check if payment success data is available.
 * Used for polling when Success URL arrives before Result URL callback.
 */

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../security.php';
require_once __DIR__ . '/../src/payment_success_store.php';

Config::load();

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get InvId from query
$invId = isset($_GET['inv_id']) ? (int)$_GET['inv_id'] : null;

if (!$invId || $invId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid inv_id']);
    exit;
}

// Check if data exists (without consuming it)
$store = payment_success_load_store();
$store = payment_success_clean($store);
$key = (string)$invId;

if (isset($store[$key])) {
    // Data is ready - return success without exposing sensitive data
    echo json_encode([
        'ready' => true,
        'email' => $store[$key]['email'] ?? null
    ]);
} else {
    // Data not yet available
    echo json_encode([
        'ready' => false
    ]);
}
