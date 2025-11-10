(function() {
  const body  = document.body;
  const zone  = document.querySelector('.hover-zone');
  const panel = document.querySelector('.panel');

  // Slide out when entering the 40px zone; slide back only when entering the panel
  if (zone) {
    zone.addEventListener('mouseenter', () => {
      body.style.setProperty('--dur', '450ms');
      body.style.setProperty('--timing', 'cubic-bezier(.22,.61,.36,1)');
      body.classList.add('is-slid');
    });
  }
  if (panel) {
    panel.addEventListener('mouseenter', () => {
      body.style.setProperty('--dur', '700ms');
      body.style.setProperty('--timing', 'cubic-bezier(.2,.8,.2,1)');
      body.classList.remove('is-slid');
    });
  }
})();

// injected: dot status logic

// Build dot list based on number of subheadings and highlight the one in view
(function() {
  const container = document.querySelector('.dot-status');
  const chapters = Array.from(document.querySelectorAll('.test-text .chapter'));
  if (!container || chapters.length === 0) return;

  // Create a dot for each chapter
  chapters.forEach((ch, idx) => {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Перейти к разделу ' + (idx + 1));
    dot.addEventListener('click', () => {
      ch.querySelector('.chapter__title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    container.appendChild(dot);
  });

  const dots = Array.from(container.querySelectorAll('.dot'));

  // Use IntersectionObserver to detect which title is in view
  const titles = chapters.map(ch => ch.querySelector('.chapter__title')).filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    // Choose the most visible entry
    let best = null;
    for (const e of entries) {
      if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
    }
    if (!best) return;
    const idx = titles.indexOf(best.target);
    if (idx >= 0) {
      dots.forEach(d => d.classList.remove('is-active'));
      dots[idx].classList.add('is-active');
    }
  }, {
    root: null,
    rootMargin: '0px 0px -60% 0px', // bias toward titles in the upper part of viewport
    threshold: [0.0, 0.25, 0.5, 0.75, 1.0]
  });

  titles.forEach(t => observer.observe(t));

  // Initialize: force an update on load
  window.addEventListener('load', () => {
    // Trigger by scrolling 1px
    window.scrollTo({ top: window.scrollY + 1 });
    window.scrollTo({ top: window.scrollY - 1 });
  });
})();


// Measure menu width to sync panel shift and sliding distance
(function() {
  const root = document.documentElement;
  const menu = document.querySelector('.site-menu');
  const scroll = menu?.querySelector('.menu-scroll');
  if (!menu || !scroll) return;
  const rail = menu.closest('.menu-rail');

  function measure() {
    const minWidth = 220;
    const maxWidth = 380;
    const rootStyles = getComputedStyle(document.documentElement);
    const padTop = (rootStyles.getPropertyValue('--menu-pad-top') || '16px').trim();
    const padRight = (rootStyles.getPropertyValue('--menu-pad-right') || '16px').trim();
    const padBottom = (rootStyles.getPropertyValue('--menu-pad-bottom') || '24px').trim();
    const padLeft = (rootStyles.getPropertyValue('--menu-pad-left') || '18px').trim();
    const shouldHide = !document.body.classList.contains('is-slid');

    const prevMenuWidth = menu.style.width;
    const prevMenuVisibility = menu.style.visibility;
    const prevMenuTransition = menu.style.transition;
    const prevScrollWidth = scroll.style.width;
    const prevScrollPadding = scroll.style.padding;
    const prevScrollTransition = scroll.style.transition;
    const prevRailTransition = rail ? rail.style.transition : '';
    const prevRailVisibility = rail ? rail.style.visibility : '';

    menu.style.transition = 'none';
    scroll.style.transition = 'none';
    if (rail) {
      rail.style.transition = 'none';
      if (shouldHide) rail.style.visibility = 'hidden';
    }
    if (shouldHide) menu.style.visibility = 'hidden';
    menu.style.width = 'max-content';
    scroll.style.width = 'max-content';
    scroll.style.padding = `${padTop} ${padRight} ${padBottom} ${padLeft}`;

    const naturalWidth = scroll.getBoundingClientRect().width;

    menu.style.width = prevMenuWidth;
    scroll.style.width = prevScrollWidth;
    scroll.style.padding = prevScrollPadding;
    if (shouldHide) {
      if (prevMenuVisibility) {
        menu.style.visibility = prevMenuVisibility;
      } else {
        menu.style.removeProperty('visibility');
      }
    }
    if (prevMenuTransition) {
      menu.style.transition = prevMenuTransition;
    } else {
      menu.style.removeProperty('transition');
    }
    if (prevScrollTransition) {
      scroll.style.transition = prevScrollTransition;
    } else {
      scroll.style.removeProperty('transition');
    }
    if (rail) {
      if (prevRailTransition) {
        rail.style.transition = prevRailTransition;
      } else {
        rail.style.removeProperty('transition');
      }
      if (shouldHide) {
        if (prevRailVisibility) {
          rail.style.visibility = prevRailVisibility;
        } else {
          rail.style.removeProperty('visibility');
        }
      }
    }

    const contentWidth = Math.max(minWidth, Math.min(Math.ceil(naturalWidth), maxWidth));
    root.style.setProperty('--menu-content-width', contentWidth + 'px');
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => measure())
    : null;
  if (resizeObserver) {
    resizeObserver.observe(scroll);
  }

  measure();
  window.addEventListener('load', () => {
    measure();
    requestAnimationFrame(measure);
  });
  window.addEventListener('resize', measure);
})();





// injected: fixed dot-status, centered vertically, 10px LEFT of text block
(function() {
  const container = document.querySelector('.dot-status');
  const wrap = document.querySelector('.text-wrap');
  if (!container || !wrap) return;

  function positionDotStatus() {
    const rect = wrap.getBoundingClientRect();
    const colWidth = container.offsetWidth || 11; // в т.ч. рамка, запас при 0
    // Разместить колонку ЛЕВЕЕ левого края текста на 15px
    const left = Math.round(rect.left - 15 - colWidth);
    container.style.left = left + 'px';
  }

  // На загрузку и при изменении размеров/ориентации
  window.addEventListener('load', () => { positionDotStatus(); setTimeout(positionDotStatus, 50); });
  window.addEventListener('resize', positionDotStatus);
  window.addEventListener('orientationchange', positionDotStatus);

  positionDotStatus();
})();



/* v1.2 dot-flyout menu */
(function(){
  const root = document;
  const textBox = root.querySelector('.text-box');
  const chapters = Array.from(root.querySelectorAll('.chapter'));
  const titles = chapters.map((c, i) => {
    let h = c.querySelector('.chapter__title') || c.querySelector('h2,h3,h4');
    if (!h) return null;
    if (!c.id) c.id = 'chapter-' + (i+1);
    return { el: h, section: c };
  }).filter(Boolean);
  const dots = root.querySelector('.dot-status');
  const flyout = root.querySelector('.dot-flyout');
  const hoverZone = root.querySelector('.hover-zone');
  if(!dots || !flyout || !titles.length) return;

  // Build items
  flyout.innerHTML = '';
  titles.forEach((t, idx) => {
    const btn = root.createElement('button');
    btn.className = 'dot-flyout__item';
    btn.type = 'button';
    btn.textContent = t.el.textContent.trim();
    btn.setAttribute('data-index', String(idx));
    btn.setAttribute('aria-controls', t.section.id);
    flyout.appendChild(btn);
  });

  // Position X aligned with dots left edge
  function positionFlyout(){
    const dotsRect = dots.getBoundingClientRect();
    const x = Math.max(10, Math.round(dotsRect.left));
    flyout.style.setProperty('--dot-x', x + 'px');
  }
  positionFlyout();
  window.addEventListener('resize', positionFlyout);
  window.addEventListener('orientationchange', positionFlyout);
  if (typeof window.repositionDotStatus === 'function') {
    const orig = window.repositionDotStatus;
    window.repositionDotStatus = function(){
      orig();
      positionFlyout();
    };
  }

  // Show/hide logic with small debounce
  let open = false;
  let hideT;
  function show(){
    clearTimeout(hideT);
    flyout.hidden = false;
    open = true;
    if (hoverZone) hoverZone.style.pointerEvents = 'none';
  }
  function hide(){
    hideT = setTimeout(() => {
      flyout.hidden = true;
      open = false;
      if (hoverZone) hoverZone.style.pointerEvents = '';
    }, 120);
  }

  dots.addEventListener('mouseenter', show);
  dots.addEventListener('mouseleave', hide);
  flyout.addEventListener('mouseenter', show);
  flyout.addEventListener('mouseleave', hide);

  // Click scroll
  flyout.addEventListener('click', (e) => {
    const btn = e.target.closest('.dot-flyout__item');
    if(!btn) return;
    const idx = Number(btn.getAttribute('data-index'));
    const target = titles[idx].section;
    if(!target) return;
    if (textBox) {
      const top = target.offsetTop - (textBox.clientHeight * 0.15);
      textBox.scrollTo({ top, behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // A11y: keyboard nav when open
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    const items = Array.from(flyout.querySelectorAll('.dot-flyout__item'));
    if (!items.length) return;
    const active = document.activeElement;
    const i = Math.max(0, items.indexOf(active));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[i+1] || items[0]).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (items[i-1] || items[items.length-1]).focus();
    } else if (e.key === 'Escape') {
      hide();
      dots.focus?.();
    }
  });

  // Feature detect backdrop
  (function detectBackdrop(){
    const el = document.createElement('div');
    el.style.backdropFilter = 'blur(1px)';
    const supported = !!el.style.backdropFilter || !!el.style.webkitBackdropFilter;
    if(!supported) document.documentElement.classList.add('no-backdrop');
  })();
})();




/* v1.3: backdrop clip-path sync */
(function(){
  const docEl = document.documentElement;
  const flyout = document.querySelector('.dot-flyout');
  const backdrop = document.querySelector('.flyout-backdrop');
  if(!flyout || !backdrop) return;
  function syncBackdrop(){
    const r = flyout.getBoundingClientRect();
    docEl.style.setProperty('--flyout-top', r.top + 'px');
    docEl.style.setProperty('--flyout-left', r.left + 'px');
    docEl.style.setProperty('--flyout-right', (r.right) + 'px');
    docEl.style.setProperty('--flyout-bottom', (r.bottom) + 'px');
  }
  // tie to existing position updates
  const ro = new ResizeObserver(syncBackdrop);
  ro.observe(flyout);
  window.addEventListener('resize', syncBackdrop);
  window.addEventListener('orientationchange', syncBackdrop);
  // when toggling visibility
  flyout.addEventListener('mouseenter', syncBackdrop);
  flyout.addEventListener('transitionend', syncBackdrop, true);
  // initial
  requestAnimationFrame(syncBackdrop);
})();


/* v1.3.1: backdrop box sync */
(function(){
  const flyout = document.querySelector('.dot-flyout');
  const backdrop = document.querySelector('.flyout-backdrop');
  if(!flyout || !backdrop) return;
  function syncBackdrop(){
    const r = flyout.getBoundingClientRect();
    backdrop.style.left = Math.round(r.left) + 'px';
    backdrop.style.top = Math.round(r.top) + 'px';
    backdrop.style.width = Math.round(r.width) + 'px';
    backdrop.style.height = Math.round(r.height) + 'px';
  }
  // Observe size/position changes
  const ro = new ResizeObserver(syncBackdrop);
  try { ro.observe(flyout); } catch(e) {}
  window.addEventListener('resize', syncBackdrop);
  window.addEventListener('orientationchange', syncBackdrop);
  flyout.addEventListener('mouseenter', syncBackdrop);
  // Also resync when dots repositioned if hook exists
  if (typeof window.repositionDotStatus === 'function') {
    const orig = window.repositionDotStatus;
    window.repositionDotStatus = function(){
      orig();
      syncBackdrop();
    };
  }
  requestAnimationFrame(syncBackdrop);
})();


/* v1.3.6: dynamic blur setter for Safari */
(function(){
  function setFlyoutBlur(px){
    var el = document.querySelector('.flyout-backdrop') || document.querySelector('.dot-flyout');
    if(!el) return;
    el.style.webkitBackdropFilter = 'blur(' + px + 'px) saturate(1.1)';
    el.style.backdropFilter = 'blur(' + px + 'px) saturate(1.1)';
  }
  // expose for debug
  window.setFlyoutBlur = setFlyoutBlur;
  // init default
  setFlyoutBlur(10);
})();

/* v1.4 flyout sync */
(function(){
  const flyout = document.querySelector('.dot-flyout');
  const backdrop = document.querySelector('.flyout-backdrop');
  if(!flyout || !backdrop) return;
  function syncBackdrop(){
    const r = flyout.getBoundingClientRect();
    backdrop.style.left = Math.round(r.left) + 'px';
    backdrop.style.top = Math.round(r.top) + 'px';
    backdrop.style.width = Math.round(r.width) + 'px';
    backdrop.style.height = Math.round(r.height) + 'px';
  }
  const ro = new ResizeObserver(syncBackdrop);
  try{ ro.observe(flyout); }catch(e){}
  window.addEventListener('resize', syncBackdrop);
  window.addEventListener('orientationchange', syncBackdrop);
  flyout.addEventListener('mouseenter', syncBackdrop);
  // initial
  requestAnimationFrame(syncBackdrop);
})();


/* v1.4.3: scrollspy -> toggle .is-active on current section link */
(function(){
  const flyout = document.querySelector('.dot-flyout');
  if(!flyout) return;
  const links = Array.from(flyout.querySelectorAll('a[href^="#"]'));
  if(!links.length) return;
  const map = new Map();
  links.forEach(a=>{
    try{
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const el = document.getElementById(id);
      if(el) map.set(el, a);
    }catch(e){}
  });
  if(!map.size) return;
  const setActive = (a)=>{
    links.forEach(x=>x.classList.remove('is-active'));
    if(a) a.classList.add('is-active');
  };
  const io = new IntersectionObserver((entries)=>{
    let best = null;
    let bestTop = Infinity;
    entries.forEach(e=>{
      if(e.isIntersecting){
        const top = Math.abs(e.target.getBoundingClientRect().top);
        if(top < bestTop){ bestTop = top; best = e.target; }
      }
    });
    if(best) setActive(map.get(best));
  }, { root: document.querySelector('.text-box') || null, rootMargin: '0px 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] });
  map.forEach((a, el)=> io.observe(el));
})();



// === robust mobile controller v1.7 ===
(function(){
  const mq = window.matchMedia('(max-width: 1400px)');
  const doc = document;
  const rail = doc.querySelector('.menu-rail');
  const label = doc.querySelector('.menu-vertical-label');
  let backdrops = Array.from(doc.querySelectorAll('.flyout-backdrop'));
  if (!rail || !label || backdrops.length === 0) return;

  // 1) If there are multiple backdrops, keep the first and disable others
  const mainBackdrop = backdrops[0];
  backdrops.slice(1).forEach(b => { b.remove(); });
  backdrops = [mainBackdrop];

  // 2) Add a close button inside the rail (for accessibility)
  let closer = rail.querySelector('.menu-close');
  if(!closer){
    closer = doc.createElement('button');
    closer.className = 'menu-close';
    closer.type = 'button';
    closer.setAttribute('aria-label', 'Закрыть меню');
    closer.textContent = '✕';
    rail.prepend(closer);
  }

  // 3) Styles for the close button via inline CSS appended once
  (function injectCloseCss(){
    if(doc.getElementById('menu-close-style')) return;
    const s = doc.createElement('style');
    s.id = 'menu-close-style';
    s.textContent = `.menu-close{position:absolute;top:10px;right:10px;font:inherit;border:0;background:rgba(0,0,0,.06);border-radius:10px;padding:6px 10px;cursor:pointer}`;
    doc.head.appendChild(s);
  })();

  const unlock = () => doc.body.classList.remove('menu-open');

  // 4) Kill any "fixed/slide" desktop mechanics on mobile/tablet
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

  // 5) Open/close handlers
  label.addEventListener('click', (e)=>{
    if(!mq.matches) return;
    e.preventDefault();
    doc.body.classList.add('menu-open');
  });
  mainBackdrop.addEventListener('click', unlock);
  closer.addEventListener('click', unlock);
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') unlock(); });

  // 6) On resize/orientation change: unlock & sanitize
  mq.addEventListener?.('change', () => { unlock(); sanitizeMobile(); });
  window.addEventListener('orientationchange', () => { unlock(); sanitizeMobile(); });
  window.addEventListener('resize', () => { if(mq.matches) sanitizeMobile(); });

  // 7) MutationObserver: wipe inline styles that reappear
  const mo = new MutationObserver(()=>{ if(mq.matches) sanitizeMobile(); });
  mo.observe(doc.documentElement, { attributes:true, subtree:true, attributeFilter:['style','class'] });

  // init
  sanitizeMobile();
})();


/* passive 1A */
(function(){
  const doc = document;
  const trigger = doc.querySelector('.menu-vertical-label');
  const menu = doc.getElementById('site-menu');
  const backdrop = doc.querySelector('.flyout-backdrop');
  if(!trigger || !menu || !backdrop) return;

  function isOpen(){ return doc.body.classList.contains('menu-open'); }
  function closeMenu(){
    if(!isOpen()) return;
    doc.body.classList.remove('menu-open');
    trigger.setAttribute('aria-expanded','false');
  }

  const optsPassive = {passive:true};
  window.addEventListener('scroll', ()=>{}, optsPassive);
  window.addEventListener('touchstart', ()=>{}, optsPassive);
  backdrop.onclick = ()=>{ if(isOpen()) closeMenu(); };
  window.addEventListener('orientationchange', closeMenu, optsPassive);
})();
