<?php
/**
 * Failed Payment Page
 */
?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Оплата не прошла</title>
    <link rel="stylesheet" href="../free/styles.css">
    <style>
        .fail-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
            padding: 20px;
        }

        .fail-container {
            background: white;
            padding: 48px;
            border-radius: 16px;
            max-width: 560px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
        }

        .crossmark {
            font-size: 72px;
            color: #ff6b6b;
            margin-bottom: 24px;
        }

        .fail-container h1 {
            color: #333;
            margin-bottom: 16px;
        }

        .fail-container p {
            color: #666;
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .btn-retry {
            display: inline-block;
            padding: 16px 32px;
            background: #ff6b6b;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 18px;
            margin-top: 24px;
            transition: transform 0.2s;
        }

        .btn-retry:hover {
            transform: translateY(-2px);
            background: #fa5252;
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

<body class="fail-page">
    <div class="fail-container">
        <div class="crossmark">✕</div>
        <h1>Оплата не прошла</h1>
        <p>К сожалению, при обработке платежа произошла ошибка.</p>
        <p>Вы можете попробовать оплатить снова или связаться с поддержкой.</p>

        <a href="/" class="btn-retry">Попробовать снова</a>

        <div class="note">
            Нужна помощь? <a href="mailto:support@toosmart.com">Напишите нам</a>
        </div>
    </div>
</body>

</html>