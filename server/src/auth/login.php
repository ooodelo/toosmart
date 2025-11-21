<?php
require_once __DIR__ . '/../utils.php';
$data = json_body();
$email = trim($data['email'] ?? '');
$pw = $data['password'] ?? '';
if (!$email || !$pw) json_out(['error'=>'email_password_required'], 400);

$pdo = db();
$stmt = $pdo->prepare("SELECT * FROM users WHERE email=?");
$stmt->execute([$email]);
$user = $stmt->fetch();
if (!$user || !$user['password_hash'] || !password_verify($pw, $user['password_hash'])) {
  json_out(['error'=>'invalid_credentials'], 403);
}

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

$_SESSION['user_id'] = $user['id'];
$_SESSION['email'] = $email;

json_out(['ok'=>true]);
