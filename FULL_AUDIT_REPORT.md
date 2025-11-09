# 📋 ПОЛНЫЙ АУДИТ КОДА - UI КАРКАС АДАПТИВОВ

**Дата:** 2025-11-09
**Версия:** v1.4
**Статус:** Шаблон готов к наполнению контентом (с доработками)

---

## 📊 EXECUTIVE SUMMARY

**Общая оценка:** 7.5/10

**Сильные стороны:**
- ✅ Отличная архитектура CSS (токены, режимы через data-атрибуты)
- ✅ Продуманная адаптивность (desktop/tablet-wide/handheld)
- ✅ Качественная доступность (a11y, ARIA, focus management)
- ✅ Чистый код с хорошими комментариями
- ✅ Правильное управление памятью (cleanup, teardown)
- ✅ Детекция устройств и режимов (iPad, touch, viewport)

**Критические проблемы:**
- ❌ Нет системы загрузки markdown-контента
- ❌ Кнопка "Далее" скроллит внутри статьи вместо перехода на след. страницу
- ❌ Отсутствуют стили для markdown-элементов (img, code, blockquote, tables)
- ❌ Рекомендации имеют вертикальный скролл вместо автоматической смены

**Вывод:** Шаблон качественный, но требует доработок для работы с реальным контентом.

---

## 1. АУДИТ HTML СТРУКТУРЫ

### ✅ Сильные стороны

1. **Семантика и доступность**
   - Корректные ARIA-атрибуты: `role`, `aria-label`, `aria-controls`, `aria-expanded`
   - Семантические теги: `<header>`, `<main>`, `<article>`, `<aside>`, `<nav>`
   - CSP политика безопасности (index.html:6)

2. **Скрипт в `<head>` для предотвращения FOUC**
   - Детекция режима до рендера (index.html:9-73)
   - Корректная детекция iPad и touch-устройств

3. **Viewport настройки**
   - `viewport-fit=cover` для notch-устройств
   - Корректная мета-информация

### ❌ Критические проблемы

**1. Статичный контент вместо динамической загрузки** (index.html:117-150)
```html
<!-- Текущее: -->
<section id="section-1" class="text-section" data-section="Раздел 1">
  <h2>Раздел 1</h2>
  <p>Этот текст моделирует...</p>
</section>

<!-- Нужно: -->
<article class="text-box">
  <div id="article-content">
    <!-- Сюда рендерится markdown -->
  </div>
  <button class="btn-next" type="button">Далее</button>
</article>
```

**Рекомендация:** Добавить контейнер для динамического рендеринга markdown.

**2. Статичное меню оглавления** (index.html:98-104)
```html
<!-- Нужно: -->
<div class="site-menu" data-config-url="/articles-config.json">
  <!-- Генерируется динамически из JSON -->
</div>
```

**3. Рекомендации без механизма фильтрации** (index.html:161-198)
- Статичный список карточек
- Нет реализации "показать сколько помещается"

**4. Отсутствуют шаблоны для markdown-контента:**
- Нет контейнеров для изображений
- Нет классов для blockquote, code, tables

---

## 2. АУДИТ CSS СТИЛЕЙ

### ✅ Сильные стороны

1. **Архитектура CSS-переменных** (styles.css:1-50)
   - Все параметры в токенах: `--text-box-width`, `--stack-gap`, `--rail-open`
   - Адаптивные значения через `clamp()`
   - Легко масштабируется

2. **Режимы через data-атрибуты**
   - `body[data-mode="desktop|tablet-wide|handheld"]`
   - Управление из JS, нет media queries в CSS

3. **Sticky-позиционирование рекомендаций** (styles.css:330-343)
   - Корректное `max-height: calc(100dvh - ...)`
   - Fallback для iOS 15: `100vh`

4. **Доступность**
   - `prefers-reduced-motion` (styles.css:678-687)
   - RTL поддержка (styles.css:692-702)

### ❌ Критические проблемы

**1. Нет стилей для markdown-контента**

Отсутствуют стили для:
- `<img>` из markdown
- `<blockquote>`
- `<pre><code>`
- `<table>`
- Вложенные списки `<ul>`, `<ol>`

