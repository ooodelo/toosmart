# Codebase Overview

[← Back to CLAUDE.md](../CLAUDE.md)

Детальное описание структуры проекта и назначения файлов.

## Directory Structure

### `/content/` - Контент курса

Исходные Markdown файлы для генерации сайта.

```
content/
├── intro/
│   └── 00_intro.md           # Введение (order=0, всегда публичное)
├── course/
│   ├── 01_intro.md           # Раздел 1
│   ├── 02_basics.md          # Раздел 2
│   └── 03_advanced.md        # Раздел 3
├── appendix/
│   └── A_materials.md        # Приложение A (только premium)
├── recommendations/
│   └── eco-cleaning.md       # SEO статья с front matter
├── legal/
│   └── offer.md              # Юридические документы
└── images/                   # Изображения для контента
```

**Правила именования:**
- Course: `NN_название.md` где NN = 01, 02, ...
- Appendix: `X_название.md` где X = A, B, C, ...
- Intro: всегда `00_intro.md`

**Front Matter (YAML):**
```yaml
---
title: "Заголовок"
teaser: "Краткое описание для карточки"
image: "/images/reco/image.png"
order: 10
slug: "custom-url"
---
```

---

### `/src/` - Frontend

Исходные файлы клиентской части.

| File | Size | Description |
|------|------|-------------|
| `script.js` | 128KB | Главная логика: меню, навигация, модалки, responsive |
| `cta.js` | 6.6KB | Модальное окно оплаты, интеграция Robokassa |
| `mode-utils.js` | 6.5KB | Определение режима отображения (mobile/tablet/desktop) |
| `legal-modals.js` | 7.7KB | Модалки юридических документов |
| `styles.css` | 47.6KB | Все стили, responsive breakpoints |
| `template.html` | 42KB | Основной HTML шаблон для всех страниц |
| `template-full.html` | - | Альтернативный шаблон (полный контент) |
| `template-paywall.html` | - | Шаблон с paywall |

**`/src/assets/`** - Статика: логотипы, шрифты, иконки

---

### `/scripts/` - Build система

Node.js скрипты для сборки проекта.

| File | Size | Description |
|------|------|-------------|
| `build.js` | 420B | Entry point, парсинг CLI аргументов |
| `link-linter.js` | 6.4KB | Проверка внутренних ссылок в HTML |
| `lib/build.js` | 40.8KB | Основная логика сборки (1231 строк) |

**Ключевые функции в `lib/build.js`:**

```javascript
build(target)              // Главный оркестратор (free/premium/all)
buildFree()                // Генерация free версии
buildPremium()             // Генерация premium версии
buildRecommendations()     // Генерация SEO статей
loadContent()              // Загрузка всех markdown файлов
loadMarkdownBranch()       // Парсинг markdown с front matter
extractLogicalIntro()      // Извлечение intro (3-branch алгоритм)
buildMenuItems()           // Генерация меню навигации
buildFreeCoursePage()      // Рендер free страницы с blur teaser
buildPremiumContentPage()  // Рендер premium страницы с nav chain
generateMetaTags()         // SEO мета-теги
generateSchemaOrg()        // JSON-LD структурированные данные
generateRobotsTxt()        // robots.txt
generateSitemap()          // XML sitemap
```

---

### `/server/` - Backend PHP

PHP файлы для авторизации и платежей (только premium версия).

| File | Description |
|------|-------------|
| `index.php` | Форма входа, entry point premium версии |
| `auth.php` | Обработчик авторизации (CSRF, rate limiting) |
| `check-auth.php` | Проверка сессии для защищённых маршрутов |
| `config.php` | Загрузчик конфигурации из site.json |
| `security.php` | Утилиты безопасности (CSRF, валидация, логи) |
| `create-invoice.php` | Создание счёта Robokassa |
| `robokassa-callback.php` | Обработка callback от Robokassa |
| `success.php` | Страница успешной оплаты |
| `logout.php` | Завершение сессии |
| `.htaccess` | Apache rewrite rules, access control |
| `users.json.example` | Шаблон базы пользователей |

---

### `/admin/` - Админ-панель

| File | Description |
|------|-------------|
| `server.js` | Node.js API сервер (порт 3001) |
| `index.html` | UI админ-панели |

**API эндпоинты:**
- `GET /api/config` - Получить конфигурацию
- `POST /api/config` - Сохранить конфигурацию
- `POST /api/build` - Запустить сборку

---

### `/config/` - Конфигурация

| File | Description |
|------|-------------|
| `site.json` | Главный конфиг сайта |
| `build.example.json` | Шаблон конфигурации сборки |

**Структура `site.json`:**
```json
{
  "domain": "toosmart.ru",
  "pricing": {
    "originalAmount": 10000,
    "currentAmount": 3400,
    "currency": "RUB"
  },
  "ctaTexts": { ... },
  "footer": { ... },
  "build": {
    "wordsPerMinute": 150
  },
  "robokassa": { ... },
  "features": {
    "cookiesBannerEnabled": true
  }
}
```

---

### `/dist/` - Результат сборки

Генерируется автоматически, не коммитится (gitignored).

```
dist/
├── free/                # Бесплатная версия
│   ├── index.html
│   ├── course/
│   ├── recommendations/
│   └── legal/
├── premium/             # Премиум версия
│   ├── index.php        # Entry point с авторизацией
│   ├── index.html
│   ├── course/
│   ├── appendix/
│   └── [PHP файлы]
└── shared/              # Общие ресурсы
    └── recommendations.json
```

---

### `/docs/` - Документация

| File | Description |
|------|-------------|
| `ARCHITECTURE_v1.1.md` | Спецификация архитектуры (29KB) |
| `TZ_razrabotchika_v1.1.md` | Техническое задание (24KB) |
| `BUILD_REFACTOR_GUIDE_v1.1.md` | Гайд по рефакторингу сборки |
| `USERS_JSON_RATIONALE.md` | Обоснование users.json |
| `CODEBASE.md` | Этот файл |
| `COMPONENTS.md` | [Описание компонентов](COMPONENTS.md) |
| `BUILD_SYSTEM.md` | [Система сборки](BUILD_SYSTEM.md) |
| `API.md` | [Backend API](API.md) |

---

## File Dependencies

```
site.json ← build.js ← templates ← dist/
                ↑
            content/*.md
```

**Build Flow:**
1. `config/site.json` загружается
2. `content/**/*.md` парсится
3. `src/template.html` + контент = HTML
4. JS/CSS минифицируется
5. Результат в `dist/`

---

## Related Documentation

- [Components](COMPONENTS.md) - Frontend компоненты
- [Build System](BUILD_SYSTEM.md) - Детали сборки
- [API Reference](API.md) - Backend эндпоинты
