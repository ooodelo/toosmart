<?php
require_once __DIR__ . '/../../src/utils.php';

$cfg = require __DIR__ . '/../../src/config_loader.php';
$data = json_body();
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';

if (!$email || !$password) json_out(['error' => 'email_and_password_required'], 400);

$pdo = db();
$stmt = $pdo->prepare("SELECT * FROM users WHERE email=? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user) json_out(['error' => 'invalid_credentials'], 403);

if (!$user['password_hash']) {
  json_out(['error' => 'password_not_set'], 403);
}

if (!password_verify($password, $user['password_hash'])) {
  json_out(['error' => 'invalid_credentials'], 403);
}

session_name($cfg['security']['session_name'] ?? 'cabinet_sess');
session_start();
$_SESSION['user_id'] = $user['id'];
$_SESSION['email'] = $user['email'];

json_out(['success' => true, 'email' => $user['email']]);