**Решение:**
```css
/* Добавить в styles.css: */

.text-section img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px 0;
}

.text-section pre {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.text-section blockquote {
  border-left: 4px solid var(--border-color);
  padding-left: 16px;
  margin: 16px 0;
  color: #666;
}

.text-section table {
  width: 100%;
  border-collapse: collapse;
}

.text-section th,
.text-section td {
  padding: 12px;
  border: 1px solid var(--border-color);
}
```

**2. Кнопка "Далее" с position: sticky** (styles.css:470-476)

```css
/* Текущее (для скролла внутри статьи): */
body[data-mode="desktop"] .btn-next {
  position: sticky;
  bottom: 24px;
}

/* Нужно (для перехода между статьями): */
body[data-mode="desktop"] .btn-next {
  position: static;
  margin: 48px auto 24px;
}
```

**3. Рекомендации: overflow: auto** (styles.css:351-361)

```css
/* Текущее: */
.stack-list {
  overflow: auto; /* скролл */
}

/* По ТЗ нужно: */
.stack-list {
  overflow: hidden; /* без скролла */
  /* + JS для автоматической ротации */
}
```

### ⚠️ Средние проблемы

**4. Захардкоженные цвета**
```css
/* Плохо: */
.panel {
  background: #fff;
}

/* Лучше: */
.panel {
  background: var(--surface-content, #fff);
}
```

**5. dots-rail фиксированное позиционирование** (styles.css:284-297)
- Использует `calc(50% - var(--text-box-width) / 2 - 48px)`
- При изменении ширины может съехать

**6. Нет стилей для состояний loading/error**

---

## 3. АУДИТ JAVASCRIPT ЛОГИКИ

### ✅ Сильные стороны

1. **Архитектура определения режимов** (script.js:69-124)
   - Разделение `data-mode` (layout) и `data-input` (interaction)
   - Приоритет источников ширины: visualViewport → clientWidth → innerWidth
   - Корректная детекция iPad

2. **IntersectionObserver для dots-rail** (script.js:315-344)
   - Производительное решение
   - Правильный lifecycle (teardown)
   - Fallback для старых браузеров

3. **Управление фокусом** (script.js:389-485)
   - Focus trap при модальном меню
   - Корректный возврат фокуса
   - Keyboard navigation (Escape, Tab)

4. **Cleanup функции** (script.js:279-290, 695-711)
   - Удаление listeners
   - Отмена RAF
   - Предотвращение утечек памяти

5. **Edge-gesture для tablet-wide** (script.js:592-614)
   - Открытие меню с края экрана
   - Lifecycle управление

### ❌ Критические проблемы

**1. handleNext() делает не то, что нужно** (script.js:529-535)

```javascript
// Текущее (скролл внутри статьи):
function handleNext() {
  const currentIndex = getCurrentSectionIndex();
  const nextSection = sections[currentIndex + 1] || sections[0];
  nextSection.scrollIntoView({ behavior: 'smooth' });
}

// По ТЗ нужно (переход на след. страницу):
function handleNext() {
  const nextArticle = articleManager.getNextArticle();
  if (nextArticle) {
    articleManager.loadArticle(nextArticle.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
```

**Проблема:** Кнопка "Далее" циклически скроллит разделы. Нужна навигация между страницами.

**2. Нет функций для работы с markdown**

Отсутствуют:
- `loadArticle(url)` для загрузки markdown
- Парсинг markdown → HTML
- Динамическая генерация меню

**Решение:**
```javascript
class ArticleManager {
  async loadArticle(id) {
    const response = await fetch(`/content/${id}.md`);
    const markdown = await response.text();
    const html = marked.parse(markdown);
    renderArticleContent(html);
    configureDots(); // пересоздать навигацию
  }

  async loadTableOfContents() {
    const config = await fetch('/articles-config.json').then(r => r.json());
    renderMenu(config.articles);
  }
}
```

**3. dots-rail не обновляется при новом контенте**
- Вызывается только при инициализации
- После загрузки markdown нужен пересчет

