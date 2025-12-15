<?php
function rk_format_outsum($amount): string
{
  return number_format((float) $amount, 2, '.', '');
}
function rk_hash_string(string $s, string $alg = 'md5'): string
{
  $alg = strtolower($alg);
  if ($alg === 'sha256')
    return hash('sha256', $s);
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
  // Формула согласно официальной документации Robokassa (docs.robokassa.ru):
  // MerchantLogin:OutSum:InvId[:Receipt]:Password#1[:Shp_xxx=yyy:...]
  //
  // ВАЖНО:
  // 1. Receipt (если передается) ДОЛЖЕН участвовать в подписи после InvId
  // 2. Shp параметры идут ПОСЛЕ пароля, в алфавитном порядке
  // 3. Receipt передается URL-encoded
  //
  // Пример: login:5490.00:12345:{receipt_urlencoded}:Password1:Shp_email=test@test.ru:Shp_product=course

  $parts = [$login, $outSum, (string) $invId];

  // Receipt включается в подпись если передается (для режима Робочеки)
  if ($receipt !== null && $receipt !== '') {
    $parts[] = $receipt;
  }

  // Пароль идет после Receipt (или после InvId если Receipt пустой)
  $parts[] = $pass1;

  // Shp параметры идут ПОСЛЕ пароля, в алфавитном порядке
  ksort($shp);
  foreach ($shp as $k => $v)
    $parts[] = "$k=$v";

  return rk_hash_string(implode(':', $parts), $alg);
}
function rk_make_signature_result(
  string $outSum,
  int $invId,
  string $pass2,
  array $shp = [],
  string $alg = 'md5'
): string {
  // Формула для Result URL согласно официальной документации Robokassa:
  // OutSum:InvId:Password#2[:Shp_xxx=yyy:...]
  //
  // ВАЖНО: Shp параметры идут ПОСЛЕ пароля, в алфавитном порядке!
  // Пример: 5490.00:12345:Password2:Shp_email=test@test.ru:Shp_product=course

  $parts = [$outSum, (string) $invId];

  // Пароль идет сразу после InvId
  $parts[] = $pass2;

  // Shp параметры идут ПОСЛЕ пароля, в алфавитном порядке
  ksort($shp);
  foreach ($shp as $k => $v)
    $parts[] = "$k=$v";

  return rk_hash_string(implode(':', $parts), $alg);
}
function rk_extract_shp(array $src): array
{
  $out = [];
  foreach ($src as $k => $v) {
    if (stripos($k, 'Shp_') === 0)
      $out[$k] = $v;
  }
  return $out;
}
