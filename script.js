/**
 * АРХИТЕКТУРА: Разделение режимов верстки и типов ввода
 *
 * 1. data-mode (Layout Mode) - режим верстки, зависит от ширины окна и touch-capability:
 *    - 'mobile': < 768px (телефоны)
 *    - 'tablet': 768-899px (планшеты)
 *    - 'desktop': 900-1279px (ноутбуки)
 *    - 'desktop-wide': >= 1280px (большие мониторы)
 *
 *    Правило: Touch-устройства используют упрощенную схему (mobile/tablet/desktop), без desktop-wide.
 *
 * 2. data-input (Input Capabilities) - тип ввода, определяет интерактивность:
 *    - 'touch': устройства с сенсорным вводом (свайпы, клики)
 *    - 'pointer': устройства с мышью (hover-эффекты)
 *
 *    Используется ТОЛЬКО для rail menu интерактивности:
 *    - mobile + touch: меню снизу, открывается тапом
 *    - tablet + touch: меню overlay, открывается тапом
 *    - desktop + touch/pointer: меню overlay, открывается тапом/hover
 *
 * Примеры:
 *    iPhone 15 (393px, touch) → mode=mobile, input=touch
 *    iPad Pro портрет (768px, touch) → mode=tablet, input=touch
 *    iPad Pro ландшафт (1024px, touch) → mode=desktop, input=touch
 *    Laptop 13" (1280px, pointer) → mode=desktop-wide, input=pointer
 *    Desktop 27" (1920px, pointer) → mode=desktop-wide, input=pointer
 *    Dev Tools iPhone (375px, pointer) → mode=mobile, input=pointer
 */

console.log('🚀 script.js loading...');

const ModeUtils = window.ModeUtils;

if (!ModeUtils) {
  throw new Error('ModeUtils module is required for responsive mode detection.');
}

const root = document.documentElement;
const body = document.body;
const initialMode = window.__INITIAL_MODE__;
if (typeof initialMode === 'string') {
  delete window.__INITIAL_MODE__;
}
const initialInput = window.__INITIAL_INPUT__;
if (typeof initialInput === 'string') {
  delete window.__INITIAL_INPUT__;
}
const menuRail = document.querySelector('.menu-rail');
const header = document.querySelector('.header');
const menuHandle = document.querySelector('.menu-handle');
const siteMenu = document.querySelector('.site-menu');
const backdrop = document.querySelector('.backdrop');
const dockHandle = document.querySelector('.dock-handle');
const panel = document.querySelector('.panel');
const dotsRail = document.querySelector('.dots-rail');
const dotFlyout = document.querySelector('.dot-flyout');
const textBox = document.querySelector('.text-box');
const sections = Array.from(document.querySelectorAll('.text-section'));
const menuCap = document.querySelector('.menu-rail__cap');

let currentMode = body.dataset.mode || initialMode || 'desktop';
let currentInput = body.dataset.input || initialInput || 'pointer';

if (!body.dataset.input && typeof initialInput === 'string') {
  body.dataset.input = initialInput;
}
let activeSectionId = sections[0]?.id ?? null;
let previousFocus = null;
let trapDisposer = null;
let observer = null;
let edgeGestureHandler = null;
let flyoutHideTimeoutCancel = null;
let flyoutListenersAttached = false;
let flyoutHandlers = {
  showFlyout: null,
  hideFlyout: null,
  handleFlyoutClick: null,
  handleFlyoutKeyboard: null
};
let flyoutDisposers = [];
let restoreSetActiveSection = null;
let menuSwipeDisposers = [];
let edgeGestureDisposer = null;

function isMenuAvailable() {
  return Boolean(menuRail || siteMenu);
}

// Debug mode: установите в true для вывода информации о режимах в консоль
// Включите в Safari Dev Tools: window.DEBUG_MODE_DETECTION = true
const DEBUG_MODE_DETECTION = window.DEBUG_MODE_DETECTION || false;

// Debug: toggle flyout diagnostics via window.DEBUG_FLYOUT (defaults to false)
const DEBUG_FLYOUT = typeof window.DEBUG_FLYOUT === 'boolean' ? window.DEBUG_FLYOUT : false;
const flyoutLogger = (typeof window.DEBUG_FLYOUT_LOGGER === 'object' && window.DEBUG_FLYOUT_LOGGER)
  ? window.DEBUG_FLYOUT_LOGGER
  : console;

function logFlyout(...args) {
  if (!DEBUG_FLYOUT) return;
  if (typeof flyoutLogger?.log === 'function') {
    flyoutLogger.log(...args);
  }
}
let layoutMetricsRaf = null;

const APP_GLOBAL_KEY = '__TOOSMART_APP__';

function createLifecycleRegistry(label) {
  const records = [];

  function track(disposer, meta = {}) {
    if (typeof disposer !== 'function') {
      return () => {};
    }

    const record = {
      meta: { label, ...meta },
      active: true,
      dispose: null,
    };

    record.dispose = () => {
      if (!record.active) return;
      record.active = false;
      try {
        disposer();
      } catch (error) {
        console.error('[Lifecycle] Failed to dispose resource', {
          label,
          meta: record.meta,
          error,
        });
      }
    };

    records.push(record);
    return () => record.dispose();
  }

  function disposeAll() {
    for (let i = records.length - 1; i >= 0; i -= 1) {
      records[i].dispose();
    }
  }

  function report() {
    return records.map((record) => ({
      ...record.meta,
      active: record.active,
    }));
  }

  return {
    track,
    disposeAll,
    report,
    label,
  };
}

let activeLifecycle = null;

function getActiveLifecycle() {
  return activeLifecycle;
}

function setActiveLifecycle(registry) {
  activeLifecycle = registry;
}

function describeTarget(target) {
  if (!target) return 'unknown';
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (target === document.documentElement) return 'documentElement';
  if (target === document.body) return 'body';
  if (target instanceof Element) {
    if (target.id) return `#${target.id}`;
    if (target.classList && target.classList.length) {
      return `${target.tagName.toLowerCase()}.${Array.from(target.classList).join('.')}`;
    }
    return target.tagName ? target.tagName.toLowerCase() : 'element';
  }
  return String(target);
}

function normalizeListenerOptions(options) {
  if (options === undefined) return undefined;
  if (options === null) return null;
  if (typeof options === 'boolean') {
    return { capture: options };
  }
  if (typeof options === 'object') {
    const normalized = {};
    if ('capture' in options) normalized.capture = !!options.capture;
    if ('once' in options) normalized.once = !!options.once;
    if ('passive' in options) normalized.passive = !!options.passive;
    if ('signal' in options) normalized.signal = true;
    return normalized;
  }
  return options;
}

function registerLifecycleDisposer(disposer, meta) {
  const lifecycle = getActiveLifecycle();
  if (!lifecycle) {
    return () => {
      try {
        disposer?.();
      } catch (error) {
        console.error('[Lifecycle] Disposer failed outside lifecycle', { meta, error });
      }
    };
  }

  return lifecycle.track(() => {
    try {
      disposer?.();
    } catch (error) {
      console.error('[Lifecycle] Disposer failed', { meta, error });
    }
  }, meta);
}

function trackEvent(target, type, handler, options, meta = {}) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }

  let controller = null;
  let listenerOptions = options;
  let added = false;

  if (typeof AbortController === 'function') {
    controller = new AbortController();
    listenerOptions = mergeListenerOptionsWithSignal(options, controller.signal);
    try {
      target.addEventListener(type, handler, listenerOptions);
      added = true;
    } catch (error) {
      // Safari < 13 и другие старые движки могут не поддерживать signal
      controller = null;
      listenerOptions = options;
    }
  }

  if (!added) {
    target.addEventListener(type, handler, options);
  }

  return registerLifecycleDisposer(() => {
    if (controller) {
      controller.abort();
      controller = null;
      return;
    }
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener(type, handler, options);
    }
  }, {
    kind: 'event',
    event: type,
    target: describeTarget(target),
    options: normalizeListenerOptions(listenerOptions ?? options),
    ...meta,
  });
}

function mergeListenerOptionsWithSignal(options, signal) {
  if (!signal) return options;
  if (options === undefined) {
    return { signal };
  }
  if (typeof options === 'boolean') {
    return { capture: options, signal };
  }
  if (options && typeof options === 'object') {
    if ('signal' in options) {
      return options;
    }
    return { ...options, signal };
  }
  return options;
}

