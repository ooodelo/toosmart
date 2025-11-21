<?php
$settings = __DIR__ . '/../storage/settings.json';
if (file_exists($settings)) {
  $json = json_decode(file_get_contents($settings), true);
  if (is_array($json)) return $json;
}
$cfg = __DIR__ . '/config.php';
if (file_exists($cfg)) return require $cfg;
return require __DIR__ . '/config.php.example';
