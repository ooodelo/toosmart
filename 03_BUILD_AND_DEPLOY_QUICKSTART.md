# Быстрый старт: сборка и деплой

## Требования
- Node.js 12+ (см. `package.json`), npm.
- Для предпросмотра — `live-server` (устанавливается через devDependencies).
- Для premium-платежей на хостинге нужен PHP 7.4+ и SQLite, доступ к Robokassa.

## Установка и сборка
```bash
npm install               # установка зависимостей
npm run build             # полная сборка free + premium + recommendations
npm run build:free        # только бесплатная версия
npm run build:premium     # только закрытая версия
npm run build:recommendations # только статьи-рекомендации
npm run clean             # очистить dist/
```
- При сборке конфиг читается из `config/site.json`; при отсутствии используется `DEFAULT_SITE_CONFIG` из `scripts/lib/build.js`.
- Шаблоны берутся из `src/template.html` и `src/template-paywall.html`; ресурсы копируются из `src/assets` и `src/premium/assets` (если есть).

## Предпросмотр
```bash
npm run preview:free      # live-server dist/ на 3003 (free)
npm run preview:premium   # live-server dist/ на 3004 (premium)
```

## Деплой
1. Выполнить `npm run build`.
2. Залить каталоги:
   - `dist/free/` — в корень публичного сайта.
   - `dist/premium/` — в `/premium/` на сервере вместе с файлами PHP (`server/*`).
   - `dist/shared/` и `dist/assets/` — в общедоступный каталог, чтобы free и premium ссылались на общие JSON/стили.
3. Настроить переменные Robokassa в `config/site.json` и на сервере (логин, пароли, боевой/тестовый режим).
4. Убедиться, что PHP может писать в SQLite-базу и сессии; включить HTTPS для страниц оплаты/логина.
