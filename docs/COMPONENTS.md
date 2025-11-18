# Components Reference

[← Back to CLAUDE.md](../CLAUDE.md)

Описание frontend компонентов и их взаимодействия.

## JavaScript Modules

### `src/script.js` - Main Application

Главный модуль приложения (128KB minified).

**Responsibilities:**
- Инициализация приложения
- Responsive mode detection
- Навигация и меню
- Модальные окна
- Обработка событий

**Key Functions:**
```javascript
initApp()                    // Инициализация при загрузке
handleResize()               // Обработка изменения viewport
toggleMenu()                 // Открытие/закрытие меню
showModal(content)           // Показ модального окна
closeModal()                 // Закрытие модального окна
handleNavigation(e)          // Обработка клика по ссылке
updateActiveMenuItem()       // Подсветка активного пункта меню
```

---

### `src/mode-utils.js` - Responsive Detection

Определение режима отображения и типа устройства.

**Breakpoints:**
```javascript
BREAKPOINTS = {
  MOBILE_MAX: 767,           // < 768px = mobile
  TABLET_MIN: 768,           // 768-899px = tablet
  TABLET_MAX: 899,
  DESKTOP_MIN: 900,          // 900-1279px = desktop
  DESKTOP_MAX: 1279,
  DESKTOP_WIDE_MIN: 1280     // >= 1280px = desktop-wide
}
```

**Exported Functions:**
```javascript
getLayoutMode()              // Returns: 'mobile' | 'tablet' | 'desktop' | 'desktop-wide'
getInputType()               // Returns: 'touch' | 'pointer'
isTouchDevice()              // Returns: boolean
```

**HTML Attributes:**
```html
<html data-mode="desktop" data-input="pointer">
```

---

### `src/cta.js` - Payment Modal

Модальное окно оплаты и интеграция с Robokassa.

**Flow:**
1. Клик по CTA кнопке
2. Открытие модального окна
3. Ввод email
4. Отправка формы
5. Редирект на Robokassa

**Key Functions:**
```javascript
openPaymentModal()           // Показ модалки оплаты
validateEmail(email)         // Валидация email
submitPayment(email)         // Отправка на create-invoice.php
closePaymentModal()          // Закрытие модалки
```

**DOM Elements:**
```html
<div class="cta-modal">
  <div class="cta-modal-content">
    <input type="email" id="payment-email">
    <button class="cta-submit">Оплатить</button>
  </div>
</div>
```

---

### `src/legal-modals.js` - Legal Documents

Модальные окна для юридических документов.

**Key Functions:**
```javascript
openLegalModal(type)         // type: 'offer' | 'privacy' | ...
closeLegalModal()            // Закрытие
loadLegalContent(slug)       // Загрузка контента из /legal/
```

**Usage:**
```html
<a href="#" data-legal="offer">Публичная оферта</a>
<a href="#" data-legal="privacy">Политика конфиденциальности</a>
```

---

## CSS Architecture

### `src/styles.css` - Global Styles

**Structure:**
```css
/* 1. Variables & Reset */
:root { ... }
* { box-sizing: border-box; }

/* 2. Layout */
.container { ... }
.sidebar { ... }
.main-content { ... }

/* 3. Components */
.menu { ... }
.card { ... }
.modal { ... }
.button { ... }

/* 4. Page-specific */
.course-page { ... }
.recommendation-page { ... }

/* 5. Responsive */
@media (max-width: 767px) { ... }
@media (min-width: 768px) and (max-width: 899px) { ... }
@media (min-width: 900px) { ... }
@media (min-width: 1280px) { ... }
```

**CSS Variables:**
```css
:root {
  --color-primary: #...;
  --color-secondary: #...;
  --font-main: '...';
  --spacing-unit: 8px;
  --border-radius: 4px;
}
```

---

## HTML Templates

### `src/template.html` - Main Template

Основной шаблон для всех страниц.

