<?php
$config = require __DIR__ . '/../config_loader.php';
$expected = $config['security']['admin_token'] ?? getenv('ADMIN_TOKEN') ?? null;
if (!$expected) { http_response_code(403); echo "admin_token_not_set"; exit; }
$given = $_GET['token'] ?? ($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? null);
if (!$given || !hash_equals((string)$expected, (string)$given)) {
  http_response_code(403); echo "forbidden"; exit;
}
