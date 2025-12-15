# Paywall CTA Button — Техническая документация

## Обзор

CTA кнопка в paywall-зоне с анимированной «слот-машиной» иконок и эффектом размытия текста (blur marker).

---

## DOM-структура

### Исходный HTML (до инициализации JS)

```html
<div class="paywall-overlay" aria-hidden="true">
  <!-- Fluid overlay for blur effects -->
  <div class="paywall-overlay__fluid" data-fluid-overlay></div>
  
  <!-- CTA Container -->
  <div class="paywall-overlay__cta">
    <div class="paywall-overlay__cta-inner">
      
      <!-- Main CTA Button -->
      <button class="paywall-cta-button cta-button" 
              data-analytics="cta-premium" 
              data-paywall-cta
              type="button">
        <span>Войти в полную версию</span>
        
        <!-- Initial icon (replaced by JS with slot machine) -->
        <img src="/assets/cloth.png" alt="" 
             class="paywall-cta-button__icon" 
             aria-hidden="true">
      </button>
      
      <!-- FAB Button -->
      <div class="paywall-fab" data-paywall-fab>
        <button class="paywall-fab__btn" data-paywall-add type="button">
          <span class="paywall-fab__icon" aria-hidden="true">+</span>
          <span data-paywall-add-label>Добавить абзац</span>
        </button>
        <div class="paywall-fab__timer" data-paywall-timer hidden></div>
      </div>
      
    </div>
  </div>
</div>
```

### После инициализации JS (`initCtaIconAnimation()`)

```html
<button class="paywall-cta-button cta-button" ...>
  <span>Войти в полную версию</span>
  
  <!-- Slot Machine Container (replaces static icon) -->
  <div class="paywall-cta-slot">
    <div class="paywall-cta-slot__track">
      <div class="paywall-cta-slot__item">
        <img src="/assets/cloth.png" alt="" aria-hidden="true">
      </div>
      <div class="paywall-cta-slot__item">
        <img src="/assets/glove.png" alt="" aria-hidden="true">
      </div>
      <div class="paywall-cta-slot__item">
        <img src="/assets/pump_bottle.png" alt="" aria-hidden="true">
      </div>
      <!-- ...всего 7 иконок + дубликат первой для seamless loop... -->
    </div>
  </div>
</button>
```

---

## CSS — Полный код

### Overlay структура

```css
.paywall-overlay__fluid {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: transparent;
}

.paywall-overlay__cta {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.paywall-overlay__cta-inner {
  position: sticky;
  top: 50vh;
  transform: translateY(-50%);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
}
```

### CTA Кнопка

```css
.paywall-cta-button {
  pointer-events: auto;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 85%;
  margin: 0 auto;
  height: 150px;
  padding: 16px 32px;
  border: none;
  border-radius: 70%;
  background: #262728;
  color: #f5f5f5;
  font-weight: 700;
  font-size: 22px;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.5);
  transition: transform 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
}

.paywall-cta-button:hover {
  background: #262728;
  transform: scale(1.05);
  box-shadow: 0 35px 110px rgba(0, 0, 0, 0.55);
}

.paywall-cta-button:active {
  transform: scale(0.95);
}
```

### Статическая иконка (до JS замены)

```css
.paywall-cta-button__icon {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
  width: auto;
  object-fit: contain;
  z-index: 0;
}
```

### Текст с Blur-эффектом (Blur Marker)

```css
.paywall-cta-button span {
  position: relative;
  z-index: 1;
  padding: 4px 12px;
  background: rgba(38, 39, 40, 0.3);
  border-radius: 4px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

### Slot Machine Container

```css
/* iOS-style Picker Wheel Animation */
.paywall-cta-slot {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
  width: 100%;
  overflow: hidden;
  z-index: 0;
  
  /* iOS-style gradient mask for depth effect */
  mask-image: linear-gradient(to bottom,
      transparent 0%,
      rgba(0, 0, 0, 0.5) 25%,
      black 40%,
      black 60%,
      rgba(0, 0, 0, 0.5) 75%,
      transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom,
      transparent 0%,
      rgba(0, 0, 0, 0.5) 25%,
      black 40%,
      black 60%,
      rgba(0, 0, 0, 0.5) 75%,
      transparent 100%);
}

.paywall-cta-slot__track {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  will-change: transform;
}

.paywall-cta-slot__item {
  width: 100%;
  height: 150px; /* Same as button height */
  display: flex;
  align-items: center;
  justify-content: center;
}

