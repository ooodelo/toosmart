<?php
/**
 * Robokassa Success URL
 * Redirects to the main app with a query param to open the success modal.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Redirect to premium index with success flag
header('Location: /premium/?payment=success');
exit;