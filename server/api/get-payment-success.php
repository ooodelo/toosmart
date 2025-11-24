<?php
/**
 * API: Get Payment Success Data
 * Returns the new password and email from session for the success modal.
 * Clears the password from session after retrieval for security.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../security.php';

Config::load();
Security::initSession();

header('Content-Type: application/json');

// Check if user is authenticated or has just paid
// We rely on session variables set by robokassa-callback.php

$password = $_SESSION['new_password'] ?? null;
$email = $_SESSION['new_password_email'] ?? $_SESSION['premium_user'] ?? null;
$timestamp = $_SESSION['new_password_timestamp'] ?? null;

// Check expiration (10 mins)
if ($timestamp && (time() - $timestamp) > 600) {
    $password = null;
}

if ($password) {
    // Return data and clear password from session
    echo json_encode([
        'status' => 'success',
        'email' => $email,
        'password' => $password
    ]);

    // Clear sensitive data
    unset($_SESSION['new_password']);
    unset($_SESSION['new_password_timestamp']);
    // We keep 'new_password_email' or 'premium_user' to know who is logged in
} else {
    echo json_encode([
        'status' => 'error',
        'message' => 'No active payment session or password expired'
    ]);
}
