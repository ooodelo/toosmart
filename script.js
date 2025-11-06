const root = document.documentElement;
const body = document.body;
const menuRail = document.querySelector('.menu-rail');
const menuHandle = document.querySelector('.menu-handle');
const siteMenu = document.querySelector('.site-menu');
const backdrop = document.querySelector('.backdrop');
const dockHandle = document.querySelector('.dock-handle');
const panel = document.querySelector('.panel');
const btnNext = document.querySelector('.btn-next');
const dotsRail = document.querySelector('.dots-rail');
const sections = Array.from(document.querySelectorAll('.text-section'));
const menuCap = document.querySelector('.menu-rail__cap');
const scrollElement = document.scrollingElement || document.documentElement;

let currentMode = root.dataset.mode || body.dataset.mode || 'desktop';
let activeSectionId = sections[0]?.id ?? null;
let previousFocus = null;
let trapListenerAttached = false;
let observer = null;
let swipeState = null;

function detectMode() {
  const width = window.innerWidth;
  const pointerFine = window.matchMedia('(pointer: fine)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = coarse || navigator.maxTouchPoints > 0;

  if (width >= 1440 || (width >= 1280 && pointerFine && !hasTouch)) {
    return 'desktop';
  }
  if (width >= 1024) {
    return 'tablet-wide';
  }
  return 'handheld';
}

function updateMode() {
  const nextMode = detectMode();
  const prevMode = currentMode;
  currentMode = nextMode;
  root.dataset.mode = nextMode;
  body.dataset.mode = nextMode;

  if (prevMode !== nextMode) {
    body.classList.remove('is-slid');
    if (nextMode !== 'desktop' && body.classList.contains('menu-open')) {
      closeMenu({ focusOrigin: null });
    }
    configureDots();
  }
  lockScroll();
}

function configureDots() {
  dotsRail.innerHTML = '';
  if (currentMode !== 'desktop' || sections.length < 2) {
    observer?.disconnect();
    observer = null;
    return;
  }
  sections.forEach((section) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dots-rail__dot';
    dot.setAttribute('aria-label', section.dataset.section || section.id);
    dot.addEventListener('click', () => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    dotsRail.appendChild(dot);
  });
  setupSectionObserver();
  updateActiveDot();
}

function setupSectionObserver() {
  observer?.disconnect();
  if (currentMode !== 'desktop' || sections.length < 2) {
    observer = null;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible.length > 0) {
        setActiveSection(visible[0].target.id);
      }
    },
    {
      root: null,
      threshold: [0.2, 0.5, 0.75],
      rootMargin: '-30% 0px -50% 0px',
    }
  );
  sections.forEach((section) => observer.observe(section));
}

function setActiveSection(id) {
  if (!id || id === activeSectionId) return;
  activeSectionId = id;
  updateActiveDot();
}

function updateActiveDot() {
  if (currentMode !== 'desktop') {
    return;
  }
  const dots = dotsRail.querySelectorAll('.dots-rail__dot');
  dots.forEach((dot, index) => {
    const section = sections[index];
    if (!section) return;
    const isActive = section.id === activeSectionId;
    dot.setAttribute('aria-current', isActive ? 'true' : 'false');
  });
}

function getCurrentSectionIndex() {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const probeY = window.innerHeight * 0.35;
  sections.forEach((section, index) => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= probeY && rect.bottom >= probeY) {
      bestIndex = index;
      bestDistance = -1;
      return;
    }
    const distance = Math.abs(rect.top - probeY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  );
}