.paywall-cta-slot__item img {
  height: 92%;
  width: auto;
  object-fit: contain;
}
```

---

## JavaScript — Полный код

```javascript
const CTA_ICONS = [
  '/assets/cloth.png',
  '/assets/glove.png',
  '/assets/pump_bottle.png',
  '/assets/rect_brush.png',
  '/assets/round_brush.png',
  '/assets/toilet_brush.png',
  '/assets/trigger_spray.png'
];

function initCtaIconAnimation() {
  const button = document.querySelector('.paywall-cta-button');
  const existingIcon = button?.querySelector('.paywall-cta-button__icon');
  if (!button || !existingIcon) return;

  // Create slot machine container
  const slotContainer = document.createElement('div');
  slotContainer.className = 'paywall-cta-slot';

  const slotTrack = document.createElement('div');
  slotTrack.className = 'paywall-cta-slot__track';

  // Create slot items - duplicate first item at end for seamless loop
  const allIcons = [...CTA_ICONS, CTA_ICONS[0]];

  allIcons.forEach((src) => {
    const item = document.createElement('div');
    item.className = 'paywall-cta-slot__item';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    item.appendChild(img);
    slotTrack.appendChild(item);
  });

  slotContainer.appendChild(slotTrack);
  existingIcon.replaceWith(slotContainer);

  // Preload all images
  CTA_ICONS.forEach(src => {
    const img = new Image();
    img.src = src;
  });

  let currentIndex = 0;
  const itemHeight = 150; // Same as CSS .paywall-cta-slot__item height

  function animateToNext() {
    currentIndex++;

    // Enable smooth transition
    slotTrack.style.transition = 'transform 0.8s cubic-bezier(0.33, 1, 0.68, 1)';
    slotTrack.style.transform = `translateY(-${currentIndex * itemHeight}px)`;

    // If we reach the duplicate (last item), reset to beginning
    if (currentIndex >= CTA_ICONS.length) {
      setTimeout(() => {
        // Disable transition for instant reset
        slotTrack.style.transition = 'none';
        slotTrack.style.transform = 'translateY(0)';
        currentIndex = 0;
        // Force reflow
        void slotTrack.offsetHeight;
      }, 850); // Slightly after animation completes
    }
  }

  setInterval(animateToNext, 1800);
}

// Call on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initCtaIconAnimation();
});
```

---

## Ключевые параметры

| Параметр | Значение | Описание |
|----------|----------|----------|
| Высота кнопки | `150px` | Определяет размер slot machine |
| Ширина кнопки | `85%` | Адаптивная ширина |
| `border-radius` | `70%` | Овальная форма кнопки |
| Интервал анимации | `1800ms` | Время между переключениями иконок |
| Длительность перехода | `0.8s` | Скорость анимации slide |
| Easing | `cubic-bezier(0.33, 1, 0.68, 1)` | iOS-style easing (ease-out-cubic) |
| Mask gradient stops | `0%/25%/40%/60%/75%/100%` | Fade эффект для iOS picker wheel |
| Blur для текста | `blur(8px)` | backdrop-filter для span |

---

## Необходимые ассеты

Изображения в `/assets/`:
- `cloth.png`
- `glove.png`
- `pump_bottle.png`
- `rect_brush.png`
- `round_brush.png`
- `toilet_brush.png`
- `trigger_spray.png`

---

## Принцип работы анимации

1. **Инициализация**: JS находит `.paywall-cta-button__icon` и заменяет её на `.paywall-cta-slot`
2. **Track**: Все иконки + дубликат первой укладываются вертикально в `.paywall-cta-slot__track`
3. **Animation loop**: Каждые 1800ms track сдвигается вверх на 150px
4. **Seamless loop**: Когда достигнут последний элемент (дубликат первого), transition отключается и track мгновенно возвращается в начало
5. **Mask effect**: CSS mask-image создаёт iOS picker wheel эффект затухания сверху и снизу

---

## Checklist для повторения

- [ ] HTML: добавить структуру с `.paywall-cta-button` и `.paywall-cta-button__icon`
- [ ] CSS: скопировать все стили выше
- [ ] JS: скопировать `CTA_ICONS` и `initCtaIconAnimation()`
- [ ] Assets: разместить 7 PNG иконок в `/assets/`
- [ ] Инициализация: вызвать `initCtaIconAnimation()` после DOM ready