function trackMediaQuery(mql, handler, meta = {}) {
  if (!mql || typeof handler !== 'function') {
    return () => {};
  }

  let unsubscribe = null;
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    unsubscribe = () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handler);
      }
    };
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(handler);
    unsubscribe = () => {
      if (typeof mql.removeListener === 'function') {
        mql.removeListener(handler);
      }
    };
  }

  if (!unsubscribe) {
    return () => {};
  }

  return registerLifecycleDisposer(() => {
    unsubscribe();
    unsubscribe = null;
  }, {
    kind: 'media-query',
    target: '(media query)',
    ...meta,
  });
}

function trackTimeout(callback, delay, meta = {}) {
  let cleared = false;
  const wrapped = () => {
    if (!cleared) {
      cleared = true;
      callback();
    }
  };
  const id = window.setTimeout(wrapped, delay);

  return registerLifecycleDisposer(() => {
    if (!cleared) {
      cleared = true;
      window.clearTimeout(id);
    }
  }, {
    kind: 'timeout',
    delay,
    ...meta,
  });
}

function trackInterval(callback, delay, meta = {}) {
  const id = window.setInterval(callback, delay);
  let cleared = false;

  return registerLifecycleDisposer(() => {
    if (!cleared) {
      cleared = true;
      window.clearInterval(id);
    }
  }, {
    kind: 'interval',
    delay,
    ...meta,
  });
}

function trackObserver(observer, meta = {}) {
  if (!observer || typeof observer.disconnect !== 'function') {
    return () => {};
  }

  return registerLifecycleDisposer(() => {
    observer.disconnect();
  }, {
    kind: 'observer',
    ...meta,
  });
}


function parseCssNumber(value) {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : 0;
}

function detectInput() {
  const result = ModeUtils.detectInput(window);

  if (window.DEBUG_MODE_DETECTION) {
    console.log('[DEBUG] detectInput():', {
      result,
    });
  }

  return result;
}

function detectMode(inputType) {
  const sources = ModeUtils.getWidthSources(window, root);
  const result = ModeUtils.detectMode(window, root, inputType);

  if (window.DEBUG_MODE_DETECTION) {
    let selectedSource = null;
    if (Array.isArray(sources)) {
      for (const entry of sources) {
        if (entry && typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value > 0) {
          selectedSource = entry;
          break;
        }
      }
    }

    const debugPayload = {
      inputType,
      result,
    };

    if (selectedSource) {
      debugPayload.width = selectedSource.value;
      debugPayload.widthSource = selectedSource.source;
    }

    console.log('[DEBUG] detectMode():', debugPayload);
  }

  return result;
}

function updateLayoutMetrics() {
  const headerHeight = header?.offsetHeight ?? 0;
  const stackOffset = Math.max(0, headerHeight + 16);
  root.style.setProperty('--stack-top', `${stackOffset}px`);
  const scrollMargin = Math.max(0, headerHeight + 24);
  root.style.setProperty('--section-scroll-margin', `${scrollMargin}px`);

  // Вычисление footprint для Progress Widget
  const pwRoot = document.querySelector('#pw-root');
  if (!pwRoot) {
    return;
  }

  const styles = window.getComputedStyle(pwRoot);
  let footprint = pwRoot.offsetHeight;

  if (styles.position === 'sticky') {
    footprint += parseCssNumber(styles.bottom);
  } else {
    footprint += parseCssNumber(styles.marginBottom);
  }

  footprint = Math.max(0, Math.round(footprint));
  root.style.setProperty('--pw-footprint', `${footprint}px`);
}

function scheduleLayoutMetricsUpdate() {
  if (layoutMetricsRaf !== null) return;
  layoutMetricsRaf = requestAnimationFrame(() => {
    layoutMetricsRaf = null;
    updateLayoutMetrics();
  });
}

/**
 * Обновляет режим верстки (data-mode) и тип ввода (data-input)
 */
function updateMode() {
  const nextInput = detectInput();
  const nextMode = detectMode(nextInput);
  const prevMode = currentMode;
  const prevInput = currentInput;

  currentMode = nextMode;
  currentInput = nextInput;
  body.dataset.mode = nextMode;
  body.dataset.input = nextInput;

  if (window.DEBUG_MODE_DETECTION) {
    if (prevMode !== nextMode || prevInput !== nextInput) {
      console.log('[MODE CHANGE] 🔄', {
        mode: { from: prevMode, to: nextMode },
        input: { from: prevInput, to: nextInput },
        viewport: {
          visualViewportWidth: window.visualViewport?.width,
          rootClientWidth: root?.clientWidth,
          innerWidth: window.innerWidth,
          outerWidth: window.outerWidth,
          screenWidth: window.screen?.width,
        },
      });
    } else {
      console.log('[MODE UPDATE] ✓', {
        mode: currentMode,
        input: currentInput,
        viewport: {
          visualViewportWidth: window.visualViewport?.width,
          rootClientWidth: root?.clientWidth,
          innerWidth: window.innerWidth,
        },
      });
    }
  }

  if (prevMode !== nextMode) {
    // Полный сброс всех состояний при смене режима
    body.classList.remove('is-slid');
    body.classList.remove('menu-open');

    // Сброс атрибутов меню
    if (siteMenu) {
      siteMenu.removeAttribute('role');
      siteMenu.removeAttribute('aria-modal');
    }

    // Отключение trap
    detachTrap();

    // Обновление aria-expanded для всех handles
    updateAriaExpanded(false);

    // Восстановление фокуса если был сохранен
    if (previousFocus && document.body.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
      previousFocus = null;
    }

    configureDots();
    initDotsFlyout(); // Обновляем flyout при смене режима

    // Управление edge-gesture lifecycle
    detachEdgeGesture();
    attachEdgeGesture();

    // Принудительный reflow для применения изменений
    void body.offsetHeight;
  }

  lockScroll();
  scheduleLayoutMetricsUpdate();
  // updateRailClosedWidth() больше не нужна - --rail-closed вычисляется через CSS calc()
}

function teardownObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // Отменяем все pending RAF для предотвращения утечек памяти
  if (layoutMetricsRaf !== null) {
    cancelAnimationFrame(layoutMetricsRaf);
    layoutMetricsRaf = null;
  }
}

function configureDots() {
  if (!dotsRail) return;
  dotsRail.innerHTML = '';
  const shouldEnable = (currentMode === 'desktop' || currentMode === 'desktop-wide') && sections.length >= 2;
  dotsRail.hidden = !shouldEnable;
  if (!shouldEnable) {
    teardownObserver();
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
  teardownObserver();

  // Проверка поддержки IntersectionObserver
  if (!('IntersectionObserver' in window)) {
    console.warn('IntersectionObserver not supported, dots navigation may not update automatically');
    return;
  }

  if ((currentMode !== 'desktop' && currentMode !== 'desktop-wide') || sections.length < 2) {
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
  if (currentMode !== 'desktop' && currentMode !== 'desktop-wide') {
    return;
  }
  if (!dotsRail) return;
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
  if (!container) return [];
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
  if (trapDisposer) return;
  trapDisposer = trackEvent(document, 'keydown', trapFocus, undefined, {
    module: 'menu.focusTrap',
  });
}

function detachTrap() {
  if (typeof trapDisposer === 'function') {
    trapDisposer();
    trapDisposer = null;
  }
}

function openMenu({ focusOrigin = menuHandle } = {}) {
  if (!isMenuAvailable()) {
    return false;
  }

  // В mobile/tablet режимах - показываем header (удаляем data-scroll) ПЕРЕД добавлением menu-open
  // Это критично для предотвращения мигания header
  if (currentMode === 'mobile' || currentMode === 'tablet') {
    body.removeAttribute('data-scroll');
  }

  body.classList.remove('is-slid');
  body.classList.add('menu-open');

  // Форсированное удаление data-scroll ПОСЛЕ добавления menu-open (двойная защита)
  if (currentMode === 'mobile' || currentMode === 'tablet') {
    requestAnimationFrame(() => {
      body.removeAttribute('data-scroll');
    });
  }

  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (currentMode !== 'desktop') {
    if (siteMenu) {
      siteMenu.setAttribute('role', 'dialog');
      siteMenu.setAttribute('aria-modal', 'true');
    }
    const focusable = getFocusableElements(menuRail);
    let targetFocus = focusable.find((el) => el !== focusOrigin);
    if (!targetFocus && siteMenu instanceof HTMLElement) {
      targetFocus = siteMenu;
    }
    if (targetFocus && typeof targetFocus.focus === 'function') {
      requestAnimationFrame(() => targetFocus.focus({ preventScroll: true }));
    }
    attachTrap();
  }
  updateAriaExpanded(true);
  lockScroll();
  return true;
}

function closeMenu({ focusOrigin = menuHandle } = {}) {
  if (!isMenuAvailable()) {
    return false;
  }

  body.classList.remove('menu-open');
  body.classList.remove('is-slid');
  if (siteMenu) {
    siteMenu.removeAttribute('role');
    siteMenu.removeAttribute('aria-modal');
  }
  detachTrap();
  updateAriaExpanded(false);
  lockScroll();
  if (previousFocus) {
    previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  } else if (focusOrigin && focusOrigin instanceof HTMLElement) {
    focusOrigin.focus({ preventScroll: true });
  }
  return true;
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
  if (!isMenuAvailable()) {
    return false;
  }

  if (body.classList.contains('menu-open')) {
    return closeMenu({ focusOrigin: origin });
  } else {
    return openMenu({ focusOrigin: origin });
  }
}

function lockScroll() {
  const shouldLock = currentMode !== 'desktop' && body.classList.contains('menu-open');
  if (shouldLock) {
    body.dataset.lock = 'scroll';
    root.dataset.lock = 'scroll';
  } else {
    delete body.dataset.lock;
    delete root.dataset.lock;
  }
}

function initDots() {
  configureDots();
  // IntersectionObserver уже обрабатывает активную секцию, scroll handler не нужен
}

/**
 * Smooth scroll с fallback для старых браузеров
 * @param {HTMLElement} element - элемент для прокрутки
 */
function smoothScrollTo(element) {
  if (!element) return;

  // Проверка нативной поддержки smooth scroll
  if ('scrollBehavior' in document.documentElement.style) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // Fallback: плавная анимация через requestAnimationFrame
  const targetPosition = element.getBoundingClientRect().top + window.pageYOffset;
  const startPosition = window.pageYOffset;
  const distance = targetPosition - startPosition;
  const duration = 600; // ms
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);

    // Easing function (ease-in-out)
    const ease = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    window.scrollTo(0, startPosition + distance * ease);

    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    }
  }

  requestAnimationFrame(animation);
}

