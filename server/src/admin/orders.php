<?php
require_once __DIR__ . '/admin_guard.php';
require_once __DIR__ . '/../utils.php';
$pdo = db();
$rows = $pdo->query("SELECT inv_id,email,amount,status,created_at,paid_at FROM orders ORDER BY created_at DESC LIMIT 200")->fetchAll();
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html><head><title>Orders</title></head>
<body style="font-family:system-ui;max-width:900px;margin:20px auto;">
<h2>Orders (last 200)</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;">
<tr><th>InvId</th><th>Email</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th></tr>
<?php foreach ($rows as $r): ?>
<tr>
<td><?php echo (int)$r['inv_id']; ?></td>
<td><?php echo htmlspecialchars($r['email']); ?></td>
<td><?php echo htmlspecialchars($r['amount']); ?></td>
<td><?php echo htmlspecialchars($r['status']); ?></td>
<td><?php echo htmlspecialchars($r['created_at']); ?></td>
<td><?php echo htmlspecialchars($r['paid_at'] ?? ''); ?></td>
</tr>
<?php endforeach; ?>
</table>
</body></html>
