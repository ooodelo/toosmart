# Доработки шаблонов верстки

**Дата:** 2025-11-16
**Статус:** Завершено

## 📋 Что было сделано

### 1. Исправлен исходный template.html

**Файл:** `src/template.html`

**Изменения:**
- ✅ Исправлены пути к ресурсам в header:
  - `PointingToClean.png` → `assets/PointingToClean.png`
  - `templates/CleanLogo.svg` → `assets/CleanLogo.svg`

Теперь шаблон можно открыть локально из папки `src/` и все ресурсы загрузятся корректно.

---

### 2. Созданы два новых шаблона

#### 📄 `src/template-paywall.html`

**Назначение:** Используется для FREE версии платных разделов курса (course)

**Структура:**
```
- Header с логотипом
- Меню структуры курса (с временем чтения)
- Main:
  - Вступительный контент (видимый, для SEO)
  - Paywall блок:
    - Подпись "Осталось N минут чтения"
    - Blur-контент (300px высота)
    - Кнопка "🔒 Получить полную версию"
- Модальное окно оплаты Robokassa
- Футер
```

**Ключевые элементы:**
- `.premium-teaser` - контейнер paywall блока
- `.teaser-hint` - "Осталось N минут чтения"
- `.blurred-content[data-nosnippet]` - размытый контент с `<!--noindex-->`
- `.unlock-overlay` - оверлей с кнопкой
- `.btn-unlock` - кнопка открытия модалки
- `#payment-modal` - модальное окно с формой Robokassa

#### 📄 `src/template-full.html`

**Назначение:** Используется для всех остальных страниц:
- Intro (FREE и PREMIUM)
- Recommendations (FREE и PREMIUM)
- Course разделы в PREMIUM
- Appendix в PREMIUM

**Структура:**
```
- Header с логотипом
- Меню структуры курса (с временем чтения)
- Main:
  - Полный контент статьи
  - Блок .article-footer с кнопкой навигации
- Футер
```

**Ключевые элементы:**
- `#article-content` - контейнер для полного контента
- `.article-footer` - контейнер для кнопки
- `.btn-next` - кнопка "Далее →" (крупная, для Premium course)
- `.btn-to-course` - кнопка "Перейти к полному курсу" (меньше, для Free)
- `.btn-back` - кнопка "Вернуться к курсу" (меньше, для Premium recommendations)

---

### 3. Добавлены стили в styles.css

**Файл:** `src/styles.css`

**Добавлено ~410 строк стилей** для новых компонентов:

#### Paywall блок
- `.premium-teaser` - контейнер
- `.teaser-hint` - подпись о времени чтения
- `.blurred-content` - blur эффект + gradient mask
- `.unlock-overlay` - оверлей с кнопкой
- `.btn-unlock` - кнопка с gradient и hover эффектами

#### Модальное окно
- `.modal` - контейнер с fade-in анимацией
- `.modal-overlay` - полупрозрачный фон с backdrop-filter blur
- `.modal-content` - белая карточка с slide-in анимацией
- `.modal-close` - кнопка закрытия (×)
- `.modal-title`, `.modal-benefits`, `.modal-price` - контент
- `.modal-input` - поле ввода email
- `.modal-submit` - кнопка оплаты
- `.modal-security` - текст безопасности

#### Кнопки навигации
- `.article-footer` - контейнер кнопок
- `.btn-next` - крупная кнопка "Далее" (18px, gradient)
- `.btn-to-course`, `.btn-back` - меньшая кнопка (15px, outline)

#### Футер
- `.site-footer` - темный фон
- `.footer-container` - grid layout (3 колонки)
- `.footer-column` - колонка с контентом
- `.footer-links` - список ссылок
- `.footer-bottom` - копирайт

#### Дополнительно
- `.reading-time` - время чтения в меню (серый, курсив, 13px)
- Mobile адаптация для всех компонентов

---

## 🎯 Для разработчика build.js

### Как использовать шаблоны

```javascript
// Псевдокод

function generatePage(contentType, version, content, meta) {
  let templatePath;

  // Выбор шаблона
  if (version === 'free' && contentType === 'course') {
    templatePath = 'src/template-paywall.html';
  } else {
    templatePath = 'src/template-full.html';
  }

  let html = readFile(templatePath);

  // Подстановка контента
  html = html.replace('<!-- КОНТЕЙНЕР ДЛЯ ... -->', content);

  // Подстановка кнопки
  let button = generateButton(contentType, version, meta);
  html = html.replace(/<!-- Пример для .+ -->/g, button);

  // Подстановка времени чтения
  html = html.replace('<span class="reading-time-value">12</span>',
                       `<span class="reading-time-value">${meta.readingTime}</span>`);

  return html;
}
```

### Генерация кнопок

