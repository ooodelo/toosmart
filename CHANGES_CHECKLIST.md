# 📋 ПОЛНЫЙ СПИСОК ИЗМЕНЕНИЙ ИЗ АУДИТА + УТОЧНЕНИЯ

**Дата:** 2025-11-09
**Основа:** FULL_AUDIT_REPORT.md + диалог с пользователем

---

## 🎯 КРИТИЧЕСКИЕ ИЗМЕНЕНИЯ (обязательно)

### 1. CSS: Стили для markdown-элементов

**Файл:** `styles.css`
**Что добавить:** Блок стилей для markdown контента

```css
/* === MARKDOWN CONTENT STYLES === */

/* Изображения */
.text-section img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 24px auto; /* центрирование */
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

/* Подписи к изображениям */
.text-section figcaption {
  text-align: center;
  font-size: 14px;
  color: #666;
  margin-top: 8px;
  font-style: italic;
}

/* Код inline */
.text-section code {
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  color: #c7254e;
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
  font-size: 1em;
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

/* Заголовки H3, H4 */
.text-section h3 {
  margin: 32px 0 16px;
  font-size: 1.3em;
}

.text-section h4 {
  margin: 24px 0 12px;
  font-size: 1.1em;
}

/* Ссылки в тексте */
.text-section a {
  color: #0066cc;
  text-decoration: underline;
}

.text-section a:hover {
  color: #004499;
}
```

**Трудоемкость:** 30 минут

---

### 2. CSS: Исправить кнопку "Далее"

**Файл:** `styles.css`
**Строки:** 470-476 (desktop), 519-525 (tablet-wide)

**БЫЛО:**
```css
body[data-mode="desktop"] .btn-next {
  display: flex;
  width: fit-content;
  position: sticky; /* прилипает при скролле */
  bottom: 24px;
  margin: 48px auto 0;
}
```

**СТАНЕТ:**
```css
body[data-mode="desktop"] .btn-next {
  display: flex;
  width: fit-content;
  position: static; /* обычная позиция в потоке */
  margin: 48px auto 24px; /* отступ снизу */
}
```

**То же самое для tablet-wide** (строки 519-525)

**Трудоемкость:** 5 минут

---

### 3. CSS + JS: Parallax scroll для рекомендаций

#### 3.1. CSS изменения

**Файл:** `styles.css`

**Строка 330-343:** Убрать sticky, max-height
```css
/* БЫЛО: */
.stack {
  position: sticky;
  top: var(--stack-top);
  max-height: calc(100dvh - var(--stack-top) - var(--stack-bottom));
}

/* СТАНЕТ: */
.stack {
  position: relative; /* убираем sticky */
  will-change: transform; /* оптимизация для parallax */
  /* max-height убираем полностью */
}
```

**Строка 351-361:** Убрать внутренний скролл
```css
/* БЫЛО: */
.stack-list {
  overflow: auto; /* внутренний скролл */
  min-height: 0;
}

/* СТАНЕТ: */
.stack-list {
  overflow: visible; /* без скролла */
  /* min-height убираем */
}
```

**Строка 475-487 (desktop):** То же для режима desktop
```css
/* БЫЛО: */
body[data-mode="desktop"] .stack {
  position: sticky;
  top: var(--stack-top);
  max-height: calc(100dvh - ...);
}

/* СТАНЕТ: */
body[data-mode="desktop"] .stack {
  position: relative;
  /* sticky и max-height убираем */
}
```

**Строка 521-533 (tablet-wide):** То же для tablet-wide

#### 3.2. JavaScript добавление

**Файл:** `script.js`

**Где вставить:** После функции `initMenuLinks()` (строка 631), перед `function init()`

