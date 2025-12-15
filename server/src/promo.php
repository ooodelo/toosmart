<?php
require_once __DIR__ . '/config_loader.php';

function promo_load_all(): array {
  $path = __DIR__ . '/../config/promo.json';
  if (!file_exists($path)) return [];
  $data = json_decode(file_get_contents($path), true);
  return is_array($data) ? $data : [];
}

function promo_load_usage(): array {
  $path = __DIR__ . '/../storage/promo_usage.json';
  if (!file_exists($path)) return [];
  $data = json_decode(file_get_contents($path), true);
  return is_array($data) ? $data : [];
}

function promo_save_usage(array $usage): void {
  $path = __DIR__ . '/../storage/promo_usage.json';
  if (!is_dir(dirname($path))) {
    mkdir(dirname($path), 0777, true);
  }
  file_put_contents($path, json_encode($usage, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function promo_find(string $code, array $promos) {
  $upper = mb_strtoupper(trim($code));
  foreach ($promos as $promo) {
    if (mb_strtoupper($promo['code'] ?? '') === $upper) {
      return $promo;
    }
  }
  return null;
}

function promo_is_valid(array $promo, string $email, float $baseAmount, array $usage, float &$finalAmount, string &$reason): bool {
  $finalAmount = $baseAmount;
  $reason = '';
  if (!$promo || empty($promo['code'])) { $reason = 'invalid'; return false; }
  $now = time();
  if (!empty($promo['starts_at']) && strtotime($promo['starts_at']) > $now) { $reason = 'not_started'; return false; }
  if (!empty($promo['ends_at']) && strtotime($promo['ends_at']) < $now) { $reason = 'expired'; return false; }
  $codeKey = mb_strtoupper($promo['code']);
  $totalUsed = $usage[$codeKey]['total'] ?? 0;
  $perUserUsed = $usage[$codeKey]['per_user'][mb_strtolower($email)] ?? 0;
  if (isset($promo['max_uses']) && $promo['max_uses'] !== '' && $promo['max_uses'] !== null) {
    if ($totalUsed >= (int)$promo['max_uses']) { $reason = 'limit_total'; return false; }
  }
  if (isset($promo['max_uses_per_user']) && $promo['max_uses_per_user'] !== '' && $promo['max_uses_per_user'] !== null) {
    if ($perUserUsed >= (int)$promo['max_uses_per_user']) { $reason = 'limit_user'; return false; }
  }
  $type = $promo['type'] ?? 'percent';
  $value = (float)($promo['value'] ?? 0);
  if ($value <= 0) { $reason = 'invalid_value'; return false; }
  if ($type === 'percent') {
    $finalAmount = max(0, $baseAmount - ($baseAmount * $value / 100));
  } else {
    $finalAmount = max(0, $baseAmount - $value);
  }
  return true;
}

function promo_increment_usage(string $code, string $email): void {
  $usage = promo_load_usage();
  $key = mb_strtoupper($code);
  $usage[$key]['total'] = ($usage[$key]['total'] ?? 0) + 1;
  $emailKey = mb_strtolower($email);
  $usage[$key]['per_user'][$emailKey] = ($usage[$key]['per_user'][$emailKey] ?? 0) + 1;
  promo_save_usage($usage);
}