### ⚠️ Средние проблемы

**4. Нет управления рекомендациями**
- По ТЗ: "автоматически сменять"
- Сейчас: статичный список со скроллом

**5. lockScroll() только для non-desktop** (script.js:495-504)

```javascript
// Текущее:
function lockScroll() {
  const shouldLock = currentMode !== 'desktop' && body.classList.contains('menu-open');
}

// Вопрос: по ТЗ п.5 "когда открыто оглавление скрол не работает"
// Это должно быть на ВСЕХ режимах?

// Если да:
function lockScroll() {
  const shouldLock = body.classList.contains('menu-open');
}
```

**Уточнение:** На desktop hover ≠ полное открытие. Блокировка может быть только для `menu-open`, не для `is-slid`.

**6. Нет обработки ошибок загрузки**
- Отсутствуют индикаторы loading
- Нет fallback контента

---

## 4. СООТВЕТСТВИЕ ПЛАНИРУЕМОМУ ФУНКЦИОНАЛУ

| № | Требование | Статус | Комментарий |
|---|---|---|---|
| 1 | Загрузка статей из markdown | ❌ **НЕТ** | Нужна система загрузки |
| 2 | Автогенерация "точек" по заголовкам | ✅ **ДА** | Работает для статичного контента |
| 3 | "Далее" → переход к след. странице | ❌ **НЕТ** | Сейчас скроллит внутри |
| 4 | Автогенерация оглавления | ❌ **НЕТ** | Меню захардкожено |
| 5 | Блокировка скролла при меню | ⚠️ **ЧАСТИЧНО** | Только handheld |
| 6 | Рекомендации: автосмена без скролла | ❌ **НЕТ** | Есть скролл |

---

## 5. РЕКОМЕНДАЦИИ ПО ПРИОРИТЕТАМ

### 🔴 ПРИОРИТЕТ 1: КРИТИЧЕСКИЕ (для работы с markdown)

#### 1.1. Система загрузки статей

**Рекомендуемое решение:** SPA (Single Page Application)

**Структура:**
```
/config/
  articles-config.json

/content/
  intro.md
  basics.md
  advanced.md

/js/
  articles.js (ArticleManager class)
```

**articles-config.json:**
```json
{
  "articles": [
    {
      "id": "intro",
      "title": "Введение",
      "markdown": "/content/intro.md",
      "next": "basics"
    },
    {
      "id": "basics",
      "title": "Основы",
      "markdown": "/content/basics.md",
      "next": "advanced"
    }
  ]
}
```

**ArticleManager (script.js):**
```javascript
class ArticleManager {
  constructor() {
    this.config = null;
    this.currentArticleId = null;
  }

  async init() {
    this.config = await fetch('/config/articles-config.json').then(r => r.json());
    this.renderTableOfContents();

    const articleId = new URLSearchParams(location.search).get('article')
                      || this.config.articles[0].id;
    await this.loadArticle(articleId);
  }

  async loadArticle(id) {
    const article = this.config.articles.find(a => a.id === id);
    if (!article) return;

    const container = document.querySelector('#article-content');
    container.classList.add('loading');

    try {
      const response = await fetch(article.markdown);
      const markdown = await response.text();
      const html = marked.parse(markdown, {
        gfm: true,
        breaks: true
      });

      container.innerHTML = html;
      container.classList.remove('loading');

      this.currentArticleId = id;
      configureDots();
      updateMode();

      history.pushState({ article: id }, article.title, `?article=${id}`);
    } catch (error) {
      container.classList.remove('loading');
      container.innerHTML = `<div class="error">Ошибка загрузки статьи</div>`;
    }
  }

  renderTableOfContents() {
    const menuList = document.querySelector('.site-menu__list');
    menuList.innerHTML = this.config.articles.map(a => `
      <li><a href="?article=${a.id}" data-article-id="${a.id}">${a.title}</a></li>
    `).join('');

    menuList.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        e.preventDefault();
        this.loadArticle(e.target.dataset.articleId);
        closeMenu();
      }
    });
  }

  getNextArticle() {
    const current = this.config.articles.find(a => a.id === this.currentArticleId);
    return current?.next
      ? this.config.articles.find(a => a.id === current.next)
      : null;
  }
}

// Инициализация
const articleManager = new ArticleManager();
articleManager.init();
```

