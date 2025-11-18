# Build System

[← Back to CLAUDE.md](../CLAUDE.md)

Детальное описание системы сборки проекта.

## Overview

Проект использует статическую генерацию сайта (SSG) на Node.js. Один исходный контент генерирует две версии: free и premium.

## Build Commands

```bash
npm run build            # Полная сборка (free + premium + recommendations)
npm run build:free       # Только free версия
npm run build:premium    # Только premium версия
npm run clean            # Удаление dist/
npm run lint:links       # Проверка внутренних ссылок
npm run lint:links --fix # Автоисправление ссылок
```

## Build Pipeline

```
1. Load Config
   ↓
2. Load Content (Markdown)
   ↓
3. Parse Front Matter
   ↓
4. Extract Logical Intros
   ↓
5. Build Menu Structure
   ↓
6. Generate HTML Pages
   ↓
7. Generate SEO (meta, sitemap, robots)
   ↓
8. Minify Assets (JS, CSS)
   ↓
9. Copy Static Files
   ↓
10. Output to dist/
```

## Core Build Functions

### `build(target)`

Main entry point. Target: `'free'` | `'premium'` | `'recommendations'` | `'all'`

```javascript
// scripts/lib/build.js:~50
async function build(target = 'all') {
  const config = loadConfig();
  const content = await loadContent();

  if (target === 'all' || target === 'free') {
    await buildFree(config, content);
  }
  if (target === 'all' || target === 'premium') {
    await buildPremium(config, content);
  }
  // ...
}
```

---

### `loadContent()`

Загружает все markdown файлы из `content/`.

```javascript
// scripts/lib/build.js:~150
async function loadContent() {
  return {
    intro: await loadMarkdownBranch('content/intro'),
    course: await loadMarkdownBranch('content/course'),
    appendix: await loadMarkdownBranch('content/appendix'),
    recommendations: await loadMarkdownBranch('content/recommendations'),
    legal: await loadMarkdownBranch('content/legal')
  };
}
```

---

### `loadMarkdownBranch(dir)`

Парсит markdown файлы из директории.

**Returns:**
```javascript
[
  {
    filename: '01_basics.md',
    slug: 'basics',
    order: 1,
    title: 'Основы',
    content: '# Основы\n\n...',     // Raw markdown
    html: '<h1>Основы</h1>...',     // Rendered HTML
    excerpt: 'Краткое описание...',
    readingTimeMinutes: 5,
    frontMatter: { ... }
  },
  // ...
]
```

---

### `extractLogicalIntro(html)`

Извлекает логическое введение из HTML контента.

**3-branch Algorithm:**

```javascript
// Ветка A: H1 → параграфы
if (после H1 идут параграфы) {
  return первые 3 параграфа;
}

// Ветка B: H1 → HR → H2
if (после H1 идёт HR, затем H2) {
  if (H2 содержит "введение") {
    return контент до следующего H2;
  }
}

// Ветка C: H1 → H2 напрямую
if (после H1 сразу H2) {
  if (H2 содержит "введение") {
    return контент до следующего H2;
  }
}

// Fallback
return первые 500 символов;
```

---

### `buildFreeCoursePage(item, config)`

Генерирует страницу курса для free версии.

**Output:**
- Полный intro
- Размытый (blurred) остальной контент
- Время чтения
- CTA кнопка

---

### `buildPremiumContentPage(item, config, prevItem, nextItem)`

Генерирует страницу для premium версии.

**Output:**
- Полный контент
- Навигация prev/next
- Без CTA

---

### SEO Functions

```javascript
generateMetaTags(item, config)      // <meta> теги
generateSchemaOrg(item, config)     // JSON-LD
generateRobotsTxt(config)           // robots.txt
generateSitemap(pages, config)      // sitemap.xml
```

## Output Structure

### Free Version

```
dist/free/
├── index.html                    # Intro page
├── course/
│   ├── basics.html               # Course with paywall
│   └── advanced.html
├── recommendations/
│   └── article.html              # Full SEO article
├── legal/
│   └── offer.html
├── css/
│   └── styles.min.css
├── js/
│   ├── script.min.js
│   ├── cta.min.js
│   └── legal-modals.min.js
├── assets/
├── robots.txt
└── sitemap.xml
```

