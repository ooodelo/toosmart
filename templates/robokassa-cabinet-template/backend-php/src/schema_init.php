<?php
require_once __DIR__ . '/utils.php';
function ensure_schema(PDO $pdo): void {
  $sql = file_get_contents(__DIR__ . '/../sql/schema.sql');
  foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
    $pdo->exec($stmt);
  }
}