**Трудоемкость:** 4 часа

---

#### 1.2. Стили для markdown-контента

**Добавить в styles.css:**

```css
/* === MARKDOWN CONTENT STYLES === */

/* Изображения */
.text-section img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 24px 0;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

/* Цитаты */
.text-section blockquote {
  margin: 20px 0;
  padding: 12px 20px;
  border-left: 4px solid var(--border-color);
  background: var(--surface);
  font-style: italic;
  color: #666;
}

/* Код inline */
.text-section code {
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
}

/* Блоки кода */
.text-section pre {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 24px 0;
}

.text-section pre code {
  background: none;
  padding: 0;
  color: inherit;
}

/* Таблицы */
.text-section table {
  width: 100%;
  border-collapse: collapse;
  margin: 24px 0;
}

.text-section th,
.text-section td {
  padding: 12px;
  border: 1px solid var(--border-color);
  text-align: left;
}

.text-section th {
  background: var(--surface);
  font-weight: 600;
}

/* Списки */
.text-section ul,
.text-section ol {
  margin: 16px 0;
  padding-left: 24px;
  line-height: 1.8;
}

.text-section li {
  margin: 8px 0;
}

/* Горизонтальная линия */
.text-section hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 32px 0;
}

/* Loading/Error состояния */
.text-box.loading {
  position: relative;
  min-height: 400px;
}

.text-box.loading::after {
  content: "Загрузка статьи...";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #999;
  font-size: 18px;
}

.error {
  padding: 48px;
  text-align: center;
  color: #d32f2f;
}
```

**Подключить markdown парсер:**
```html
<!-- В index.html перед script.js -->
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
```

**Трудоемкость:** 1 час

---

#### 1.3. Исправление кнопки "Далее"

**JavaScript (script.js):**
```javascript
// Заменить handleNext():
function handleNext() {
  if (typeof articleManager !== 'undefined') {
    const nextArticle = articleManager.getNextArticle();
    if (nextArticle) {
      articleManager.loadArticle(nextArticle.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } else {
    // Fallback для статичной версии
    const nextPageUrl = btnNext.dataset.nextPage;
    if (nextPageUrl) {
      window.location.href = nextPageUrl;
    }
  }
}
```

**CSS (styles.css):**
```css
/* Убрать sticky, сделать обычной кнопкой */
body[data-mode="desktop"] .btn-next {
  display: flex;
  width: fit-content;
  position: static; /* <- изменено */
  margin: 48px auto 24px;
}

body[data-mode="tablet-wide"] .btn-next {
  display: flex;
  width: fit-content;
  position: static; /* <- изменено */
  margin: 48px auto 24px;
}
```

**Трудоемкость:** 30 минут

---

### 🟡 ПРИОРИТЕТ 2: ВАЖНЫЕ (для соответствия ТЗ)

#### 2.1. Рекомендации: убрать скролл, добавить фильтрацию

**Вариант A: Показывать сколько помещается (простой)**

```javascript
// script.js
function filterRecommendations() {
  if (currentMode === 'handheld') return;

  const stack = document.querySelector('.stack');
  const stackList = document.querySelector('.stack-list');
  const cards = stackList.querySelectorAll('.stack-card');

  const availableHeight = stack.clientHeight - 100;
  let totalHeight = 0;

  cards.forEach((card) => {
    const cardHeight = card.offsetHeight + 20;
    if (totalHeight + cardHeight <= availableHeight) {
      card.style.display = 'block';
      totalHeight += cardHeight;
    } else {
      card.style.display = 'none';
    }
  });
}

window.addEventListener('resize', filterRecommendations);
```

```css
/* styles.css */
.stack-list {
  overflow: hidden; /* убрать скролл */
}
```

**Вариант B: Автоматическая ротация (сложнее)**