/**
 * Безопасно обновляет hash в адресной строке, не теряя историю
 * @param {string} hash
 */
function updateLocationHash(hash) {
  if (typeof hash !== 'string') return;
  const trimmed = hash.trim();
  if (!trimmed || trimmed === '#') return;

  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (window.location.hash === normalized) {
    // Совпадает с текущим hash — дополнительная запись в историю не нужна
    return;
  }

  try {
    if (typeof history.pushState === 'function') {
      history.pushState(null, '', normalized);
      return;
    }
  } catch (error) {
    console.warn('[MenuLinks] Failed to pushState for hash update', error);
  }

  // Фолбэк для старых браузеров
  window.location.hash = normalized;
}

/**
 * Удаление event listeners для flyout
 */
function detachFlyoutListeners() {
  if (flyoutDisposers.length === 0) {
    return;
  }

  for (const dispose of flyoutDisposers) {
    try {
      dispose();
    } catch (error) {
      console.error('[FLYOUT] Failed to dispose listener', error);
    }
  }
  flyoutDisposers = [];
  flyoutListenersAttached = false;
  if (typeof flyoutHideTimeoutCancel === 'function') {
    flyoutHideTimeoutCancel();
    flyoutHideTimeoutCancel = null;
  }
}

/**
 * Инициализация flyout меню для navigation dots
 */
