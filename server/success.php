<?php
/**
 * Robokassa Success URL - страница после успешной оплаты
 * URL в настройках Robokassa: https://toosmart.com/premium/success.php
 */

$email = $_GET['Shp_email'] ?? '';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Оплата прошла успешно</title>
    <link rel="stylesheet" href="../free/styles.css">
    <style>
        .success-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        .success-container {
            background: white;
            padding: 48px;
            border-radius: 16px;
            max-width: 560px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .checkmark {
            font-size: 72px;
            color: #4caf50;
            margin-bottom: 24px;
        }
        .success-container h1 {
            color: #333;
            margin-bottom: 16px;
        }
        .success-container p {
            color: #666;
            line-height: 1.6;
            margin-bottom: 16px;
        }
        .email-box {
            background: #f5f5f5;
            padding: 16px;
            border-radius: 8px;
            margin: 24px 0;
            font-family: monospace;
            font-size: 16px;
            color: #333;
        }
        .btn-login {
            display: inline-block;
            padding: 16px 32px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 18px;
            margin-top: 24px;
            transition: transform 0.2s;
        }
        .btn-login:hover {
            transform: translateY(-2px);
        }
        .note {
            font-size: 14px;
            color: #999;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body class="success-page">
    <div class="success-container">
        <div class="checkmark">✓</div>
        <h1>Оплата прошла успешно!</h1>
        <p>Спасибо за покупку курса «Clean - Теория правильной уборки».</p>

        <?php if ($email): ?>
            <p><strong>Проверьте вашу почту:</strong></p>
            <div class="email-box"><?= htmlspecialchars($email) ?></div>
        <?php endif; ?>

        <p>Мы отправили вам письмо с данными для входа в закрытую версию курса.</p>
        <p>Письмо может прийти в течение 1-2 минут. Проверьте папку "Спам", если не видите письмо во входящих.</p>

        <a href="index.php" class="btn-login">Войти в закрытую версию →</a>

        <div class="note">
            Не получили письмо? <a href="mailto:support@toosmart.com">Напишите нам</a>
        </div>
    </div>
</body>
</html>
