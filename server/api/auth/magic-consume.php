<?php
require_once __DIR__ . '/../../src/utils.php';

$cfg = require __DIR__ . '/../../src/config_loader.php';
$data = json_body();
$token = $data['token'] ?? null;

if (!$token)
  json_out(['error' => 'token_required'], 400);

$pdo = db();
$stmt = $pdo->prepare("
  SELECT ml.*, u.email
  FROM magic_links ml
  JOIN users u ON u.id = ml.user_id
  WHERE ml.token=? AND ml.consumed_at IS NULL AND ml.expires_at > NOW()
  LIMIT 1
");
$stmt->execute([$token]);
$link = $stmt->fetch();

if (!$link)
  json_out(['error' => 'invalid_or_expired_token'], 403);

$stmt = $pdo->prepare("UPDATE magic_links SET consumed_at=NOW() WHERE id=?");
$stmt->execute([$link['id']]);

session_name($cfg['security']['session_name'] ?? 'cabinet_sess');
session_start();
$_SESSION['user_id'] = $link['user_id'];
$_SESSION['email'] = $link['email'];
$_SESSION['premium_user'] = $link['email'];  // совместимость с auth.php

json_out(['success' => true, 'email' => $link['email']]);
