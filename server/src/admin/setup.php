<?php
require_once __DIR__ . '/admin_guard.php';
$settings_file = __DIR__ . '/../../storage/settings.json';
$example_file = __DIR__ . '/../../storage/settings.json.example';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $json = $_POST['json'] ?? '';
  json_decode($json);
  if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400); echo "invalid_json"; exit;
  }
  file_put_contents($settings_file, $json);
  header("Location: /admin/setup?token=" . urlencode($_GET['token']));
  exit;
}

$current = file_exists($settings_file) ? file_get_contents($settings_file) : file_get_contents($example_file);
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html><head><title>Admin Setup</title></head>
<body style="font-family:system-ui;max-width:900px;margin:20px auto;">
<h2>Robokassa Cabinet — Setup</h2>
<form method="post">
<textarea name="json" style="width:100%;height:520px;font-family:monospace;"><?php echo htmlspecialchars($current); ?></textarea>
<br><br><button type="submit">Save settings.json</button>
</form>
</body></html>
