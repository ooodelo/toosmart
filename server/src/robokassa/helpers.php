<?php
function rk_format_outsum($amount): string {
  return number_format((float)$amount, 2, '.', '');
}
function rk_hash_string(string $s, string $alg = 'md5'): string {
  $alg = strtolower($alg);
  if ($alg === 'sha256') return hash('sha256', $s);
  return md5($s);
}
function rk_make_signature_start(
  string $login,
  string $outSum,
  int $invId,
  string $pass1,
  ?string $receipt = null,
  array $shp = [],
  string $alg = 'md5'
): string {
  $parts = [$login, $outSum, (string)$invId];
  if ($receipt !== null) $parts[] = $receipt;
  ksort($shp);
  foreach ($shp as $k => $v) $parts[] = "$k=$v";
  $parts[] = $pass1;
  return rk_hash_string(implode(':', $parts), $alg);
}
function rk_make_signature_result(
  string $outSum,
  int $invId,
  string $pass2,
  array $shp = [],
  string $alg = 'md5'
): string {
  $parts = [$outSum, (string)$invId];
  ksort($shp);
  foreach ($shp as $k => $v) $parts[] = "$k=$v";
  $parts[] = $pass2;
  return rk_hash_string(implode(':', $parts), $alg);
}
function rk_extract_shp(array $src): array {
  $out = [];
  foreach ($src as $k => $v) {
    if (stripos($k, 'Shp_') === 0) $out[$k] = $v;
  }
  return $out;
}