**Placeholders (заменяются при сборке):**
```html
{{META_TAGS}}                 <!-- SEO мета-теги -->
{{TITLE}}                     <!-- Заголовок страницы -->
{{SCHEMA_ORG}}                <!-- JSON-LD структурированные данные -->
{{MENU}}                      <!-- Навигационное меню -->
{{CONTENT}}                   <!-- Основной контент -->
{{FOOTER}}                    <!-- Футер с юр. информацией -->
{{SCRIPTS}}                   <!-- JS файлы -->
{{CTA_BUTTON}}                <!-- Кнопка призыва к действию -->
{{READING_TIME}}              <!-- Время чтения -->
```

**Structure:**
```html
<!DOCTYPE html>
<html lang="ru" data-mode="desktop" data-input="pointer">
<head>
  {{META_TAGS}}
  <title>{{TITLE}}</title>
  {{SCHEMA_ORG}}
</head>
<body>
  <aside class="sidebar">
    {{MENU}}
  </aside>
  <main class="main-content">
    {{CONTENT}}
    {{CTA_BUTTON}}
  </main>
  <footer>{{FOOTER}}</footer>
  {{SCRIPTS}}
</body>
</html>
```

---

## UI Components

### Navigation Menu

```html
<nav class="menu">
  <ul class="menu-list">
    <li class="menu-item active">
      <a href="/course/intro.html">Введение</a>
    </li>
    <li class="menu-item">
      <a href="/course/basics.html">Основы</a>
    </li>
  </ul>
</nav>
```

**States:**
- `.active` - текущая страница
- `.disabled` - недоступно в free версии

---

### CTA Button

```html
<div class="cta-container">
  <button class="cta-button">
    Войти в полную версию
  </button>
  <div class="cta-price">
    <span class="price-original">10 000 ₽</span>
    <span class="price-current">3 400 ₽</span>
  </div>
</div>
```

---

### Paywall / Blur Teaser

```html
<div class="content-preview">
  <!-- Видимый intro -->
  <div class="content-intro">...</div>

  <!-- Размытый контент -->
  <div class="content-blurred">
    <div class="blur-overlay"></div>
    <div class="blur-content">...</div>
  </div>

  <!-- Время чтения -->
  <div class="reading-time">
    <span>15 минут чтения</span>
  </div>
</div>
```

---

### Modal Window

```html
<div class="modal" id="modal">
  <div class="modal-backdrop"></div>
  <div class="modal-content">
    <button class="modal-close">&times;</button>
    <div class="modal-body">
      <!-- Content -->
    </div>
  </div>
</div>
```

---

### Navigation Chain (Premium)

```html
<nav class="content-navigation">
  <a href="/premium/course/prev.html" class="nav-prev">
    ← Предыдущий раздел
  </a>
  <a href="/premium/course/next.html" class="nav-next">
    Следующий раздел →
  </a>
</nav>
```

**Chain Order:**
```
intro → course[1] → course[2] → ... → course[N] → appendix[A] → appendix[B] → ...
```

---

## Data Attributes

**Mode & Input:**
```html
<html data-mode="mobile|tablet|desktop|desktop-wide" data-input="touch|pointer">
```

**Legal Links:**
```html
<a data-legal="offer|privacy">Link</a>
```

**Page Type:**
```html
<body data-page-type="course|recommendation|legal|intro">
```

---

## Event Handlers

**Global Events:**
- `DOMContentLoaded` - Инициализация приложения
- `resize` - Обновление responsive режима
- `click` - Делегирование событий

**Custom Events:**
```javascript
document.dispatchEvent(new CustomEvent('modeChanged', { detail: { mode } }));
document.dispatchEvent(new CustomEvent('modalOpened', { detail: { type } }));
document.dispatchEvent(new CustomEvent('modalClosed'));
```

---

## Related Documentation

- [Codebase Overview](CODEBASE.md) - Структура файлов
- [Build System](BUILD_SYSTEM.md) - Как компилируются компоненты
- [Architecture v1.1](ARCHITECTURE_v1.1.md) - Общая архитектура
