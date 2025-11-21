<?php
require_once __DIR__ . '/../../src/utils.php';

$cfg = require __DIR__ . '/../../src/config_loader.php';

session_name($cfg['security']['session_name'] ?? 'cabinet_sess');
session_start();

if (!isset($_SESSION['user_id'])) {
  json_out(['error' => 'not_authenticated'], 401);
}

$data = json_body();
$password = $data['password'] ?? '';

if (strlen($password) < 6) {
  json_out(['error' => 'password_too_short'], 400);
}

$hash = password_hash($password, PASSWORD_DEFAULT);

$pdo = db();
$stmt = $pdo->prepare("UPDATE users SET password_hash=? WHERE id=?");
$stmt->execute([$hash, $_SESSION['user_id']]);

json_out(['success' => true]);
