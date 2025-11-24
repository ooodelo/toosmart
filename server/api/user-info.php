<?php
/**
 * API: Get User Info
 * Returns current user email for settings modal
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../security.php';

Config::load();
Security::initSession();

header('Content-Type: application/json');

if (isset($_SESSION['premium_user'])) {
    echo json_encode([
        'status' => 'success',
        'email' => $_SESSION['premium_user']
    ]);
} else {
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unauthorized'
    ]);
}
