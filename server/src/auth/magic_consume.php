<?php
require_once __DIR__ . '/../utils.php';
$data = json_body();
$token = $data['token'] ?? '';
if (!$token)
  json_out(['error' => 'token_required'], 400);

$pdo = db();
$stmt = $pdo->prepare("SELECT ml.*, u.email FROM magic_links ml JOIN users u ON u.id=ml.user_id WHERE ml.token=? AND ml.consumed_at IS NULL");
$stmt->execute([$token]);
$row = $stmt->fetch();
if (!$row)
  json_out(['error' => 'token_invalid'], 404);
if (strtotime($row['expires_at']) < time())
  json_out(['error' => 'token_expired'], 410);

$pdo->prepare("UPDATE magic_links SET consumed_at=NOW() WHERE id=?")->execute([$row['id']]);

$cfg = require __DIR__ . '/../config_loader.php';
session_name($cfg['security']['session_name'] ?? 'cabinet_sess');
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'secure' => true,
  'httponly' => true,
  'samesite' => 'Lax'
]);
session_start();
session_regenerate_id(true);

$_SESSION['user_id'] = $row['user_id'];
$_SESSION['email'] = $row['email'];
$_SESSION['premium_user'] = $row['email'];  // совместимость с auth.php

json_out(['ok' => true, 'email' => $row['email']]);
