<?php
// Mail transport:
// - "phpmail": uses built-in mail()
// - "smtp": minimal SMTP client (AUTH LOGIN, optional STARTTLS)

function mime_subject(string $s): string {
  // RFC 2047 encoded-word for UTF-8 subjects
  if (preg_match('/[^\x20-\x7E]/', $s)) {
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
  }
  return $s;
}

function send_mail(string $to, string $subject, string $body, ?string $from_override = null): bool {
  $config = require __DIR__ . '/config_loader.php';
  $transport = $config['emails']['transport'] ?? 'phpmail';
  $from = $from_override ?? ($config['emails']['from'] ?? 'noreply@localhost');
  $subject_enc = mime_subject($subject);

  if ($transport === 'smtp') {
    return send_mail_smtp($to, $subject_enc, $body, $from, $config['emails']['smtp'] ?? []);
  }
  $headers = "From: {$from}\r\nContent-Type: text/plain; charset=UTF-8\r\n";
  return @mail($to, $subject_enc, $body, $headers);
}

function send_mail_smtp(string $to, string $subject, string $body, string $from, array $smtp): bool {
  $host = $smtp['host'] ?? '';
  $port = (int)($smtp['port'] ?? 587);
  $user = $smtp['user'] ?? '';
  $pass = $smtp['pass'] ?? '';
  $secure = strtolower($smtp['secure'] ?? 'tls'); // tls|ssl|none

  if (!$host) return false;

  $remote = ($secure === 'ssl') ? "ssl://{$host}:{$port}" : "{$host}:{$port}";
  $fp = @stream_socket_client($remote, $errno, $errstr, 10, STREAM_CLIENT_CONNECT);
  if (!$fp) return false;
  stream_set_timeout($fp, 10);

  $read = function() use ($fp) {
    $out = '';
    while (!feof($fp)) {
      $line = fgets($fp, 515);
      if ($line === false) break;
      $out .= $line;
      if (preg_match('/^\d{3} /', $line)) break;
    }
    return $out;
  };
  $cmd = function($c) use ($fp, $read) {
    fwrite($fp, $c . "\r\n");
    return $read();
  };
  $ok = function($resp, $codes) {
    $code = (int)substr($resp, 0, 3);
    return in_array($code, (array)$codes, true);
  };

  $resp = $read(); if (!$ok($resp, 220)) return false;
  $resp = $cmd("EHLO localhost"); if (!$ok($resp, [250])) return false;

  if ($secure === 'tls') {
    $resp = $cmd("STARTTLS"); if (!$ok($resp, 220)) return false;
    if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) return false;
    $resp = $cmd("EHLO localhost"); if (!$ok($resp, [250])) return false;
  }

  if ($user !== '') {
    $resp = $cmd("AUTH LOGIN"); if (!$ok($resp, 334)) return false;
    $resp = $cmd(base64_encode($user)); if (!$ok($resp, 334)) return false;
    $resp = $cmd(base64_encode($pass)); if (!$ok($resp, 235)) return false;
  }

  $resp = $cmd("MAIL FROM:<{$from}>"); if (!$ok($resp, [250])) return false;
  $resp = $cmd("RCPT TO:<{$to}>"); if (!$ok($resp, [250, 251])) return false;
  $resp = $cmd("DATA"); if (!$ok($resp, 354)) return false;

  $headers = [
    "From: {$from}",
    "To: {$to}",
    "Subject: {$subject}",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ];
  $data = implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.";
  fwrite($fp, $data . "\r\n");
  $resp = $read(); if (!$ok($resp, 250)) return false;

  $cmd("QUIT");
  fclose($fp);
  return true;
}
