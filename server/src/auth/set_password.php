<?php
require_once __DIR__ . '/../utils.php';
$cfg = require __DIR__ . '/../config_loader.php';
session_name($cfg['security']['session_name'] ?? 'cabinet_sess');
session_start();
$uid = $_SESSION['user_id'] ?? null;
if (!$uid) json_out(['error'=>'unauthorized'], 401);

$data = json_body();
$pw = $data['password'] ?? '';
if (strlen($pw) < 6) json_out(['error'=>'password_too_short'], 400);

$hash = password_hash($pw, PASSWORD_DEFAULT);
$pdo = db();
$pdo->prepare("UPDATE users SET password_hash=? WHERE id=?")->execute([$hash, $uid]);

json_out(['ok'=>True]);