function initDotsFlyout() {
  logFlyout('[FLYOUT] initDotsFlyout START', {
    dotsRail: !!dotsRail,
    dotFlyout: !!dotFlyout,
    currentMode,
    sectionsLength: sections.length
  });

  if (!dotsRail || !dotFlyout) {
    console.error('[FLYOUT] ERROR: dotsRail or dotFlyout not found!', {
      dotsRail: !!dotsRail,
      dotFlyout: !!dotFlyout
    });
    return;
  }

  // Flyout показывается только в desktop/desktop-wide
  const shouldEnable = (currentMode === 'desktop' || currentMode === 'desktop-wide') && sections.length >= 2;

  logFlyout('[FLYOUT] Should enable?', {
    currentMode,
    shouldEnable,
    sectionsCount: sections.length,
    isDesktopOrWide: (currentMode === 'desktop' || currentMode === 'desktop-wide'),
    hasEnoughSections: sections.length >= 2
  });

  if (!shouldEnable) {
    logFlyout('[FLYOUT] Disabled - hiding');
    dotFlyout.setAttribute('hidden', '');
    detachFlyoutListeners();
    return;
  }

  // Построение списка разделов
  function buildFlyoutMenu() {
    dotFlyout.innerHTML = '';

    sections.forEach((section, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dot-flyout__item';
      btn.dataset.index = String(index);
      btn.dataset.sectionId = section.id;

      // Текст из data-section или h2
      const sectionTitle = section.dataset.section ||
                          section.querySelector('h2')?.textContent ||
                          `Раздел ${index + 1}`;
      btn.textContent = sectionTitle.trim();
      btn.setAttribute('aria-controls', section.id);

      dotFlyout.appendChild(btn);
    });

    logFlyout('[FLYOUT] Built menu with', sections.length, 'items');
  }

  // Показ flyout с задержкой при закрытии
  function showFlyout() {
    logFlyout('[FLYOUT] ⭐ showFlyout called!');
    if (typeof flyoutHideTimeoutCancel === 'function') {
      flyoutHideTimeoutCancel();
      flyoutHideTimeoutCancel = null;
    }
    dotFlyout.removeAttribute('hidden');
    logFlyout('[FLYOUT] hidden attribute removed, current:', dotFlyout.getAttribute('hidden'));
  }

  function hideFlyout() {
    logFlyout('[FLYOUT] hideFlyout called');
    if (typeof flyoutHideTimeoutCancel === 'function') {
      flyoutHideTimeoutCancel();
      flyoutHideTimeoutCancel = null;
    }
    flyoutHideTimeoutCancel = trackTimeout(() => {
      dotFlyout.setAttribute('hidden', '');
      flyoutHideTimeoutCancel = null;
      logFlyout('[FLYOUT] hidden attribute set');
    }, 120, { module: 'dotsFlyout', detail: 'hide delay' }); // Задержка 120ms как в templates
  }

  // Клик на элемент flyout → scroll к разделу
  function handleFlyoutClick(e) {
    const btn = e.target.closest('.dot-flyout__item');
    if (!btn) return;

    const sectionId = btn.dataset.sectionId;
    const section = document.getElementById(sectionId);

    if (section) {
      smoothScrollTo(section);
      // Обновляем активную секцию
      setActiveSection(sectionId);
    }
  }

  // Keyboard navigation в flyout
  function handleFlyoutKeyboard(e) {
    if (dotFlyout.hasAttribute('hidden')) return;

    const items = Array.from(dotFlyout.querySelectorAll('.dot-flyout__item'));
    if (items.length === 0) return;

    const activeElement = document.activeElement;
    const currentIndex = items.indexOf(activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideFlyout();
      // Возвращаем фокус на dots-rail
      if (dotsRail) {
        const firstDot = dotsRail.querySelector('.dots-rail__dot');
        if (firstDot) firstDot.focus();
      }
    }
  }

  // Подсветка активного элемента в flyout
  function updateFlyoutActiveItem() {
    if (dotFlyout.hasAttribute('hidden')) return;

    const items = dotFlyout.querySelectorAll('.dot-flyout__item');
    items.forEach(item => {
      const isActive = item.dataset.sectionId === activeSectionId;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  }

  // Удаляем старые listeners перед добавлением новых
  detachFlyoutListeners();

  // Построение меню
  buildFlyoutMenu();

  // Сохраняем ссылки на функции
  flyoutHandlers.showFlyout = showFlyout;
  flyoutHandlers.hideFlyout = hideFlyout;
  flyoutHandlers.handleFlyoutClick = handleFlyoutClick;
  flyoutHandlers.handleFlyoutKeyboard = handleFlyoutKeyboard;

  // Hover на dots-rail показывает flyout
  flyoutDisposers.push(trackEvent(dotsRail, 'mouseenter', showFlyout, undefined, {
    module: 'dotsFlyout',
    target: describeTarget(dotsRail),
  }));
  flyoutDisposers.push(trackEvent(dotsRail, 'mouseleave', hideFlyout, undefined, {
    module: 'dotsFlyout',
    target: describeTarget(dotsRail),
  }));

  // Hover на flyout предотвращает закрытие
  flyoutDisposers.push(trackEvent(dotFlyout, 'mouseenter', showFlyout, undefined, {
    module: 'dotsFlyout',
    target: describeTarget(dotFlyout),
  }));
  flyoutDisposers.push(trackEvent(dotFlyout, 'mouseleave', hideFlyout, undefined, {
    module: 'dotsFlyout',
    target: describeTarget(dotFlyout),
  }));

  // Клик на элементы flyout
  flyoutDisposers.push(trackEvent(dotFlyout, 'click', handleFlyoutClick, undefined, {
    module: 'dotsFlyout',
    target: describeTarget(dotFlyout),
  }));

  // Keyboard navigation
  flyoutDisposers.push(trackEvent(document, 'keydown', handleFlyoutKeyboard, undefined, {
    module: 'dotsFlyout',
    target: 'document',
  }));

  flyoutListenersAttached = true;

  logFlyout('[FLYOUT] ✅ Event listeners attached successfully!');
  logFlyout('[FLYOUT] Try hovering over dots now...');

  // Обновление активного элемента при смене секции
  if (restoreSetActiveSection) {
    restoreSetActiveSection();
    restoreSetActiveSection = null;
  }

  const previousGlobalSetActive = typeof window.setActiveSection === 'function'
    ? window.setActiveSection
    : null;
  const baseSetActive = previousGlobalSetActive || setActiveSection;

  window.setActiveSection = function(id) {
    if (typeof baseSetActive === 'function') {
      baseSetActive(id);
    }
    updateFlyoutActiveItem();
  };

  restoreSetActiveSection = () => {
    if (previousGlobalSetActive) {
      window.setActiveSection = previousGlobalSetActive;
    } else {
      delete window.setActiveSection;
    }
  };

  registerLifecycleDisposer(() => {
    if (restoreSetActiveSection) {
      restoreSetActiveSection();
      restoreSetActiveSection = null;
    }
  }, { module: 'dotsFlyout', kind: 'global', detail: 'restore setActiveSection bridge' });

  // Первоначальное обновление
  updateFlyoutActiveItem();

  registerLifecycleDisposer(() => {
    detachFlyoutListeners();
    if (dotFlyout) {
      dotFlyout.setAttribute('hidden', '');
    }
  }, { module: 'dotsFlyout', kind: 'cleanup' });
}

/**
 * Feature detection для backdrop-filter
 * Добавляет класс 'no-backdrop-filter' если не поддерживается
 */
function detectBackdropFilter() {
  const testEl = document.createElement('div');
  testEl.style.cssText = 'backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px);';
  const supported = !!testEl.style.backdropFilter || !!testEl.style.webkitBackdropFilter;

  if (!supported) {
    root.classList.add('no-backdrop-filter');
    if (DEBUG_MODE_DETECTION) {
      console.log('[FEATURE] backdrop-filter not supported, using fallback');
    }
  } else if (DEBUG_MODE_DETECTION) {
    console.log('[FEATURE] backdrop-filter supported ✓');
  }

  return supported;
}

/**
 * Helper: обновляет режим и синхронизирует observer с layout
 */
function handleModeUpdate() {
  const prevMode = currentMode;
  updateMode();

  if (prevMode !== currentMode) {
    if (currentMode === 'desktop' || currentMode === 'desktop-wide') {
      setupSectionObserver();
      initDotsFlyout(); // Пересоздаем flyout при переходе в desktop
    } else {
      teardownObserver();
      // Скрываем flyout в tablet/mobile
      if (dotFlyout) {
        dotFlyout.setAttribute('hidden', '');
      }
    }
  }

  scheduleLayoutMetricsUpdate();
}

function initMenuInteractions() {
  if (menuHandle) {
    trackEvent(menuHandle, 'click', () => toggleMenu(menuHandle), undefined, {
      module: 'menu.interactions',
    });
  }

  if (menuRail) {
    trackEvent(menuRail, 'mouseenter', () => {
      if (currentInput !== 'pointer') return;
      body.classList.add('is-slid');
    }, undefined, { module: 'menu.interactions', target: describeTarget(menuRail) });

    trackEvent(menuRail, 'mouseleave', () => {
      if (currentInput !== 'pointer') return;
      body.classList.remove('is-slid');
    }, undefined, { module: 'menu.interactions', target: describeTarget(menuRail) });

    trackEvent(menuRail, 'focusin', () => {
      if (currentInput !== 'pointer') return;
      body.classList.add('is-slid');
    }, undefined, { module: 'menu.interactions', target: describeTarget(menuRail) });

    trackEvent(menuRail, 'focusout', (event) => {
      if (currentInput !== 'pointer') return;
      if (body.classList.contains('menu-open')) return;
      const next = event.relatedTarget;
      if (next && menuRail.contains(next)) return;
      body.classList.remove('is-slid');
    }, undefined, { module: 'menu.interactions', target: describeTarget(menuRail) });
  }

  if (panel) {
    const panelTarget = describeTarget(panel);
    trackEvent(panel, 'mouseenter', () => {
      if (currentInput !== 'pointer') return;
      body.classList.remove('is-slid');
    }, undefined, { module: 'menu.interactions', target: panelTarget });

    trackEvent(panel, 'focusin', () => {
      if (currentInput !== 'pointer') return;
      body.classList.remove('is-slid');
    }, undefined, { module: 'menu.interactions', target: panelTarget });
  }

  if (dockHandle) {
    trackEvent(dockHandle, 'click', () => {
      if (currentMode !== 'mobile') return;
      toggleMenu(dockHandle);
    }, undefined, { module: 'menu.interactions', target: describeTarget(dockHandle) });
  }

  if (backdrop) {
    trackEvent(backdrop, 'click', () => {
      if (!body.classList.contains('menu-open')) return;
      const origin = currentMode === 'mobile' ? dockHandle : menuHandle;
      closeMenu({ focusOrigin: origin });
    }, undefined, { module: 'menu.interactions', target: describeTarget(backdrop) });
  }

  if (menuCap) {
    trackEvent(menuCap, 'click', () => {
      if (currentMode !== 'mobile') return;
      if (!body.classList.contains('menu-open')) return;
      closeMenu({ focusOrigin: dockHandle });
    }, undefined, { module: 'menu.interactions', target: describeTarget(menuCap) });
  }

  trackEvent(document, 'keydown', (event) => {
    if (event.key === 'Escape' && body.classList.contains('menu-open')) {
      event.preventDefault();
      const origin = currentMode === 'mobile' ? dockHandle : menuHandle;
      closeMenu({ focusOrigin: origin });
    }
  }, undefined, { module: 'menu.interactions', target: 'document' });

  registerLifecycleDisposer(() => {
    body.classList.remove('is-slid');
  }, { module: 'menu.interactions', kind: 'state-reset' });
}

/**
 * Подключает edge-gesture для tablet режима
 */
function attachEdgeGesture() {
  if (currentMode !== 'tablet') return;
  if (!isMenuAvailable()) return;
  if (edgeGestureDisposer) return; // Already attached

  const edgeZoneWidth = 30; // px от левого края
  edgeGestureHandler = (e) => {
    if (currentMode !== 'tablet') return;
    if (e.clientX <= edgeZoneWidth && !body.classList.contains('menu-open')) {
      openMenu({ focusOrigin: menuHandle });
    }
  };

  edgeGestureDisposer = trackEvent(document, 'click', edgeGestureHandler, undefined, {
    module: 'menu.edgeGesture',
    target: 'document',
  });
}

/**
 * Отключает edge-gesture
 */
function detachEdgeGesture() {
  if (typeof edgeGestureDisposer === 'function') {
    edgeGestureDisposer();
    edgeGestureDisposer = null;
  }
  edgeGestureHandler = null;
}

/**
 * Добавляет поддержку свайпов для меню на тач-устройствах
 * Mobile: вертикальные свайпы (снизу вверх - открыть, сверху вниз от cap - закрыть)
 * Tablet: горизонтальные свайпы (слева направо - открыть, справа налево - закрыть)
 */
function attachMenuSwipes() {
  if (currentInput !== 'touch') return;
  if (!isMenuAvailable()) return;
  if (menuSwipeDisposers.length > 0) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;
  let swipeDirection = null; // 'horizontal' или 'vertical'
  let shouldHandleSwipe = false; // флаг для обработки свайпа в touchend
  let startedOnMenuCap = false; // свайп начался на cap

  // Настройки свайпов (оптимизированы для лучшего UX)
  const minSwipeDistanceOpen = 60; // дистанция для открытия (немного больше для предотвращения случайных срабатываний)
  const minSwipeDistanceClose = 80; // дистанция для закрытия (больше, чтобы не конфликтовать со скроллом)
  const edgeZoneBottom = 80; // зона внизу для открытия меню (больше для удобства)
  const edgeZoneLeft = 50; // зона слева для tablet
  const closeZoneTop = 120; // зона вверху меню для закрытия (cap + немного ниже)
  const directionThreshold = 15; // порог для определения направления (больше для надежности)

  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    isSwiping = false;
    swipeDirection = null;
    shouldHandleSwipe = false;

    // Проверяем, начался ли свайп на menu-cap (для мобильного режима)
    const target = e.target;
    startedOnMenuCap = target && (
      target.classList.contains('menu-rail__cap') ||
      target.closest('.menu-rail__cap')
    );
  }

  function handleTouchMove(e) {
    if (!isSwiping) {
      const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);

      // Определяем направление при первом значительном движении
      if (deltaX > directionThreshold || deltaY > directionThreshold) {
        isSwiping = true;
        swipeDirection = deltaX > deltaY ? 'horizontal' : 'vertical';

        const currentX = e.changedTouches[0].clientX;
        const currentY = e.changedTouches[0].clientY;
        const swipeDistanceX = currentX - touchStartX;
        const swipeDistanceY = currentY - touchStartY;
        const viewportHeight = window.innerHeight;

        // MOBILE: вертикальные свайпы
        if (currentMode === 'mobile' && swipeDirection === 'vertical') {
          // Свайп снизу вверх для открытия меню (начало в нижней зоне экрана)
          const isOpenSwipe = swipeDistanceY < 0 && // движение вверх
                             touchStartY > (viewportHeight - edgeZoneBottom) && // начало внизу
                             !body.classList.contains('menu-open');

          // Свайп сверху вниз для закрытия меню
          // ВАЖНО: только если свайп начался на cap ИЛИ в верхней зоне меню
          const isCloseSwipe = swipeDistanceY > 0 && // движение вниз
                              body.classList.contains('menu-open') &&
                              (startedOnMenuCap || touchStartY < closeZoneTop);

          shouldHandleSwipe = isOpenSwipe || isCloseSwipe;
        }

        // TABLET: горизонтальные свайпы
        if (currentMode === 'tablet' && swipeDirection === 'horizontal') {
          // Свайп слева направо для открытия меню (начало у левого края)
          const isOpenSwipe = swipeDistanceX > 0 && // движение вправо
                             touchStartX <= edgeZoneLeft && // начало у левого края
                             !body.classList.contains('menu-open');

          // Свайп справа налево для закрытия меню (когда меню открыто)
          const isCloseSwipe = swipeDistanceX < 0 && // движение влево
                              body.classList.contains('menu-open');

          shouldHandleSwipe = isOpenSwipe || isCloseSwipe;
        }
      }
    }

    // Предотвращаем скролл если это наш свайп для меню
    if (shouldHandleSwipe) {
      e.preventDefault();
    }
  }

  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].clientX;
    touchEndY = e.changedTouches[0].clientY;

    if (shouldHandleSwipe) {
      handleSwipe();
    }

    isSwiping = false;
    swipeDirection = null;
    shouldHandleSwipe = false;
    startedOnMenuCap = false;
  }

  function handleSwipe() {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;
    const viewportHeight = window.innerHeight;

    // MOBILE: вертикальные свайпы
    if (currentMode === 'mobile') {
      // Свайп снизу вверх - открыть меню
      if (swipeDistanceY < -minSwipeDistanceOpen &&
          touchStartY > (viewportHeight - edgeZoneBottom) &&
          !body.classList.contains('menu-open')) {
        openMenu({ focusOrigin: dockHandle });
        return;
      }

      // Свайп сверху вниз - закрыть меню
      // ВАЖНО: только если начался на cap или в верхней зоне, и достаточно длинный
      if (swipeDistanceY > minSwipeDistanceClose &&
          body.classList.contains('menu-open') &&
          (startedOnMenuCap || touchStartY < closeZoneTop)) {
        closeMenu({ focusOrigin: dockHandle });
        return;
      }
    }

    // TABLET: горизонтальные свайпы
    if (currentMode === 'tablet') {
      // Свайп слева направо от края - открыть меню
      if (swipeDistanceX > minSwipeDistanceOpen &&
          touchStartX <= edgeZoneLeft &&
          !body.classList.contains('menu-open')) {
        openMenu({ focusOrigin: menuHandle });
        return;
      }

      // Свайп справа налево - закрыть меню
      if (swipeDistanceX < -minSwipeDistanceClose &&
          body.classList.contains('menu-open')) {
        closeMenu({ focusOrigin: menuHandle });
        return;
      }
    }
  }

  const swipeTarget = body || document.documentElement || document;
  const swipeTargetLabel = describeTarget(swipeTarget) || 'body';

  menuSwipeDisposers.push(trackEvent(swipeTarget, 'touchstart', handleTouchStart, { passive: true }, {
    module: 'menu.swipes',
    target: swipeTargetLabel,
  }));
  menuSwipeDisposers.push(trackEvent(swipeTarget, 'touchmove', handleTouchMove, { passive: false }, {
    module: 'menu.swipes',
    target: swipeTargetLabel,
  }));
  menuSwipeDisposers.push(trackEvent(swipeTarget, 'touchend', handleTouchEnd, { passive: true }, {
    module: 'menu.swipes',
    target: swipeTargetLabel,
  }));

  registerLifecycleDisposer(() => {
    detachMenuSwipes();
  }, { module: 'menu.swipes', kind: 'cleanup' });
}

