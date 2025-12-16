<?php
/**
 * Robokassa Success URL
 * Redirects to the main app with a query param to open the success modal.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';

Config::load();
Security::initSession();

// Redirect to premium index with success flag and сохраняем параметры Robokassa (InvId/OutSum/Signature/Shp_*)
$query = $_SERVER['QUERY_STRING'] ?? '';
$target = '/server/?payment=success';
if (!empty($query)) {
    $target .= (strpos($target, '?') !== false ? '&' : '?') . $query;
}

header('Location: ' . $target);
exit;
