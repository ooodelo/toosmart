<?php
/**
 * POST /admin/api/update-email-template.php
 * Сохранение email-шаблона и генерация HTML
 */

header('Content-Type: application/json; charset=utf-8');

// Получаем данные
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_json']));
}

// Валидация
$subject = trim($data['subject'] ?? '');
$title = trim($data['title'] ?? 'Спасибо за покупку!');
$subtitle = trim($data['subtitle'] ?? 'Курс «Слишком умная уборка»');
$credentials_label = trim($data['credentials_label'] ?? 'Ваши данные для входа:');
$button_text = trim($data['button_text'] ?? 'Войти в личный кабинет');
$warning = trim($data['warning'] ?? 'Сохраните это письмо — пароль больше нигде не отображается');

if (empty($subject) || mb_strlen($subject) > 255) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_subject']));
}

if (empty($title) || mb_strlen($title) > 255) {
    http_response_code(400);
    die(json_encode(['error' => 'invalid_title']));
}

// Генерируем HTML body из полей
$body = '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Доступ к курсу</title></head><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;"><tr><td align="center"><table width="100%" style="max-width:480px;background:#ffffff;border-radius:24px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;"><tr><td style="padding:40px 32px 24px;text-align:center;"><div style="font-size:32px;margin-bottom:12px;">🎉</div><h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">' . htmlspecialchars($title) . '</h1><p style="margin:0;font-size:15px;color:#666;">' . htmlspecialchars($subtitle) . '</p></td></tr><tr><td style="padding:0 32px 32px;"><div style="background:#f8f9fa;border-radius:16px;padding:24px;"><p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#333;text-align:center;">' . htmlspecialchars($credentials_label) . '</p><div style="margin-bottom:12px;"><span style="display:block;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600;">Email</span><div style="background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;padding:12px 14px;font-size:15px;color:#1a1a1a;font-family:monospace;">{{email}}</div></div><div><span style="display:block;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600;">Пароль</span><div style="background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;padding:12px 14px;font-size:15px;color:#1a1a1a;font-family:monospace;">{{password}}</div></div></div></td></tr><tr><td style="padding:0 32px 24px;text-align:center;"><a href="{{site_url}}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;">' . htmlspecialchars($button_text) . '</a></td></tr><tr><td style="padding:0 32px 32px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;color:#999;">⚠️ ' . htmlspecialchars($warning) . '</p><p style="margin:0;font-size:12px;color:#999;">Вопросы? Напишите на <a href="mailto:{{reply_to}}" style="color:#667eea;">{{reply_to}}</a></p></td></tr></table></td></tr></table></body></html>';

// Читаем email-templates.json
$templates_path = __DIR__ . '/../../server/storage/email-templates.json';

if (!file_exists($templates_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'templates_not_found']));
}

$templates = json_decode(file_get_contents($templates_path), true);

// Обновляем с новой структурой
$templates['welcome'] = [
    'subject' => $subject,
    'title' => $title,
    'subtitle' => $subtitle,
    'credentials_label' => $credentials_label,
    'button_text' => $button_text,
    'warning' => $warning,
    'body' => $body
];

// Сохраняем
file_put_contents($templates_path, json_encode($templates, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo json_encode([
    'success' => true
], JSON_UNESCAPED_UNICODE);