function detachMenuSwipes() {
  if (menuSwipeDisposers.length === 0) {
    return;
  }
  for (const dispose of menuSwipeDisposers) {
    try {
      dispose();
    } catch (error) {
      console.error('[MenuSwipes] Failed to dispose listener', error);
    }
  }
  menuSwipeDisposers = [];
}

function initMenuLinks() {
  if (!menuRail) return;
  if (!isMenuAvailable()) return;

  const links = menuRail.querySelectorAll('a[href^="#"]');
  if (links.length === 0) return;

  const disposers = [];

  links.forEach((link) => {
    const handler = (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return; // только основная кнопка мыши
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return; // дать возможность открыть ссылку в новой вкладке
      }

      event.preventDefault();
      const href = link.getAttribute('href');
      if (!href || href === '#') {
        return;
      }
      const target = document.querySelector(href);
      if (target instanceof HTMLElement) {
        smoothScrollTo(target);
        updateLocationHash(href);
        if (target.id) {
          setActiveSection(target.id);
        }
      }
      if (currentMode === 'mobile' || currentMode === 'tablet') {
        const origin = currentMode === 'mobile' ? dockHandle : menuHandle;
        closeMenu({ focusOrigin: origin });
      }
    };
    disposers.push(trackEvent(link, 'click', handler, undefined, {
      module: 'menu.links',
      target: describeTarget(link),
    }));
  });

  registerLifecycleDisposer(() => {
    while (disposers.length) {
      const dispose = disposers.pop();
      try {
        dispose();
      } catch (error) {
        console.error('[MenuLinks] Failed to dispose listener', error);
      }
    }
  }, { module: 'menu.links', kind: 'cleanup' });
}

/**
 * Карусель рекомендаций
 *
 * Механика:
 * 1. Показываем по 2 карточки (1 слайд)
 * 2. Всего 2 слайда (4 карточки)
 * 3. Автоматическая смена каждые 6 секунд
 * 4. Плавная смена через opacity
 * 5. Индикатор прогресса из точек
 * 6. Пауза при наведении мыши
 *
 * Работает на всех режимах (mobile, tablet, desktop, desktop-wide)
 */