### Premium Version

```
dist/premium/
├── index.php                     # Login entry point
├── index.html                    # Intro (after auth)
├── course/
│   ├── basics.html               # Full content
│   └── advanced.html
├── appendix/
│   └── materials.html            # Bonus content
├── auth.php
├── check-auth.php
├── config.php
├── security.php
├── logout.php
├── .htaccess
├── css/
├── js/
└── assets/
```

### Shared Resources

```
dist/shared/
└── recommendations.json          # Articles metadata for API
```

## Configuration

### `config/site.json`

```json
{
  "domain": "toosmart.ru",
  "pricing": {
    "originalAmount": 10000,
    "currentAmount": 3400,
    "currency": "RUB"
  },
  "ctaTexts": {
    "enterFull": "Войти в полную версию",
    "next": "Далее",
    "goToCourse": "Перейти к курсу"
  },
  "footer": {
    "companyName": "ООО \"Название\"",
    "inn": "0000000000",
    "year": 2024
  },
  "build": {
    "wordsPerMinute": 150
  },
  "robokassa": {
    "merchantLogin": "SHOP_ID",
    "password1": "...",
    "password2": "...",
    "isTest": true
  },
  "features": {
    "cookiesBannerEnabled": true
  }
}
```

## Asset Processing

### JavaScript Minification

```javascript
// Using terser
const terser = require('terser');
const minified = await terser.minify(code, {
  compress: true,
  mangle: true
});
```

### CSS Minification

```javascript
// Using csso
const csso = require('csso');
const minified = csso.minify(css).css;
```

## Template Processing

### Placeholder Replacement

```javascript
function processTemplate(template, data) {
  return template
    .replace('{{TITLE}}', data.title)
    .replace('{{META_TAGS}}', data.metaTags)
    .replace('{{CONTENT}}', data.content)
    .replace('{{MENU}}', data.menu)
    .replace('{{FOOTER}}', data.footer)
    .replace('{{SCRIPTS}}', data.scripts)
    .replace('{{CTA_BUTTON}}', data.cta)
    .replace('{{SCHEMA_ORG}}', data.schemaOrg);
}
```

## Dependencies

```json
{
  "marked": "^11.0.0",        // Markdown → HTML
  "dompurify": "^3.1.6",      // HTML sanitization
  "jsdom": "^24.0.0",         // DOM manipulation
  "terser": "^5.44.1",        // JS minification
  "csso": "^5.0.5"            // CSS minification
}
```

## Link Linter

Проверка внутренних ссылок после сборки.

```bash
npm run lint:links           # Report broken links
npm run lint:links --fix     # Auto-fix
```

**Checks:**
- Все внутренние ссылки ведут на существующие файлы
- Якоря (#id) существуют в целевых страницах
- Нет дублирующихся ID

## Reading Time Calculation

```javascript
const wordCount = content.split(/\s+/).length;
const readingTime = Math.ceil(wordCount / config.build.wordsPerMinute);
// Default: 150 words/minute
```

## Error Handling

Build script завершается с ошибкой если:
- `config/site.json` не найден или невалидный
- Markdown файлы не парсятся
- Front matter невалидный YAML
- Template placeholders не заменены
- Запись файлов не удалась

## Extending Build

### Adding New Content Type

1. Создать директорию в `content/`
2. Добавить загрузку в `loadContent()`
3. Добавить функцию `buildXxx()`
4. Обновить `build()` для вызова новой функции

### Adding New Template Variable

1. Добавить placeholder в `src/template.html`: `{{NEW_VAR}}`
2. Добавить замену в `processTemplate()`

---

## Related Documentation

- [Codebase Overview](CODEBASE.md) - Структура файлов
- [Components](COMPONENTS.md) - Frontend компоненты
- [Architecture v1.1](ARCHITECTURE_v1.1.md) - Общая архитектура
