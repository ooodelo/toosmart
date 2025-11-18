# TooSmart - AI Documentation

> Платформа онлайн-курсов с freemium моделью (бесплатная + премиум версии)

## Quick Start

```bash
npm install              # Установка зависимостей
npm run build            # Полная сборка (free + premium)
npm run preview:free     # Просмотр free версии на :3003
npm run preview:premium  # Просмотр premium версии на :3004
```

## Project Structure

```
toosmart/
├── content/           # Markdown контент курса
├── src/               # Frontend (JS, CSS, HTML шаблоны)
├── scripts/           # Build система (Node.js)
├── server/            # Backend PHP (авторизация, оплата)
├── admin/             # Админ-панель
├── config/            # Конфигурация
├── dist/              # Результат сборки (gitignored)
└── docs/              # Документация
```

## Key Concepts

### Freemium Model
- **dist/free/** - Бесплатная версия с превью курса и paywall
- **dist/premium/** - Полная версия с авторизацией
- **dist/shared/** - Общие ресурсы (JSON, конфиги)

### Content Organization
- `content/intro/` - Введение (всегда публичное)
- `content/course/` - Разделы курса (01_, 02_, ...)
- `content/appendix/` - Приложения (A_, B_, только premium)
- `content/recommendations/` - SEO статьи
- `content/legal/` - Юридические документы

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run build` | Полная сборка |
| `npm run build:free` | Только free версия |
| `npm run build:premium` | Только premium версия |
| `npm run dev` | Dev сервер src/ на :3000 |
| `npm run admin` | Админ-панель на :3001 |
| `npm run preview:free` | Превью free на :3003 |
| `npm run preview:premium` | Превью premium на :3004 |
| `npm run lint:links` | Проверка внутренних ссылок |
| `npm run clean` | Очистка dist/ |

## Configuration

Главный конфиг: `config/site.json`
- Домен, цены, тексты CTA
- Настройки Robokassa
- Параметры сборки

## Technology Stack

- **Frontend**: Vanilla JS, CSS3, HTML5
- **Build**: Node.js (marked, terser, csso)
- **Backend**: PHP 7.4+, Apache
- **Payments**: Robokassa

## Documentation Links

- [Codebase Overview](docs/CODEBASE.md) - Структура файлов и назначение
- [Components](docs/COMPONENTS.md) - Frontend компоненты
- [Build System](docs/BUILD_SYSTEM.md) - Система сборки
- [API Reference](docs/API.md) - Backend эндпоинты
- [Architecture v1.1](docs/ARCHITECTURE_v1.1.md) - Спецификация архитектуры
- [Technical Requirements](docs/TZ_razrabotchika_v1.1.md) - ТЗ разработчика

## Common Tasks

### Adding New Course Section
1. Создать файл `content/course/NN_название.md` (NN = порядковый номер)
2. Добавить H1 заголовок
3. Запустить `npm run build`

### Adding Recommendation Article
1. Создать файл `content/recommendations/название.md`
2. Добавить front matter (title, teaser, image, order)
3. Запустить `npm run build`

### Modifying Styles
1. Редактировать `src/styles.css`
2. Запустить `npm run build` (CSS минифицируется)

### Testing Payment Flow
1. Установить `isTest: true` в `config/site.json` → robokassa
2. Использовать тестовые данные Robokassa

## File Naming Conventions

- **Course**: `NN_название.md` (01_, 02_, ...)
- **Appendix**: `X_название.md` (A_, B_, ...)
- **Intro**: `00_intro.md` (всегда order=0)

## Security Notes

- CSRF защита на всех POST запросах
- Rate limiting (5 попыток / 15 мин)
- Session security (HTTPOnly, SameSite, HTTPS)
- DOMPurify санитизация HTML

## Important Files

| File | Purpose |
|------|---------|
| `scripts/lib/build.js` | Главная логика сборки (1231 строк) |
| `src/script.js` | Основной JS клиента (128KB min) |
| `src/styles.css` | Все стили (47KB) |
| `src/template.html` | HTML шаблон страниц |
| `config/site.json` | Конфигурация сайта |
| `server/auth.php` | Авторизация пользователей |
| `server/robokassa-callback.php` | Обработка платежей |