function initStackCarousel() {
  const stack = document.querySelector('.stack');
  const slides = document.querySelectorAll('.stack-slide');
  const dots = document.querySelectorAll('.stack-dot');

  if (slides.length === 0) return;

  let currentSlide = 0;
  let intervalDisposer = null;
  let isPaused = false;

  // Интервал между сменами слайдов (миллисекунды)
  const SLIDE_INTERVAL = 6000; // 6 секунд

  const disposers = [];

  function setActiveSlide(index) {
    // Циклическое переключение
    const safeIndex = index % slides.length;

    if (safeIndex === currentSlide) return;

    currentSlide = safeIndex;

    // Обновляем слайды
    slides.forEach((slide, i) => {
      slide.setAttribute('data-active', i === currentSlide ? 'true' : 'false');
    });

    // Обновляем точки
    dots.forEach((dot, i) => {
      dot.setAttribute('data-active', i === currentSlide ? 'true' : 'false');
    });
  }

  function nextSlide() {
    if (!isPaused) {
      setActiveSlide(currentSlide + 1);
    }
  }

  function startAutoplay() {
    if (intervalDisposer) {
      intervalDisposer();
    }
    intervalDisposer = trackInterval(nextSlide, SLIDE_INTERVAL, {
      module: 'stackCarousel',
      detail: 'autoplay',
    });
  }

  function stopAutoplay() {
    if (intervalDisposer) {
      intervalDisposer();
      intervalDisposer = null;
    }
  }

  // Клики на точки для ручного переключения
  dots.forEach((dot, index) => {
    disposers.push(trackEvent(dot, 'click', () => {
      setActiveSlide(index);
      // Перезапускаем таймер после ручного переключения
      startAutoplay();
    }, undefined, { module: 'stackCarousel', target: describeTarget(dot) }));
  });

  // Пауза при наведении мыши
  if (stack) {
    disposers.push(trackEvent(stack, 'mouseenter', () => {
      isPaused = true;
    }, undefined, { module: 'stackCarousel', target: describeTarget(stack) }));

    disposers.push(trackEvent(stack, 'mouseleave', () => {
      isPaused = false;
    }, undefined, { module: 'stackCarousel', target: describeTarget(stack) }));

    // Поддержка свайпов на тач-устройствах с предотвращением вертикального скролла
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let isSwiping = false;
    let swipeDirection = null; // 'horizontal' или 'vertical'
    const minSwipeDistance = 50; // минимальная дистанция для переключения слайда
    const directionThreshold = 10; // порог для определения направления

    disposers.push(trackEvent(stack, 'touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      isSwiping = false;
      swipeDirection = null;
    }, { passive: true }, { module: 'stackCarousel', target: describeTarget(stack) }));

    disposers.push(trackEvent(stack, 'touchmove', (e) => {
      if (!isSwiping) {
        const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);

        // Определяем направление при первом значительном движении
        if (deltaX > directionThreshold || deltaY > directionThreshold) {
          isSwiping = true;
          swipeDirection = deltaX > deltaY ? 'horizontal' : 'vertical';
        }
      }

      // Если свайп горизонтальный - предотвращаем вертикальный скролл
      if (swipeDirection === 'horizontal') {
        e.preventDefault();
      }
    }, { passive: false }, { module: 'stackCarousel', target: describeTarget(stack) })); // passive: false чтобы preventDefault работал

    disposers.push(trackEvent(stack, 'touchend', (e) => {
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;

      // Обрабатываем свайп только если это был горизонтальный жест
      if (swipeDirection === 'horizontal') {
        handleSwipe();
      }

      isSwiping = false;
      swipeDirection = null;
    }, { passive: true }, { module: 'stackCarousel', target: describeTarget(stack) }));

    function handleSwipe() {
      const swipeDistance = touchStartX - touchEndX;

      if (Math.abs(swipeDistance) < minSwipeDistance) {
        return; // Свайп слишком короткий, игнорируем
      }

      if (swipeDistance > 0) {
        // Свайп влево - следующий слайд
        setActiveSlide(currentSlide + 1);
      } else {
        // Свайп вправо - предыдущий слайд
        setActiveSlide(currentSlide - 1 + slides.length);
      }

      // Перезапускаем таймер после свайпа
      startAutoplay();
    }
  }

  // Первоначальное обновление
  setActiveSlide(0);

  // Запускаем автопроигрывание
  startAutoplay();

  registerLifecycleDisposer(() => {
    stopAutoplay();
    while (disposers.length) {
      const dispose = disposers.pop();
      try {
        dispose();
      } catch (error) {
        console.error('[StackCarousel] Failed to dispose listener', error);
      }
    }
  }, { module: 'stackCarousel', kind: 'cleanup' });
}

/**
 * Скрытие/показ header и dock при скролле (стандартная индустриальная механика)
 * Mobile & Tablet: при скролле вниз - скрывает, при скролле вверх - показывает
 * Desktop: функция не работает (header всегда видим)
 */
function attachScrollHideHeader() {
  let lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
  let scrollTicking = false;
  const scrollThreshold = 10; // минимальная дистанция для срабатывания (px)
  const scrollTopThreshold = 100; // не скрывать если в самом верху страницы

  function updateScrollDirection() {
    // Динамически проверяем режим - работает только на mobile/tablet
    if (currentMode !== 'mobile' && currentMode !== 'tablet') {
      // На desktop режимах удаляем атрибут (все показывается)
      if (body.hasAttribute('data-scroll')) {
        body.removeAttribute('data-scroll');
      }
      scrollTicking = false;
      lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
      return;
    }

    // Если меню открыто - не меняем состояние header (не скрываем/показываем)
    if (body.classList.contains('menu-open')) {
      // Принудительно удаляем data-scroll если он каким-то образом установлен
      if (body.hasAttribute('data-scroll')) {
        body.removeAttribute('data-scroll');
      }
      scrollTicking = false;
      return;
    }

    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const scrollDiff = currentScrollY - lastScrollY;

    // Игнорируем малые изменения
    if (Math.abs(scrollDiff) < scrollThreshold) {
      scrollTicking = false;
      return;
    }

    // Определяем направление и обновляем data-атрибут
    if (scrollDiff > 0 && currentScrollY > scrollTopThreshold) {
      // Скролл вниз и не в самом верху - скрываем header/dock
      if (body.dataset.scroll !== 'down') {
        body.dataset.scroll = 'down';
      }
    } else if (scrollDiff < 0) {
      // Скролл вверх - показываем header/dock
      if (body.dataset.scroll !== 'up') {
        body.dataset.scroll = 'up';
      }
    }

    // Если в самом верху - убираем атрибут (все показывается)
    if (currentScrollY <= scrollTopThreshold) {
      body.removeAttribute('data-scroll');
    }

    lastScrollY = currentScrollY;
    scrollTicking = false;
  }

  function onScroll() {
    if (!scrollTicking) {
      requestAnimationFrame(updateScrollDirection);
      scrollTicking = true;
    }
  }

  const disposeScroll = trackEvent(window, 'scroll', onScroll, { passive: true }, {
    module: 'scroll.hideHeader',
    target: 'window',
  });

  registerLifecycleDisposer(() => {
    disposeScroll();
    body.removeAttribute('data-scroll');
  }, { module: 'scroll.hideHeader', kind: 'cleanup' });
}

/**
 * Progress Widget - виджет прогресса чтения
 * Показывает круг с процентами (0-100%), при 100% морфится в кнопку "Далее"
 */
