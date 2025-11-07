const root = document.documentElement;
const body = document.body;
const initialMode = window.__INITIAL_MODE__;
if (typeof initialMode === 'string') {
  delete window.__INITIAL_MODE__;
}
const menuRail = document.querySelector('.menu-rail');
const header = document.querySelector('.header');
const menuHandle = document.querySelector('.menu-handle');
const siteMenu = document.querySelector('.site-menu');
const backdrop = document.querySelector('.backdrop');
const dockHandle = document.querySelector('.dock-handle');
const panel = document.querySelector('.panel');
const btnNext = document.querySelector('.btn-next');
const dotsRail = document.querySelector('.dots-rail');
const textBox = document.querySelector('.text-box');
const sections = Array.from(document.querySelectorAll('.text-section'));
const menuCap = document.querySelector('.menu-rail__cap');

let currentMode = body.dataset.mode || initialMode || 'desktop';
let activeSectionId = sections[0]?.id ?? null;
let previousFocus = null;
let trapListenerAttached = false;
let observer = null;
let dotsPositionRaf = null;
let layoutMetricsRaf = null;

function parseCssNumber(value) {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : 0;
}

function updateLayoutMetrics() {
  const headerHeight = header?.offsetHeight ?? 0;
  const stackOffset = Math.max(0, headerHeight + 16);
  root.style.setProperty('--stack-top', `${stackOffset}px`);

  if (!btnNext) {
    return;
  }

  const styles = window.getComputedStyle(btnNext);
  let footprint = btnNext.offsetHeight;

  if (styles.position === 'sticky') {
    footprint += parseCssNumber(styles.bottom);
  } else {
    footprint += parseCssNumber(styles.marginBottom);
  }

  footprint = Math.max(0, Math.round(footprint));
  root.style.setProperty('--btn-next-footprint', `${footprint}px`);
}

function scheduleLayoutMetricsUpdate() {
  if (layoutMetricsRaf !== null) return;
  layoutMetricsRaf = requestAnimationFrame(() => {
    layoutMetricsRaf = null;
    updateLayoutMetrics();
  });
}

function detectMode() {
  const width = window.innerWidth || root.clientWidth;

  if (width < 1024) {
    return 'handheld';
  }

  if (width <= 1366) {
    return 'tablet-wide';
  }

  return 'desktop';
}

function updateMode() {
  const nextMode = detectMode();
  const prevMode = currentMode;
  currentMode = nextMode;
  body.dataset.mode = nextMode;

  if (prevMode !== nextMode) {
    body.classList.remove('is-slid');
    if (nextMode !== 'desktop' && body.classList.contains('menu-open')) {
      closeMenu({ focusOrigin: null });
    }
    configureDots();
  }
  lockScroll();
  scheduleLayoutMetricsUpdate();
}

function teardownObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function updateDotsPosition() {
  if (!dotsRail || !textBox) return;
  if (currentMode !== 'desktop') {
    if (dotsPositionRaf !== null) {
      cancelAnimationFrame(dotsPositionRaf);
      dotsPositionRaf = null;
    }
    root.style.removeProperty('--text-box-left');
    return;
  }
  if (dotsPositionRaf !== null) {
    cancelAnimationFrame(dotsPositionRaf);
  }
  dotsPositionRaf = requestAnimationFrame(() => {
    const rect = textBox.getBoundingClientRect();
    root.style.setProperty('--text-box-left', `${rect.left}px`);
    dotsPositionRaf = null;
  });
}

function configureDots() {
  if (!dotsRail) return;
  dotsRail.innerHTML = '';
  const shouldEnable = currentMode === 'desktop' && sections.length >= 2;
  dotsRail.hidden = !shouldEnable;
  if (!shouldEnable) {
    updateDotsPosition();
    teardownObserver();
    return;
  }
  updateDotsPosition();
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
  teardownObserver();
  if (currentMode !== 'desktop' || sections.length < 2) {
    return;
  }
  const headerHeight = header?.offsetHeight ?? 0;
  observer = new IntersectionObserver(
    () => {
      const index = getCurrentSectionIndex();
      const current = sections[index];
      if (current) {
        setActiveSection(current.id);
      }
    },
    {
      root: null,
      threshold: [0, 0.25, 0.5, 0.75, 1],
      rootMargin: `-${headerHeight}px 0px -35% 0px`,
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
  const viewportHeight = window.innerHeight || root.clientHeight;
  const headerHeight = header?.offsetHeight ?? 0;
  const availableHeight = Math.max(0, viewportHeight - headerHeight);
  const probeY = headerHeight + availableHeight * 0.35;
  sections.forEach((section, index) => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= probeY && rect.bottom >= probeY) {
      bestIndex = index;
      bestDistance = -1;
      return;
    }
    const distance = rect.top > probeY ? rect.top - probeY : probeY - rect.bottom;
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

function isElementVisible(element) {
  if (!element) return false;
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function trapFocus(event) {
  const shouldTrap = currentMode !== 'desktop' && body.classList.contains('menu-open');
  if (!shouldTrap || event.key !== 'Tab') return;

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
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (currentMode !== 'desktop') {
    siteMenu.setAttribute('role', 'dialog');
    siteMenu.setAttribute('aria-modal', 'true');
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
    if (isElementVisible(menuHandle)) {
      menuHandle.setAttribute('aria-expanded', expanded);
    } else {
      menuHandle.removeAttribute('aria-expanded');
    }
  }
  if (dockHandle) {
    if (isElementVisible(dockHandle)) {
      dockHandle.setAttribute('aria-expanded', expanded);
    } else {
      dockHandle.removeAttribute('aria-expanded');
    }
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
  window.addEventListener(
    'scroll',
    () => {
      if (currentMode !== 'desktop') return;
      const index = getCurrentSectionIndex();
      const current = sections[index];
      if (current) {
        setActiveSection(current.id);
      }
    },
    { passive: true }
  );
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
  menuRail?.addEventListener('mouseenter', () => {
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
    if (currentMode !== 'handheld') return;
    if (!body.classList.contains('menu-open')) return;
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

function initGestures() {
  // Жесты отключены для тестирования реакций по клику и hover на подписи ручки меню.
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
    if (currentMode === 'desktop') {
      updateDotsPosition();
      setupSectionObserver();
    } else {
      teardownObserver();
    }
    scheduleLayoutMetricsUpdate();
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      updateMode();
      if (currentMode !== 'desktop') {
        closeMenu({ focusOrigin: menuHandle });
        teardownObserver();
      }
      if (currentMode === 'desktop') {
        updateDotsPosition();
        setupSectionObserver();
      }
      scheduleLayoutMetricsUpdate();
    }, 100);
  });
}

init();
scheduleLayoutMetricsUpdate();
window.addEventListener('load', scheduleLayoutMetricsUpdate);