```javascript
class RecommendationsCarousel {
  constructor() {
    this.cards = Array.from(document.querySelectorAll('.stack-card'));
    this.currentIndex = 0;
    this.visibleCount = 3;
  }

  rotate() {
    this.currentIndex = (this.currentIndex + 1) % this.cards.length;
    this.render();
  }

  render() {
    this.cards.forEach((card, i) => {
      const isVisible = i >= this.currentIndex && i < this.currentIndex + this.visibleCount;
      card.style.display = isVisible ? 'block' : 'none';
    });
  }

  start() {
    setInterval(() => this.rotate(), 5000);
  }
}

const carousel = new RecommendationsCarousel();
carousel.start();
```

**Трудоемкость:** Вариант A - 2 часа, Вариант B - 4 часа

---

#### 2.2. Блокировка скролла при открытом меню

**Уточнение:** На desktop при hover (`is-slid`) или при полном открытии (`menu-open`)?

**Вариант A: Всегда блокировать**
```javascript
function lockScroll() {
  const shouldLock = body.classList.contains('menu-open');
  // ...
}
```

**Вариант B: Оставить как есть**
- На desktop hover ≠ блокировка
- Только `menu-open` блокирует

**Рекомендация:** Уточнить у дизайнера

**Трудоемкость:** 15 минут

---

### 🟢 ПРИОРИТЕТ 3: ОПЦИОНАЛЬНЫЕ

#### 3.1. Рефакторинг модульной структуры

**Разделить script.js:**
```
/js/
  - core.js (режимы, updateMode)
  - menu.js (логика меню)
  - dots.js (dots-rail)
  - articles.js (ArticleManager)
  - recommendations.js (ротация)
  - main.js (инициализация)
```

**Трудоемкость:** 3 часа

---

## 6. ИТОГОВАЯ ТАБЛИЦА РЕКОМЕНДАЦИЙ

| Проблема | Приоритет | Трудоемкость | Решение |
|---|---|---|---|
| Загрузка markdown | 🔴 КРИТИЧНО | 4ч | ArticleManager SPA |
| Стили для markdown | 🔴 КРИТИЧНО | 1ч | CSS блок |
| Кнопка "Далее" | 🔴 КРИТИЧНО | 30мин | Изменить handleNext() |
| Рекомендации: скролл | 🟡 ВАЖНО | 2ч | Фильтрация по высоте |
| Скролл при меню | 🟡 ВАЖНО | 15мин | Уточнить ТЗ |
| Loading/Error | 🟢 ОПЦИОНАЛЬНО | 1ч | Добавить классы |
| Рефакторинг | 🟢 ОПЦИОНАЛЬНО | 3ч | Модули |

**Общая трудоемкость критических правок:** ~5.5 часов

---

## 7. ПРИМЕР СТРУКТУРЫ ПРОЕКТА (ПОСЛЕ ДОРАБОТОК)

```
/toosmart/
  /config/
    articles-config.json
    recommendations.json
  /content/
    intro.md
    basics.md
    advanced.md
  /js/
    articles.js
    recommendations.js
    main.js
  /css/
    styles.css
  index.html
```

---

## 8. СЛЕДУЮЩИЕ ШАГИ

1. **Реализовать критические правки** (система загрузки, стили, кнопка)
2. **Создать пример конфигурации** (articles-config.json)
3. **Подготовить тестовые markdown файлы** (3-5 статей)
4. **Протестировать на всех режимах** (desktop/tablet/mobile)
5. **Добавить опциональные улучшения** (ротация рекомендаций, loading)

---

## 9. ВОПРОСЫ ДЛЯ УТОЧНЕНИЯ

1. **Скролл при открытом меню на desktop:** блокировать всегда или только при `menu-open`?
2. **Рекомендации:** статичная фильтрация или автоматическая ротация?
3. **Markdown парсер:** использовать CDN (marked.js) или собрать через npm?
4. **Структура контента:** SPA (одна страница) или MPA (много HTML страниц)?
5. **Подсветка синтаксиса кода:** нужна ли (Prism.js, highlight.js)?

---

**Конец отчета**
