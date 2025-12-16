<?php
/**
 * GET /admin/api/get-email-template.php
 * Получение email-шаблона
 */

header('Content-Type: application/json; charset=utf-8');

// Читаем email-templates.json
$templates_path = __DIR__ . '/../../server/storage/email-templates.json';

if (!file_exists($templates_path)) {
    http_response_code(404);
    die(json_encode(['error' => 'templates_not_found']));
}

$templates = json_decode(file_get_contents($templates_path), true);

if (!isset($templates['welcome'])) {
    http_response_code(404);
    die(json_encode(['error' => 'template_not_found']));
}

$template = $templates['welcome'];

echo json_encode([
    'success' => true,
    'template' => [
        'subject' => $template['subject'] ?? 'Слишком Умная Уборка — Ваш доступ к курсу',
        'title' => $template['title'] ?? 'Спасибо за покупку!',
        'subtitle' => $template['subtitle'] ?? 'Курс «Слишком умная уборка»',
        'credentials_label' => $template['credentials_label'] ?? 'Ваши данные для входа:',
        'button_text' => $template['button_text'] ?? 'Войти в личный кабинет',
        'warning' => $template['warning'] ?? 'Сохраните это письмо — пароль больше нигде не отображается'
    ]
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