**Что добавить:**
```javascript
/**
 * Parallax scroll для блока рекомендаций
 *
 * Механика:
 * 1. Блок скроллится медленнее основного контента (коэффициент PARALLAX_SPEED)
 * 2. Когда низ блока достигает низа viewport → останавливается
 * 3. Текст продолжает скроллиться дальше
 * 4. При обратном скролле работает аналогично
 *
 * Работает только на desktop и tablet-wide
 */
function initParallaxStack() {
  const stack = document.querySelector('.stack');
  if (!stack) return;

  // Коэффициент замедления (0.6 = в 2.5 раза медленнее)
  // Можно настроить: 0.5 (быстрее), 0.7 (медленнее)
  const PARALLAX_SPEED = 0.6;

  let ticking = false;

  function updateParallax() {
    // Отключаем на handheld
    if (currentMode === 'handheld') {
      stack.style.transform = 'none';
      return;
    }

    const scrollY = window.scrollY || window.pageYOffset;
    const stackHeight = stack.offsetHeight;
    const viewportHeight = window.innerHeight;

    // Вычисляем parallax offset
    // Отрицательное значение двигает блок вверх медленнее
    let parallaxOffset = -scrollY * (1 - PARALLAX_SPEED);

    // Ограничение сверху: не выше начальной позиции
    parallaxOffset = Math.min(0, parallaxOffset);

    // Ограничение снизу: остановка когда низ блока = низ viewport
    if (stackHeight > viewportHeight) {
      const maxOffset = -(stackHeight - viewportHeight);
      parallaxOffset = Math.max(maxOffset, parallaxOffset);
    }

    // Применяем transform
    stack.style.transform = `translateY(${parallaxOffset}px)`;

    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  // Слушаем скролл (passive для производительности)
  window.addEventListener('scroll', requestTick, { passive: true });

  // Обновляем при resize
  window.addEventListener('resize', () => {
    requestTick();
  });

  // Первоначальное обновление
  updateParallax();
}
```

**В функции init() добавить вызов:**
```javascript
function init() {
  updateMode();
  initDots();
  initMenuInteractions();
  attachEdgeGesture();
  initMenuLinks();
  initParallaxStack(); // <- добавить эту строку

  const handleNextClick = () => handleNext();
  // ...остальной код...
}
```

**Трудоемкость:** 1.5 часа

---

### 4. JavaScript: Исправить handleNext()

**Файл:** `script.js`
**Строки:** 529-535

**БЫЛО (скролл внутри статьи):**
```javascript
function handleNext() {
  const currentIndex = getCurrentSectionIndex();
  const nextSection = sections[currentIndex + 1] || sections[0];
  activeSectionId = nextSection.id;
  updateActiveDot();
  nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

**СТАНЕТ (переход на следующую страницу):**

Для статичных HTML страниц:
```javascript
function handleNext() {
  // Получаем URL следующей страницы из data-атрибута кнопки
  const nextPageUrl = btnNext?.dataset.nextPage;

  if (nextPageUrl) {
    window.location.href = nextPageUrl;
  } else {
    console.warn('Кнопка "Далее": не указан data-next-page');
  }
}
```

В HTML кнопку нужно будет настроить:
```html
<button class="btn-next" type="button" data-next-page="article-2.html">Далее</button>
```

**Трудоемкость:** 10 минут

---

## 🟡 ВАЖНЫЕ ИЗМЕНЕНИЯ (желательно)

### 5. CSS: Вынести захардкоженные цвета в переменные

**Файл:** `styles.css`

**Добавить в :root (строки 1-50):**
```css
:root {
  /* ...существующие переменные... */

  /* Цвета контента */
  --surface-content: #fff;
  --code-inline-bg: var(--surface);
  --code-inline-color: #c7254e;
  --code-block-bg: #2d2d2d;
  --code-block-color: #f8f8f2;
  --link-color: #0066cc;
  --link-hover: #004499;
}
```

**Заменить во всех местах:**
```css
/* Вместо: */
background: #fff;
/* Писать: */
background: var(--surface-content);
```

**Трудоемкость:** 30 минут

---

### 6. HTML: Контейнер для динамического контента

**Файл:** `index.html`
**Строки:** 112-152 (внутри `.text-box`)

**Обернуть существующий контент в контейнер для будущей генерации:**

```html
<article class="text-box" aria-label="Основной материал">
  <div class="text-box__intro">
    <!-- intro text -->
  </div>

  <!-- КОНТЕЙНЕР ДЛЯ ДИНАМИЧЕСКОГО КОНТЕНТА -->
  <div id="article-content">
    <!-- Сюда будет генериться контент из markdown -->

    <!-- Пока оставляем тестовые секции -->
    <section id="section-1" class="text-section" data-section="Раздел 1">
      <!-- существующий контент -->
    </section>
    <!-- ...остальные секции... -->
  </div>

  <button class="btn-next" type="button" data-next-page="">Далее</button>
