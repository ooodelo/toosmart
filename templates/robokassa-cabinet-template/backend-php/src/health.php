<?php
require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/schema_init.php';
$issues = [];
try {
  $pdo = db();
  ensure_schema($pdo);
} catch (Throwable $e) {
  $issues[] = 'db_error: ' . $e->getMessage();
}
$cfg = require __DIR__ . '/config_loader.php';
foreach (['merchant_login','pass1','pass2'] as $k) {
  if (empty($cfg['robokassa'][$k] ?? null) || ($cfg['robokassa'][$k] === 'CHANGE_ME')) {
    $issues[] = 'robokassa_not_set: ' . $k;
  }
}
json_out(['ok' => count($issues) === 0, 'issues' => $issues]);