function initProgressWidget() {
  // 1. Создание/получение элемента виджета
  let root = document.getElementById('pw-root');
  if (!root) {
    root = document.createElement('aside');
    root.id = 'pw-root';
    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-disabled', 'true');
    root.setAttribute('aria-label', 'Прогресс чтения: 0%');

    // Вставляем в article.text-box
    const article = document.querySelector('.text-box');
    if (article) {
      article.appendChild(root);
    } else {
      document.body.appendChild(root); // Fallback
    }
  }

  root.innerHTML = `<div class="pw-visual">
    <div class="pw-dot"></div>
    <div class="pw-pill"></div>
    <div class="pw-pct"><span id="pwPct">0%</span></div>
    <div class="pw-next">Далее</div>
  </div>`;

  // 2. Получение элементов
  const dot = root.querySelector('.pw-dot');
  const pill = root.querySelector('.pw-pill');
  const pct = root.querySelector('.pw-pct');
  const next = root.querySelector('.pw-next');
  const pctSpan = root.querySelector('#pwPct');

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scroller = document.scrollingElement || document.documentElement;

  // 3. Функции измерения прогресса
  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function measureProgress() {
    const r = textBox.getBoundingClientRect();
    const viewport = window.innerHeight;
    const total = Math.max(textBox.scrollHeight, r.height) - viewport;
    if (total <= 0) return 1;
    const read = Math.min(Math.max(-r.top, 0), total);
    return clamp01(read / total);
  }

  // 4. Определение URL следующей страницы
  function detectNextUrl() {
    // ПРИОРИТЕТ 1: data-next-page из article
    const article = document.querySelector('.text-box');
    const explicit = article?.dataset.nextPage ||
                     document.body.dataset.nextPage ||
                     root.getAttribute('data-next-url');
    if (explicit && explicit !== '#') return explicit;

    // ПРИОРИТЕТ 2: <link rel="next">
    const linkNext = document.querySelector('link[rel=next][href]');
    if (linkNext) return linkNext.getAttribute('href');

    // ПРИОРИТЕТ 3: <a rel="next">
    const anchorRel = document.querySelector('a[rel=next][href], a.next[href], nav .next a[href]');
    if (anchorRel) return anchorRel.getAttribute('href');

    // ПРИОРИТЕТ 4: текстовый поиск
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const keywords = ['далее', 'следующая', 'следующий', 'next', 'more'];
    for (const a of anchors) {
      const text = (a.textContent || '').trim().toLowerCase();
      if (text && keywords.some(k => text.includes(k))) {
        return a.getAttribute('href');
      }
    }

    return '#';
  }

  const NEXT_URL = detectNextUrl();

  // 5. Анимации
  let aDot = null, aPill = null, aPct = null, aNext = null;
  let doneState = false, ticking = false;
  let positionTimeoutCancel = null;
  let transitionCleanup = null;

  function cancelPositionSchedulers() {
    if (typeof positionTimeoutCancel === 'function') {
      positionTimeoutCancel();
      positionTimeoutCancel = null;
    }
    if (typeof transitionCleanup === 'function') {
      transitionCleanup();
      transitionCleanup = null;
    }
  }

  function applyRelativePosition() {
    if (!doneState) return;
    if (!root.classList.contains('is-positioned-relative')) {
      root.classList.add('is-positioned-relative');
      scheduleLayoutMetricsUpdate();
    }
  }

  function waitForFixedToSettle() {
    cancelPositionSchedulers();

    // В режимах без анимации (prefers-reduced-motion) или не mobile
    // сразу переводим в relative.
    if (prefersReduced || body.dataset.mode !== 'mobile') {
      applyRelativePosition();
      return;
    }

    const watchedProperties = new Set(['left', 'transform']);

    const onTransitionEnd = (event) => {
      if (event.target !== root) return;
      if (!watchedProperties.has(event.propertyName)) return;
      cancelPositionSchedulers();
      applyRelativePosition();
    };

    const onTransitionCancel = (event) => {
      if (event.target !== root) return;
      cancelPositionSchedulers();
      applyRelativePosition();
    };

    const detachTransitionEnd = trackEvent(root, 'transitionend', onTransitionEnd, undefined, {
      module: 'progressWidget',
      target: describeTarget(root),
    });
    const detachTransitionCancel = trackEvent(root, 'transitioncancel', onTransitionCancel, undefined, {
      module: 'progressWidget',
      target: describeTarget(root),
    });

    transitionCleanup = () => {
      detachTransitionEnd();
      detachTransitionCancel();
      transitionCleanup = null;
    };

    // Фолбэк, если transitionend не произойдёт (например, браузер не поддерживает)
    positionTimeoutCancel = trackTimeout(() => {
      positionTimeoutCancel = null;
      cancelPositionSchedulers();
      applyRelativePosition();
    }, 1700, { module: 'progressWidget', detail: 'position fallback' });
  }

  function resetRelativePosition() {
    const removed = root.classList.remove('is-positioned-relative');
    cancelPositionSchedulers();
    if (removed) {
      scheduleLayoutMetricsUpdate();
    }
  }

  function updateMenuOverlapState() {
    if (body.classList.contains('menu-open')) {
      root.classList.add('is-menu-covered');
    } else {
      root.classList.remove('is-menu-covered');
    }
  }

  updateMenuOverlapState();

  const menuStateObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === 'class') {
        updateMenuOverlapState();
        break;
      }
    }
  });

  menuStateObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
  const disconnectMenuObserver = trackObserver(menuStateObserver, {
    module: 'progressWidget',
    target: 'body[class] mutation',
  });

  function killAnims() {
    for (const a of [aDot, aPill, aPct, aNext]) {
      try { a && a.cancel(); } catch(e) {}
    }
    aDot = aPill = aPct = aNext = null;
  }

  function playForward() {
    if (prefersReduced) {
      dot.style.opacity = '0';
      pill.style.opacity = '1';
      pill.style.transform = 'translate(-50%,-50%) scaleX(1)';
      pct.style.opacity = '0';
      next.style.opacity = '1';
      return;
    }
    killAnims();
    aDot = dot.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 0.6, offset: 0.35 },
        { transform: 'translate(-50%,-50%) scale(0.94)', opacity: 0 }
      ],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
    );
    aPill = pill.animate(
      [
        { transform: 'translate(-50%,-50%) scaleX(0.001)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scaleX(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 }
      ],
      { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
    );
    aPct = pct.animate([{opacity:1},{opacity:0}], { duration: 320, easing: 'ease', fill: 'forwards', delay: 150 });
    aNext = next.animate([{opacity:0},{opacity:1}], { duration: 420, easing: 'ease', fill: 'forwards', delay: 360 });
  }

  function playReverse() {
    if (prefersReduced) {
      dot.style.opacity = '1';
      dot.style.transform = 'translate(-50%,-50%) scale(1)';
      pill.style.opacity = '0';
      pill.style.transform = 'translate(-50%,-50%) scaleX(0.001)';
      pct.style.opacity = '1';
      next.style.opacity = '0';
      return;
    }
    killAnims();
    aDot = dot.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.94)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 0.6, offset: 0.65 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }
      ],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
    );
    aPill = pill.animate(
      [
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scaleX(0.001)', opacity: 0 }
      ],
      { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
    );
    aPct = pct.animate([{opacity:0},{opacity:1}], { duration: 360, easing: 'ease', fill: 'forwards', delay: 360 });
    aNext = next.animate([{opacity:1},{opacity:0}], { duration: 320, easing: 'ease', fill: 'forwards', delay: 120 });
  }

  // 6. Обновление на скролл
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function update() {
    ticking = false;
    const p = measureProgress();
    const perc = Math.round(p * 100);
    pctSpan.textContent = perc + '%';
    root.setAttribute('aria-label', 'Прогресс чтения: ' + perc + '%');

    const shouldBeDone = perc >= 100;

    if (shouldBeDone && !doneState) {
      doneState = true;
      root.classList.add('is-done');
      root.setAttribute('aria-disabled', 'false');
      root.setAttribute('aria-label', 'Кнопка: Далее');
      playForward();
      waitForFixedToSettle();
    } else if (!shouldBeDone && doneState) {
      doneState = false;
      root.classList.remove('is-done');
      root.setAttribute('aria-disabled', 'true');
      root.setAttribute('aria-label', 'Прогресс чтения: ' + perc + '%');
      playReverse();
      resetRelativePosition();
    } else {
      if (!shouldBeDone) {
        root.setAttribute('aria-label', 'Прогресс чтения: ' + perc + '%');
      }
    }
  }

  // 7. Клик
  trackEvent(root, 'click', () => {
    if (doneState) {
      // При 100%: переход на следующую страницу
      if (NEXT_URL && NEXT_URL !== '#') {
        window.location.href = NEXT_URL;
      } else {
        console.warn('Progress Widget: следующая страница не найдена');
      }
    } else {
      // До 100%: докрутить до конца
      const endY = window.scrollY + (textBox.getBoundingClientRect().bottom - window.innerHeight + 1);
      window.scrollTo({ top: endY, behavior: 'smooth' });
    }
  }, { passive: true }, { module: 'progressWidget', target: describeTarget(root) });

  // 8. Keyboard navigation
  trackEvent(root, 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      root.click();
    }
  }, undefined, { module: 'progressWidget', target: describeTarget(root) });

  // 9. Listeners
  trackEvent(window, 'scroll', onScroll, { passive: true }, {
    module: 'progressWidget',
    target: 'window',
  });

  // 10. Инициализация
  dot.style.opacity = '1';
  pill.style.opacity = '0';
  pill.style.transform = 'translate(-50%,-50%) scaleX(0.001)';
  pct.style.opacity = '1';
  next.style.opacity = '0';
  update();

  // Обновить layout metrics после создания виджета
  scheduleLayoutMetricsUpdate();

  registerLifecycleDisposer(() => {
    cancelPositionSchedulers();
    killAnims();
    if (typeof disconnectMenuObserver === 'function') {
      disconnectMenuObserver();
    }
    root.classList.remove('is-done', 'is-menu-covered', 'is-positioned-relative');
  }, { module: 'progressWidget', kind: 'cleanup' });
}

