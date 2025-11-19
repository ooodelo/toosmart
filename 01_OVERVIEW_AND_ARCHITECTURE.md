# TooSmart: обзор и архитектура

## Что делает платформа
- Генератор статического сайта строит три набора страниц из Markdown в `content/`: бесплатный курс (`dist/free`), премиум-курс (`dist/premium`) и рекомендации для SEO (`dist/recommendations`). Общие вспомогательные файлы пишутся в `dist/shared` и `dist/assets`. Логика генерации описана в `scripts/lib/build.js` и использует `marked`, `DOMPurify` и `jsdom` для безопасного рендеринга контента.
- Все разделы Markdown дополнительно рассчитывают «логическое введение» и время чтения, что используется для бесплатных тизеров и карточек рекомендаций.
- Конфигурация проекта приходит из `config/site.json` (с запасными значениями из `DEFAULT_SITE_CONFIG`), включая цены, тексты CTA, робокассу и скорость чтения.

## Типы страниц и их цепочки
- **Free** (`dist/free`): корневой `index.html` собирается из ветки `intro`, курс из `content/course` рендерится в `/free/course/<slug>.html`, юридические страницы идут в `/free/legal/`. Меню формируется только из intro+course.
- **Premium** (`dist/premium`): цепочка навигации линейная `intro → course[1..N] → appendix[1..M]`; страницы кладутся в `/premium/` (intro), `/premium/course/` и `/premium/appendix/`. Для каждой страницы генерируются ссылки «Назад/Далее» по цепочке.
- **Recommendations** (`dist/recommendations`): каждая статья из `content/recommendations` строится в отдельный HTML и экспортируется в JSON-карусель `/shared/recommendations.json`. Меню курса их не показывает.
- **Shared** (`dist/shared`): вспомогательные JSON и конфиг `site.json` для GUI/карусели.

## Paywall и доступ
- Премиум-версия защищена PHP-бэкендом из каталога `server/`: форма логина (`server/index.php`), проверки авторизации, SQLite-хранилище пользователей и интеграция Robokassa через `create-invoice.php` и `robokassa-callback.php`. После успешной оплаты пользователь получает пароль для входа.
- Для бесплатной версии никаких серверных зависимостей нет: она разворачивается как чистый статик.

## Навигация и рекомендации
- Меню курса формируется в `buildMenuItems`: для free только intro+course, для premium intro+course+appendix. Recommendations и legal не попадают в меню, доступны по прямым ссылкам.
- Карточки рекомендаций получают `title`, `excerpt`, `readingTimeMinutes` и `url` из исходных Markdown и сохраняются в `dist/shared/recommendations.json` для фронтенд-каруселей.

## Структура репозитория
- `content/` — Markdown-источники (intro, course, appendix, recommendations, legal).
- `src/` — HTML-шаблоны (`template.html`, `template-paywall.html`), стили и модули JS.
- `scripts/` — сборщик Node.js и вспомогательные CLI.
- `server/` — PHP-обвязка для paywall и платежей.
- `dist/` — результат сборки (создается на команде build).
