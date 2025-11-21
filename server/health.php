<?php
require_once __DIR__ . '/src/utils.php';
require_once __DIR__ . '/src/schema_init.php';

header('Content-Type: application/json');

try {
  $pdo = db();
  ensure_schema($pdo);

  $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM users");
  $result = $stmt->fetch();

  echo json_encode([
    'status' => 'ok',
    'database' => 'connected',
    'users_count' => $result['cnt'],
    'timestamp' => date('Y-m-d H:i:s')
  ]);
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode([
    'status' => 'error',
    'message' => $e->getMessage()
  ]);
}