</article>
```

**Трудоемкость:** 5 минут

---

## 🟢 ОПЦИОНАЛЬНЫЕ УЛУЧШЕНИЯ

### 7. CSS: Loading состояния

```css
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

.text-box.error {
  padding: 48px;
  text-align: center;
  color: #d32f2f;
}
```

**Трудоемкость:** 15 минут

---

## 📊 ИТОГОВАЯ ТАБЛИЦА ИЗМЕНЕНИЙ

| # | Изменение | Файл | Приоритет | Время | Статус |
|---|-----------|------|-----------|-------|--------|
| 1 | Стили для markdown | styles.css | 🔴 КРИТИЧНО | 30мин | ❌ TODO |
| 2 | Кнопка "Далее" CSS | styles.css | 🔴 КРИТИЧНО | 5мин | ❌ TODO |
| 3 | Parallax CSS | styles.css | 🔴 КРИТИЧНО | 30мин | ❌ TODO |
| 4 | Parallax JS | script.js | 🔴 КРИТИЧНО | 1ч | ❌ TODO |
| 5 | handleNext() | script.js | 🔴 КРИТИЧНО | 10мин | ❌ TODO |
| 6 | CSS переменные | styles.css | 🟡 ВАЖНО | 30мин | ❌ TODO |
| 7 | Контейнер #article-content | index.html | 🟡 ВАЖНО | 5мин | ❌ TODO |
| 8 | Loading состояния | styles.css | 🟢 ОПЦИОНАЛЬНО | 15мин | ❌ TODO |

**Общая трудоемкость критических правок:** ~2.5 часа
**Общая трудоемкость всех правок:** ~4 часа

---

## 🎯 УТОЧНЕНИЯ ИЗ ДИАЛОГА

### Parallax для рекомендаций (от пользователя):
- ✅ НЕТ внутреннего скролла в блоке рекомендаций
- ✅ 2-4 рекламных блока, которые "висят" на экране
- ✅ Если высота блока > viewport → общий скролл страницы
- ✅ Блок скроллится **медленнее** текста (коэффициент 0.6)
- ✅ Когда блок достигает конца → останавливается
- ✅ Текст продолжает скроллиться дальше
- ✅ При обратном скролле — та же механика

### Статичная генерация (от пользователя):
- ✅ Сборка происходит **один раз** (не runtime)
- ✅ Один markdown файл → одна HTML страница
- ✅ Картинки PNG inline (не галереи, не zoom)
- ✅ Текст не разбивается на блоки
- ✅ Генерация будет настраиваться **в самом конце**

### Последовательность работы (от пользователя):
1. **СНАЧАЛА:** Подготовить структуру, стили, анимации
2. **Наполнить** тестовой информацией (реалистичной)
3. **ПОТОМ:** Настроить генерацию из markdown

---

## 🔄 ПЛАН ДЕЙСТВИЙ

### Фаза 1: Применить критические правки (2.5 часа)
1. Добавить стили для markdown (30мин)
2. Исправить CSS кнопки "Далее" (5мин)
3. Реализовать parallax для рекомендаций (1.5ч)
4. Исправить handleNext() (10мин)

### Фаза 2: Создать тестовый контент (2 часа)
1. Создать 3 HTML страницы со статьями
2. Наполнить реалистичным текстом (1500-2500 слов)
3. Добавить placeholder изображения
4. Примеры таблиц, кода, цитат

### Фаза 3: Визуал и доработка (по обсуждению)
1. Обсудить цветовую схему
2. Настроить типографику
3. Тонкая настройка spacing, анимаций

### Фаза 4: Система генерации (в самом конце)
1. Build-скрипт для markdown → HTML
2. Копирование изображений
3. Генерация навигации

---

**Готово для работы!**
