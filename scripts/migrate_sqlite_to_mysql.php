#!/usr/bin/env php
<?php
/**
 * Скрипт миграции данных из SQLite в MySQL
 *
 * Переносит пользователей из старой SQLite базы в новую MySQL базу
 *
 * Использование:
 *   php scripts/migrate_sqlite_to_mysql.php
 */

echo "========================================\n";
echo "Миграция данных из SQLite в MySQL\n";
echo "========================================\n\n";

// Подключаем конфигурацию MySQL
require_once __DIR__ . '/../server/src/utils.php';
require_once __DIR__ . '/../server/src/schema_init.php';

// Путь к SQLite базе
$sqlitePath = __DIR__ . '/../server/data/db/toosmart.db';

if (!file_exists($sqlitePath)) {
    echo "⚠️  SQLite база не найдена: $sqlitePath\n";
    echo "Нет данных для миграции. Пропускаем.\n";
    exit(0);
}

try {
    // Подключение к старой SQLite базе
    echo "📂 Подключение к SQLite базе...\n";
    $sqlite = new PDO("sqlite:$sqlitePath");
    $sqlite->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Подключение к новой MySQL базе
    echo "🔌 Подключение к MySQL базе...\n";
    $mysql = db();
    ensure_schema($mysql);

    // Читаем пользователей из SQLite
    echo "📖 Чтение пользователей из SQLite...\n";
    $stmt = $sqlite->query("SELECT * FROM users ORDER BY id");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($users)) {
        echo "✅ Пользователей не найдено. Миграция не требуется.\n";
        exit(0);
    }

    echo "Найдено пользователей: " . count($users) . "\n\n";

    $migrated = 0;
    $skipped = 0;
    $errors = 0;

    foreach ($users as $user) {
        $email = $user['email'];
        echo "Обработка: $email ... ";

        try {
            // Проверяем, существует ли пользователь в MySQL
            $stmt = $mysql->prepare("SELECT id FROM users WHERE email=?");
            $stmt->execute([$email]);
            $existing = $stmt->fetch();

            if ($existing) {
                echo "⏭️  уже существует\n";
                $skipped++;
                continue;
            }

            // Вставляем пользователя в MySQL
            $stmt = $mysql->prepare("
                INSERT INTO users (email, password_hash, created_at)
                VALUES (?, ?, ?)
            ");
            $stmt->execute([
                $email,
                $user['password_hash'],
                $user['created_at']
            ]);

            $userId = $mysql->lastInsertId();

            // Выдаем доступ (бессрочный)
            $stmt = $mysql->prepare("
                INSERT INTO access (user_id, granted_at, ends_at)
                VALUES (?, NOW(), NULL)
            ");
            $stmt->execute([$userId]);

            // Если есть invoice_id и amount, создаем заказ
            if (!empty($user['invoice_id']) && !empty($user['amount'])) {
                try {
                    $stmt = $mysql->prepare("
                        INSERT INTO orders (inv_id, email, amount, status, paid_at, created_at)
                        VALUES (?, ?, ?, 'paid', ?, ?)
                    ");
                    $stmt->execute([
                        $user['invoice_id'],
                        $email,
                        $user['amount'],
                        $user['created_at'],
                        $user['created_at']
                    ]);
                } catch (PDOException $e) {
                    // Игнорируем ошибки дублирования invoice_id
                    if ($e->getCode() != 23000) {
                        throw $e;
                    }
                }
            }

            echo "✅ мигрирован\n";
            $migrated++;

        } catch (Exception $e) {
            echo "❌ ошибка: " . $e->getMessage() . "\n";
            $errors++;
        }
    }

    echo "\n========================================\n";
    echo "Результаты миграции:\n";
    echo "✅ Мигрировано: $migrated\n";
    echo "⏭️  Пропущено: $skipped\n";
    echo "❌ Ошибок: $errors\n";
    echo "========================================\n";

    if ($migrated > 0) {
        echo "\n💡 Рекомендация: После успешной миграции можно создать резервную копию SQLite базы\n";
        echo "   и удалить файл $sqlitePath\n";
    }

} catch (Exception $e) {
    echo "\n❌ КРИТИЧЕСКАЯ ОШИБКА: " . $e->getMessage() . "\n";
    exit(1);
}
