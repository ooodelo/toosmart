<?php
require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../robokassa/helpers.php';
require_once __DIR__ . '/../mailer.php';
require_once __DIR__ . '/../schema_init.php';

$cfg = require __DIR__ . '/../config_loader.php';
$alg = $cfg['robokassa']['signature_alg'] ?? 'md5';

$src = ($_SERVER['REQUEST_METHOD'] === 'POST') ? $_POST : $_GET;
$outSum = $src['OutSum'] ?? null;
$invId = isset($src['InvId']) ? (int)$src['InvId'] : null;
$sig = strtoupper($src['SignatureValue'] ?? '');
$shp = rk_extract_shp($src);

if (!$outSum || !$invId || !$sig) { http_response_code(400); echo "bad_request"; exit; }

$calc = strtoupper(rk_make_signature_result($outSum, $invId, $cfg['robokassa']['pass2'], $shp, $alg));
if (!hash_equals($calc, $sig)) { http_response_code(403); echo "bad_signature"; exit; }

$pdo = db();
ensure_schema($pdo);

$stmt = $pdo->prepare("SELECT * FROM orders WHERE inv_id=?");
$stmt->execute([$invId]);
$order = $stmt->fetch();

$email = $shp['Shp_email'] ?? ($src['EMail'] ?? $src['Email'] ?? null);
if (!$email) $email = $order['email'] ?? null;
if (!$email) { http_response_code(400); echo "email_missing"; exit; }

// If order exists, verify OutSum matches stored amount (anti-logic mismatch)
if ($order) {
  $stored = (float)$order['amount'];
  $got = (float)$outSum;
  if (abs($stored - $got) > 0.001) {
    http_response_code(409);
    echo "amount_mismatch";
    exit;
  }
  if ($order['status'] === 'paid') { echo "OK{$invId}"; exit; }
}

if (!$order) {
  $stmt = $pdo->prepare("INSERT INTO orders (inv_id,email,amount,status) VALUES (?,?,?,?)");
  $stmt->execute([$invId, $email, $outSum, 'pending']);
}

// Generate password for new users or if they don't have one?
// Actually, better to always generate a password for new users.
// For existing users, we shouldn't overwrite their password unless they requested it.
// But if they just bought the course, maybe they expect a password?
// Let's generate password only if it's a NEW user.
// If existing user, we just send magic link.

$password_generated = null;

if (!$user) {
  $password_generated = bin2hex(random_bytes(4)); // 8 chars
  $hash = password_hash($password_generated, PASSWORD_BCRYPT);
  
  $stmt = $pdo->prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
  $stmt->execute([$email, $hash]);
  $uid = (int)$pdo->lastInsertId();
} else {
  $uid = (int)$user['id'];
  // Optional: check if user has no password (e.g. created via magic link before)
  if (empty($user['password_hash'])) {
      $password_generated = bin2hex(random_bytes(4));
      $hash = password_hash($password_generated, PASSWORD_BCRYPT);
      $stmt = $pdo->prepare("UPDATE users SET password_hash=? WHERE id=?");
      $stmt->execute([$hash, $uid]);
  }
}

// magic link
$token = bin2hex(random_bytes(32));
$expires = (new DateTime('+1 day'))->format('Y-m-d H:i:s');
$stmt = $pdo->prepare("INSERT INTO magic_links (user_id,token,expires_at) VALUES (?,?,?)");
$stmt->execute([$uid, $token, $expires]);

// grant access (bessrochnyi by default)
$stmt = $pdo->prepare("INSERT INTO access (user_id,granted_at,ends_at) VALUES (?,?,NULL)
  ON DUPLICATE KEY UPDATE granted_at=VALUES(granted_at)");
$stmt->execute([$uid, (new DateTime())->format('Y-m-d H:i:s')]);

$stmt = $pdo->prepare("UPDATE orders SET status='paid', paid_at=NOW() WHERE inv_id=?");
$stmt->execute([$invId]);

// base url for user links
$base_url = $cfg['site']['base_url'] ?? null;
if (!$base_url) {
  $origin = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
  $base_url = $origin;
}
$base_url = rtrim($base_url, '/');
$magic_url = $base_url . '/server/magic?token=' . $token . '&email=' . rawurlencode($email);

$body = "Оплата получена. Спасибо за покупку!\n\n";
$body .= "Ваш доступ к курсу:\n";
if ($password_generated) {
    $body .= "Email: {$email}\n";
    $body .= "Пароль: {$password_generated}\n\n";
}
$body .= "Быстрый вход по ссылке (действует 24 часа):\n{$magic_url}\n\n";
$body .= "Если ссылка не работает — используйте Email и Пароль на странице входа.";

send_mail($email, "Доступ к курсу Clean", $body);

echo "OK{$invId}";
