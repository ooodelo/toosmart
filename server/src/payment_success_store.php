<?php
/**
 * Временное хранилище данных для показа модалки успеха после оплаты.
 * Хранение в файле server/storage/payment-success.json с автоочисткой.
 */

function payment_success_store_path(): string
{
    return __DIR__ . '/../storage/payment-success.json';
}

function payment_success_load_store(): array
{
    $path = payment_success_store_path();
    if (!file_exists($path)) {
        return [];
    }
    $raw = @file_get_contents($path);
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function payment_success_save_store(array $store): void
{
    $path = payment_success_store_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $json = json_encode($store, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    file_put_contents($path, $json, LOCK_EX);
}

function payment_success_clean(array $store): array
{
    $now = time();
    foreach ($store as $key => $row) {
        $expires = $row['expires_at'] ?? 0;
        if ($expires && $expires < $now) {
            unset($store[$key]);
        }
    }
    return $store;
}

/**
 * Сохранить данные для последующего показа модалки.
 */
function payment_success_store(int $invId, string $email, string $password, float $outSum, int $ttlSeconds = 900): void
{
    $store = payment_success_load_store();
    $store = payment_success_clean($store);

    $store[(string)$invId] = [
        'email' => $email,
        'password' => $password,
        'out_sum' => $outSum,
        'created_at' => time(),
        'expires_at' => time() + $ttlSeconds
    ];

    payment_success_save_store($store);
}

/**
 * Извлечь и пометить использованной записью для показа модалки.
 */
function payment_success_consume(int $invId): ?array
{
    $store = payment_success_load_store();
    $store = payment_success_clean($store);

    $key = (string)$invId;
    if (!isset($store[$key])) {
        return null;
    }

    $payload = $store[$key];
    unset($store[$key]);
    payment_success_save_store($store);

    return $payload;
}