```javascript
function generateButton(contentType, version, meta) {
  // Premium course/appendix → "Далее"
  if (version === 'premium' && (contentType === 'course' || contentType === 'appendix')) {
    return `<a href="${meta.nextPage}" class="btn-next">Далее →</a>`;
  }

  // Premium intro → "Далее" на первый раздел
  if (version === 'premium' && contentType === 'intro') {
    return `<a href="/premium/course/01-basics.html" class="btn-next">Далее →</a>`;
  }

  // Free intro/recommendations → "Перейти к курсу"
  if (version === 'free' && (contentType === 'intro' || contentType === 'recommendations')) {
    return `<a href="/premium/" class="btn-to-course">Перейти к полному курсу</a>`;
  }

  // Premium recommendations → "Вернуться к курсу"
  if (version === 'premium' && contentType === 'recommendations') {
    return `<a href="/premium/" class="btn-back">Вернуться к курсу</a>`;
  }
}
```

### Генерация paywall контента

```javascript
function generatePaywallContent(markdown, readingTime) {
  // Извлечь intro (логическое введение)
  let intro = extractIntro(markdown); // H2 "Введение" или первые абзацы

  // Извлечь blur-фрагмент (следующие абзацы до ~300px)
  let blurFragment = extractBlurFragment(markdown, intro);

  // Обернуть blur в noindex
  let blurHtml = `
    <div class="blurred-content" data-nosnippet>
      <!--noindex-->
      ${markdownToHtml(blurFragment)}
      <!--/noindex-->
    </div>
  `;

  // Собрать paywall блок
  return `
    <div id="article-intro">
      ${markdownToHtml(intro)}
    </div>

    <div class="premium-teaser">
      <p class="teaser-hint">Осталось <span class="reading-time-value">${readingTime}</span> минут чтения</p>
      ${blurHtml}
      <div class="unlock-overlay">
        <button class="btn-unlock" type="button" onclick="openPaymentModal()">
          🔒 Получить полную версию
        </button>
      </div>
    </div>
  `;
}
```

### Подстановка времени чтения в меню

```javascript
function generateMenu(sections, readingTimes) {
  let menuHtml = '<ul class="site-menu__list">';

  sections.forEach((section, index) => {
    const time = readingTimes[section.id];
    menuHtml += `
      <li>
        <a href="${section.url}">
          ${index + 1}. ${section.title}
          <span class="reading-time">~ ${time} мин</span>
        </a>
      </li>
    `;
  });

  menuHtml += '</ul>';
  return menuHtml;
}
```

---

## 📝 Примеры использования

### Пример 1: FREE course раздел

```javascript
const content = generatePaywallContent(markdown, 12);
const html = readFile('src/template-paywall.html');
const result = html.replace('<!-- КОНТЕЙНЕР ДЛЯ ВСТУПИТЕЛЬНОГО КОНТЕНТА (build.js вставит сюда intro текст) -->', content);

writeFile('dist/free/course/chemistry.html', result);
```

### Пример 2: PREMIUM course раздел

```javascript
const content = markdownToHtml(markdown);
const button = '<a href="bathroom.html" class="btn-next">Далее →</a>';
const html = readFile('src/template-full.html');

let result = html.replace('<!-- КОНТЕЙНЕР ДЛЯ ПОЛНОГО КОНТЕНТА (build.js вставит сюда весь контент) -->', content);
result = result.replace(/<a href="next-section\.html" class="btn-next">Далее →<\/a>/, button);

writeFile('dist/premium/course/chemistry.html', result);
```

### Пример 3: FREE intro

```javascript
const content = markdownToHtml(markdown);
const button = '<a href="/premium/" class="btn-to-course">Перейти к полному курсу</a>';
const html = readFile('src/template-full.html');

let result = html.replace('<!-- КОНТЕЙНЕР ДЛЯ ПОЛНОГО КОНТЕНТА -->', content);
result = result.replace(/<a href="next-section\.html".+?<\/a>/, button);

writeFile('dist/free/intro.html', result);
```

---

## ✅ Чеклист для build.js

- [ ] Читать template-paywall.html для FREE course разделов
- [ ] Читать template-full.html для всех остальных страниц
- [ ] Подставлять контент в нужные контейнеры
- [ ] Генерировать правильную кнопку в зависимости от типа страницы
- [ ] Подставлять время чтения в меню (.reading-time)
- [ ] Подставлять время чтения в paywall (.reading-time-value)
- [ ] Генерировать меню с временем чтения из config.json
- [ ] Генерировать карусель рекомендаций из recommendations.json
- [ ] Обновлять мета-теги (title, description, canonical)
- [ ] Добавлять Schema.org микроразметку (JSON-LD)
- [ ] Копировать assets, scripts, styles в dist/

---

## 🎨 Дизайн-токены

**Основной цвет:** `#667eea` (фиолетовый gradient)
**Accent gradient:** `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
**Футер фон:** `#1a1a1a`
**Blur размытие:** `blur(4px)`
**Blur высота:** `300px`
**Border radius (кнопки):** `8px`
**Border radius (модалка):** `16px`

**Размеры текста:**
- `.btn-next`: 18px, font-weight 600
- `.btn-to-course`: 15px, font-weight 500
- `.reading-time`: 13px, font-weight 400, italic
- `.modal-title`: 24px, font-weight 700

---

**Документ обновлен:** 2025-11-16
**Версия шаблонов:** 1.0