function init() {
  // Feature detection
  detectBackdropFilter();

  updateMode();
  initDots();
  initDotsFlyout(); // Flyout меню для navigation dots
  initMenuInteractions();
  attachEdgeGesture(); // Attach only if tablet mode
  attachMenuSwipes(); // Swipe support for touch devices
  attachScrollHideHeader(); // Auto-hide header/dock on scroll
  initMenuLinks();
  initStackCarousel(); // Карусель рекомендаций
  initProgressWidget(); // Progress Widget (круг с процентами → кнопка "Далее")

  let resizeRaf = null;

  const cancelResizeRaf = () => {
    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = null;
    }
  };

  // Более быстрая обработка resize через RAF вместо debounce
  const handleResize = () => {
    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf);
    }

    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      handleModeUpdate();
    });
  };

  trackEvent(window, 'resize', handleResize, undefined, {
    module: 'layout.mode',
    target: 'window',
  });

  // Orientationchange
  const handleOrientationChange = () => {
    // Даем браузеру время обновить размеры перед проверкой
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        handleModeUpdate();
      });
    });
  };

  trackEvent(window, 'orientationchange', handleOrientationChange, undefined, {
    module: 'layout.mode',
    target: 'window',
  });

  // Добавляем обработку media queries для более точного отслеживания
  if (window.matchMedia) {
    const mql1024 = window.matchMedia('(min-width: 1024px)');
    const mql1280 = window.matchMedia('(min-width: 1280px)');
    const mql1440 = window.matchMedia('(min-width: 1440px)');

    const handleMediaChange = () => {
      requestAnimationFrame(() => {
        handleModeUpdate();
      });
    };

    trackMediaQuery(mql1024, handleMediaChange, {
      module: 'layout.mode',
      query: '(min-width: 1024px)',
    });
    trackMediaQuery(mql1280, handleMediaChange, {
      module: 'layout.mode',
      query: '(min-width: 1280px)',
    });
    trackMediaQuery(mql1440, handleMediaChange, {
      module: 'layout.mode',
      query: '(min-width: 1440px)',
    });
  }

  registerLifecycleDisposer(cancelResizeRaf, {
    module: 'layout.mode',
    kind: 'raf-throttle',
  });

  registerLifecycleDisposer(teardownObserver, {
    module: 'sections.observer',
  });

  registerLifecycleDisposer(() => {
    if (typeof flyoutHideTimeoutCancel === 'function') {
      flyoutHideTimeoutCancel();
      flyoutHideTimeoutCancel = null;
    }
  }, { module: 'dotsFlyout', detail: 'cancel hide timeout' });

  registerLifecycleDisposer(() => {
    detachEdgeGesture();
    detachMenuSwipes();
    detachTrap();
    detachFlyoutListeners();
  }, { module: 'menu.lifecycle', kind: 'detach' });

  registerLifecycleDisposer(() => {
    previousFocus = null;
    body.classList.remove('menu-open', 'is-slid');
    body.removeAttribute('data-scroll');
    delete body.dataset.lock;
    delete root.dataset.lock;
    updateAriaExpanded(false);
  }, { module: 'menu.lifecycle', kind: 'state-reset' });

  registerLifecycleDisposer(() => {
    if (layoutMetricsRaf !== null) {
      cancelAnimationFrame(layoutMetricsRaf);
      layoutMetricsRaf = null;
    }
  }, { module: 'layout.metrics', kind: 'raf' });

  return (reason) => {
    cancelResizeRaf();
    detachEdgeGesture();
    detachMenuSwipes();
    detachTrap();
    detachFlyoutListeners();
    teardownObserver();
    if (typeof flyoutHideTimeoutCancel === 'function') {
      flyoutHideTimeoutCancel();
      flyoutHideTimeoutCancel = null;
    }
    previousFocus = null;
    if (reason && DEBUG_MODE_DETECTION) {
      console.log('[Lifecycle] init() cleanup invoked', reason);
    }
  };
}

function bindPageLifecycle(dispose) {
  const removers = [];

  const safeDispose = (reason) => {
    try {
      dispose({ reason });
    } catch (error) {
      console.error('[Lifecycle] dispose failed from page lifecycle', { reason, error });
    }
  };

  if (typeof window.addEventListener === 'function') {
    const onPageHide = (event) => {
      if (event?.persisted) {
        return;
      }
      safeDispose('pagehide');
    };
    window.addEventListener('pagehide', onPageHide);
    removers.push(() => window.removeEventListener('pagehide', onPageHide));

    const onBeforeUnload = () => {
      safeDispose('beforeunload');
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    removers.push(() => window.removeEventListener('beforeunload', onBeforeUnload));
  }

  if (typeof document?.addEventListener === 'function') {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        safeDispose('visibilitychange');
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    removers.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
  }

  return () => {
    while (removers.length) {
      const remove = removers.pop();
      try {
        remove();
      } catch (error) {
        console.error('[Lifecycle] Failed to remove page lifecycle hook', error);
      }
    }
  };
}

const previousApp = window[APP_GLOBAL_KEY];
if (previousApp && typeof previousApp.dispose === 'function') {
  try {
    previousApp.dispose({ reason: 'reinit' });
  } catch (error) {
    console.error('[Lifecycle] Failed to dispose previous app instance', error);
  }
  if (typeof previousApp.teardown === 'function') {
    try {
      previousApp.teardown();
    } catch (error) {
      console.error('[Lifecycle] Failed to teardown previous app hooks', error);
    }
  }
}

const lifecycle = createLifecycleRegistry('toosmart:init');
setActiveLifecycle(lifecycle);

let initCleanup = null;
try {
  initCleanup = init();
} catch (error) {
  console.error('[Lifecycle] init() failed', error);
}

const disposeLoadListener = trackEvent(window, 'load', scheduleLayoutMetricsUpdate, undefined, {
  module: 'layout.metrics',
  target: 'window',
});

scheduleLayoutMetricsUpdate();

let removePageHooks = () => {};
let disposed = false;

const disposeApp = (payload = {}) => {
  if (disposed) return;
  disposed = true;

  removePageHooks();
  removePageHooks = () => {};

  const cleanupReason = payload && typeof payload === 'object' ? payload : { reason: String(payload) };

  try {
    if (typeof initCleanup === 'function') {
      initCleanup(cleanupReason);
    }
  } catch (error) {
    console.error('[Lifecycle] init cleanup failed', { error, cleanupReason });
  }

  try {
    disposeLoadListener();
  } catch (error) {
    console.error('[Lifecycle] Failed to remove load listener', error);
  }

  try {
    lifecycle.disposeAll();
  } catch (error) {
    console.error('[Lifecycle] disposeAll failed', error);
  }

  setActiveLifecycle(null);
};

removePageHooks = bindPageLifecycle(disposeApp);

const appApi = {
  dispose: disposeApp,
  teardown() {
    removePageHooks();
    removePageHooks = () => {};
  },
  getResources() {
    return lifecycle.report();
  },
  audit: '2024-10-19',
};

window[APP_GLOBAL_KEY] = appApi;

// Глобальная функция для отладки режимов
window.toggleModeDebug = function (enable) {
  if (typeof enable === 'boolean') {
    window.DEBUG_MODE_DETECTION = enable;
  } else {
    window.DEBUG_MODE_DETECTION = !window.DEBUG_MODE_DETECTION;
  }

  if (window.DEBUG_MODE_DETECTION) {
    console.log('[DEBUG] Mode detection logging enabled ✓');
    console.log('[DEBUG] Current state:', {
      mode: currentMode,
      input: currentInput,
    });

    // Показываем все источники ширины (в порядке приоритета)
    const sources = {
      visualViewportWidth: window.visualViewport?.width,
      rootClientWidth: root?.clientWidth,
      innerWidth: window.innerWidth,
      outerWidth: window.outerWidth,
      screenWidth: window.screen?.width,
    };
    console.log('[DEBUG] Width sources (priority order):', sources);

    // Показываем какой источник будет использован
    const sourcesArray = [
      sources.visualViewportWidth,
      sources.rootClientWidth,
      sources.innerWidth,
      sources.outerWidth,
      sources.screenWidth,
    ];
    let usedWidth = null;
    let usedSource = null;
    const sourceNames = ['visualViewportWidth', 'rootClientWidth', 'innerWidth', 'outerWidth', 'screenWidth'];
    for (let i = 0; i < sourcesArray.length; i++) {
      const value = sourcesArray[i];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        usedWidth = value;
        usedSource = sourceNames[i];
        break;
      }
    }
    console.log('[DEBUG] Width used for detection:', usedWidth, `(from ${usedSource})`);

    // Принудительно запускаем определение для вывода в консоль
    const detectedInput = detectInput();
    const detectedMode = detectMode(detectedInput);
    console.log('[DEBUG] Detected state:', {
      mode: detectedMode,
      input: detectedInput,
    });
    console.log('[DEBUG] State mismatch:', {
      mode: currentMode !== detectedMode,
      input: currentInput !== detectedInput,
    });

    console.log('[DEBUG] Now resize the window to see automatic mode/input changes...');
  } else {
    console.log('[DEBUG] Mode detection logging disabled');
  }
};
