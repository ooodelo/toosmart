# Аудит меню-точек (оригинальные файлы)
## Обнаруженные основные файлы:
- HTML: `/mnt/data/orig_full/index.html`
- CSS: `/mnt/data/orig_full/styles.css`
- JS: `/mnt/data/orig_full/script.js`

## CSS — найденные связанные блоки (сокращено):
```
:root{--panel-top: 85px;
  --panel-left: 40px;
  --dur: 1900ms;
  --timing: cubic-bezier(0.4, 0.02, 0.2, 1);
  --gutter: 0px;
  --menu-strap: 40px;
  --menu-content-width: 280px;
  --menu-pad-top: 16px;
  --menu-pad-right: 16px;
  --menu-pad-bottom: 24px;
  --menu-pad-left: 18px;}
```
```
/* Site menu — same color as page background, no shadow/glass */
.menu-rail{position: fixed;
  top: var(--panel-top);
  left: calc(var(--panel-left) - var(--menu-strap) - var(--menu-content-width));
  width: calc(var(--menu-strap) + var(--menu-content-width));
  height: calc(100vh - var(--panel-top));
  display: flex;
  overflow: hidden;
  background: #D9D9D9;
  transform: translateX(var(--shift));
  transition: transform var(--dur) var(--timing);
  z-index: 3;}
```
```
/* Sliding panel (the large F5 area) */
.panel{position: fixed; top: var(--panel-top); left: var(--panel-left); right: 0; bottom: 0;
  background: #F5F5F5;
  border-top-left-radius: 28px;
  transform: translate3d(0,0,0);
  transition: transform var(--dur) var(--timing);
  will-change: transform;
  overflow: hidden;
  z-index: 1;}
```
```
/* Centered text block inside the panel */
.text-box{position: absolute; left: calc(50vw - var(--panel-left)); top: 0; bottom: 0;
  transform: translateX(-50%);
  transition: transform var(--dur) var(--timing);
  width: 640px; overflow: auto; padding: 0 20px;
  background: transparent;
  -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  scrollbar-width: none; -ms-overflow-style: none; z-index: 2;}
```
```
.text-box::-webkit-scrollbar{display: none;}
```
```
/* Pinned PNG — follows the panel's left edge on X, sticks to top of viewport on Y */
.panel-pin{position: fixed; top: 0; left: var(--panel-left);
  width: 130px; height: 130px;
  transform: translate3d(0,0,0);
  transition: transform var(--dur) var(--timing);
  z-index: 9; pointer-events: none;}
```
```
/* Slid state: synchronized movement */
body.is-slid .panel{transform: translate3d(var(--shift),0,0);}
```
```
body.is-slid .text-box{transform: translateX(calc(-50% - var(--shift)));}
```
```
body.is-slid .panel-pin{transform: translate3d(var(--shift),0,0);}
```
```
/* === Right-side vertical recommendation blocks === */
.stack{position: fixed;
  top: calc(var(--panel-top) + 60px);
  right: 40px;
  width: 280px;
  pointer-events: auto;
  z-index: 2;
  overflow: visible;}
```
```
@media (prefers-reduced-motion: reduce){.panel, .text-box, .panel-pin, .site-menu, .menu-vertical-label, .menu-rail { transition: none !important;}
```
```
}


/* injected: dot status styles */

/* === Dot status bar (scoped) === */
.text-wrap{position: relative;
  max-width: 760px;
  margin: 0 auto; /* reserve space for dot stack + offset */}
```

## JS — функции/фрагменты, затрагивающие меню/точки (сокращено):
### function setFlyoutBlur()
```js
function setFlyoutBlur(px){
    var el = document.querySelector('.flyout-backdrop') || document.querySelector('.dot-flyout');
    if(!el) return;
    el.style.webkitBackdropFilter = 'blur(' + px + 'px) saturate(1.1)';
    el.style.backdropFilter = 'blur(' + px + 'px) saturate(1.1)';
  }
```
### function sanitizeMobile()
```js
function sanitizeMobile(){
    if(!mq.matches) return;
    // remove desktop slide class if present
    doc.body.classList.remove('is-slid');
    // Also remove inline styles that scripts could set
    ['.menu-rail','.site-menu','.menu-scroll'].forEach(sel => {
      const el = doc.querySelector(sel);
      if(el) el.removeAttribute('style');
    });
  }
```

### JS — отдельные строки/привязки (сокращено):
```js
  const panel = document.querySelector('.panel');
  // Slide out when entering the 40px zone; slide back only when entering the panel
  if (panel) {
    panel.addEventListener('mouseenter', () => {
// injected: dot status logic
// Build dot list based on number of subheadings and highlight the one in view
  const container = document.querySelector('.dot-status');
  const chapters = Array.from(document.querySelectorAll('.test-text .chapter'));
  if (!container || chapters.length === 0) return;
  // Create a dot for each chapter
  chapters.forEach((ch, idx) => {
    const dot = document.createElement('button');
      ch.querySelector('.chapter__title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const dots = Array.from(container.querySelectorAll('.dot'));
  const titles = chapters.map(ch => ch.querySelector('.chapter__title')).filter(Boolean);
// Measure menu width to sync panel shift and sliding distance
  const rail = menu.closest('.menu-rail');
// injected: fixed dot-status, centered vertically, 10px LEFT of text block
  const container = document.querySelector('.dot-status');
  const wrap = document.querySelector('.text-wrap');
/* v1.2 dot-flyout menu */
  const textBox = root.querySelector('.text-box');
  const chapters = Array.from(root.querySelectorAll('.chapter'));
  const titles = chapters.map((c, i) => {
    let h = c.querySelector('.chapter__title') || c.querySelector('h2,h3,h4');
    if (!c.id) c.id = 'chapter-' + (i+1);
  const dots = root.querySelector('.dot-status');
  const flyout = root.querySelector('.dot-flyout');
    btn.className = 'dot-flyout__item';
    const btn = e.target.closest('.dot-flyout__item');
    const items = Array.from(flyout.querySelectorAll('.dot-flyout__item'));
  const flyout = document.querySelector('.dot-flyout');
  const backdrop = document.querySelector('.flyout-backdrop');
  const flyout = document.querySelector('.dot-flyout');
  const backdrop = document.querySelector('.flyout-backdrop');
    var el = document.querySelector('.flyout-backdrop') || document.querySelector('.dot-flyout');
  const flyout = document.querySelector('.dot-flyout');
  const backdrop = document.querySelector('.flyout-backdrop');
  const flyout = document.querySelector('.dot-flyout');
  }, { root: document.querySelector('.text-box') || null, rootMargin: '0px 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] });
  const rail = doc.querySelector('.menu-rail');
  let backdrops = Array.from(doc.querySelectorAll('.flyout-backdrop'));
    ['.menu-rail','.site-menu','.menu-scroll'].forEach(sel => {
```