function trapFocus(event) {
  if (!body.classList.contains('menu-open')) return;
  if (currentMode === 'desktop') return;
  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements(menuRail);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function attachTrap() {
  if (trapListenerAttached) return;
  document.addEventListener('keydown', trapFocus);
  trapListenerAttached = true;
}

function detachTrap() {
  if (!trapListenerAttached) return;
  document.removeEventListener('keydown', trapFocus);
  trapListenerAttached = false;
}

function openMenu({ focusOrigin = menuHandle } = {}) {
  body.classList.remove('is-slid');
  body.classList.add('menu-open');
  if (currentMode !== 'desktop') {
    siteMenu.setAttribute('role', 'dialog');
    siteMenu.setAttribute('aria-modal', 'true');
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = getFocusableElements(menuRail);
    const targetFocus = focusable.find((el) => el !== focusOrigin) || siteMenu;
    requestAnimationFrame(() => targetFocus.focus({ preventScroll: true }));
    attachTrap();
  }
  updateAriaExpanded(true);
  lockScroll();
}

function closeMenu({ focusOrigin = menuHandle } = {}) {
  body.classList.remove('menu-open');
  body.classList.remove('is-slid');
  siteMenu.removeAttribute('role');
  siteMenu.removeAttribute('aria-modal');
  detachTrap();
  updateAriaExpanded(false);
  lockScroll();
  if (previousFocus) {
    previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  } else if (focusOrigin && focusOrigin instanceof HTMLElement) {
    focusOrigin.focus({ preventScroll: true });
  }
}

function updateAriaExpanded(isOpen) {
  const expanded = String(isOpen);
  if (menuHandle) {
    menuHandle.setAttribute('aria-expanded', expanded);
  }
  if (dockHandle) {
    dockHandle.setAttribute('aria-expanded', expanded);
  }
}

function toggleMenu(origin) {
  if (body.classList.contains('menu-open')) {
    closeMenu({ focusOrigin: origin });
  } else {
    openMenu({ focusOrigin: origin });
  }
}

function lockScroll() {
  if (currentMode === 'handheld' && body.classList.contains('menu-open')) {
    body.dataset.lock = 'scroll';
    root.dataset.lock = 'scroll';
  } else {
    delete body.dataset.lock;
    delete root.dataset.lock;
  }
}

function initDots() {
  configureDots();
  window.addEventListener('scroll', () => {
    if (currentMode !== 'desktop') return;
    const sorted = sections
      .map((section) => ({
        id: section.id,
        rect: section.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.top < window.innerHeight * 0.6 && item.rect.bottom > window.innerHeight * 0.3)
      .sort((a, b) => a.rect.top - b.rect.top);
    if (sorted.length > 0) {
      setActiveSection(sorted[0].id);
    }
  });
}

function handleNext() {
  const currentIndex = getCurrentSectionIndex();
  const nextSection = sections[currentIndex + 1] || sections[0];
  activeSectionId = nextSection.id;
  updateActiveDot();
  nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initMenuInteractions() {
  menuHandle?.addEventListener('click', () => toggleMenu(menuHandle));
  menuHandle?.addEventListener('mouseenter', () => {
    if (currentMode !== 'desktop') return;
    body.classList.add('is-slid');
  });
  menuRail?.addEventListener('mouseleave', () => {
    if (currentMode !== 'desktop') return;
    body.classList.remove('is-slid');
  });
  menuRail?.addEventListener('focusin', () => {
    if (currentMode !== 'desktop') return;
    body.classList.add('is-slid');
  });
  menuRail?.addEventListener('focusout', (event) => {
    if (currentMode !== 'desktop') return;
    if (body.classList.contains('menu-open')) return;
    const next = event.relatedTarget;
    if (next && menuRail.contains(next)) return;
    body.classList.remove('is-slid');
  });
  panel?.addEventListener('mouseenter', () => {
    if (currentMode !== 'desktop') return;
    body.classList.remove('is-slid');
  });
  panel?.addEventListener('focusin', () => {
    if (currentMode !== 'desktop') return;
    body.classList.remove('is-slid');
  });
  dockHandle?.addEventListener('click', () => {
    if (currentMode !== 'handheld') return;
    toggleMenu(dockHandle);
  });
  backdrop?.addEventListener('click', () => {
    if (!body.classList.contains('menu-open')) return;
    const origin = currentMode === 'handheld' ? dockHandle : menuHandle;
    closeMenu({ focusOrigin: origin });
  });
  menuCap?.addEventListener('click', () => {
    if (currentMode !== 'handheld' || !body.classList.contains('menu-open')) return;
    closeMenu({ focusOrigin: dockHandle });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && body.classList.contains('menu-open')) {
      event.preventDefault();
      const origin = currentMode === 'handheld' ? dockHandle : menuHandle;
      closeMenu({ focusOrigin: origin });
    }
  });
}

function findTouch(event) {
  if (!swipeState) return null;
  const { identifier } = swipeState;
  for (const touch of event.changedTouches) {
    if (touch.identifier === identifier) {
      return touch;
    }
  }
  return null;
}

function initGestures() {
  function resetSwipe() {
    swipeState = null;
  }

  function recordSwipe(type, touch, extra = {}) {
    swipeState = {
      type,
      startX: touch.clientX,
      startY: touch.clientY,
      identifier: touch.identifier,
      prevented: false,
      ...extra,
    };
  }

  function shouldPrevent(state) {
    if (!state) return false;
    if (state.type === 'tablet-open') {
      return state.dx > 16 && Math.abs(state.dy) < 60;
    }
    if (state.type === 'dock-open') {
      return state.dy < -24 && Math.abs(state.dx) < 80;
    }
    if (state.type === 'menu-close') {
      if (!state.capZone) return false;
      if (state.fromCap && Math.abs(state.dy) < 20 && Math.abs(state.dx) < 20) {
        return false;
      }
      return state.dy > 16;
    }
    return false;
  }

  function onTouchStart(event) {
    const touch = event.changedTouches[0];
    if (!touch) return;

    if (currentMode === 'tablet-wide' && touch.clientX <= 24 && !body.classList.contains('menu-open')) {
      if (scrollElement.scrollTop > 0) {
        resetSwipe();
        return;
      }
      recordSwipe('tablet-open', touch);
      return;
    }

    if (currentMode !== 'handheld') {
      resetSwipe();
      return;
    }

    if (touch.target.closest('.dock')) {
      recordSwipe('dock-open', touch);
      return;
    }

    if (!body.classList.contains('menu-open') || !menuRail?.contains(touch.target)) {
      resetSwipe();
      return;
    }

    const railRect = menuRail.getBoundingClientRect();
    const offsetY = touch.clientY - railRect.top;
    const capRect = menuCap?.getBoundingClientRect();
    const capHeight = capRect ? Math.max(capRect.height, 48) : 64;
    const inCapZone = offsetY <= capHeight;
    const fromCap = !!capRect && touch.clientY >= capRect.top && touch.clientY <= capRect.bottom;

    if (!inCapZone) {
      resetSwipe();
      return;
    }

    recordSwipe('menu-close', touch, { capZone: inCapZone, fromCap });
  }

  function onTouchMove(event) {
    const touch = findTouch(event);
    if (!touch || !swipeState) return;
    swipeState.dx = touch.clientX - swipeState.startX;
    swipeState.dy = touch.clientY - swipeState.startY;
    if (!swipeState.prevented && shouldPrevent(swipeState)) {
      event.preventDefault();
      swipeState.prevented = true;
    }
  }

  function onTouchEnd(event) {
    const touch = findTouch(event);
    if (!touch || !swipeState) {
      resetSwipe();
      return;
    }
    const { type, dx = 0, dy = 0, fromCap, capZone } = swipeState;
    if (type === 'tablet-open' && dx >= 28 && Math.abs(dy) < 80) {
      event.preventDefault();
      openMenu({ focusOrigin: menuHandle });
    } else if (type === 'dock-open' && dy <= -40 && Math.abs(dx) < 80) {
      event.preventDefault();
      openMenu({ focusOrigin: dockHandle });
    } else if (type === 'menu-close') {
      if (capZone && fromCap && Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        event.preventDefault();
        closeMenu({ focusOrigin: dockHandle });
      } else if (dy >= 50) {
        event.preventDefault();
        closeMenu({ focusOrigin: dockHandle });
      }
    }
    resetSwipe();
  }

  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });
  window.addEventListener('touchcancel', resetSwipe, { passive: true });
}

function initMenuLinks() {
  const links = menuRail.querySelectorAll('a[href^="#"]');
  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (currentMode !== 'desktop') {
        closeMenu({ focusOrigin: menuHandle });
      }
    });
  });
}

function init() {
  updateMode();
  initDots();
  initMenuInteractions();
  initGestures();
  initMenuLinks();
  btnNext?.addEventListener('click', handleNext);
  window.addEventListener('resize', () => {
    const prevMode = currentMode;
    updateMode();
    if (currentMode !== prevMode && currentMode !== 'desktop') {
      closeMenu({ focusOrigin: menuHandle });
    }
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      updateMode();
      if (currentMode !== 'desktop') {
        closeMenu({ focusOrigin: menuHandle });
      }
    }, 100);
  });
}

init();
