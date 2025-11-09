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
let currentInput = body.dataset.input || 'pointer';
let activeSectionId = sections[0]?.id ?? null;
let previousFocus = null;
let trapListenerAttached = false;
let observer = null;
let edgeGestureHandler = null;

// Debug mode: установите в true для вывода информации о режимах в консоль
// Включите в Safari Dev Tools: window.DEBUG_MODE_DETECTION = true
const DEBUG_MODE_DETECTION = window.DEBUG_MODE_DETECTION || false;
let layoutMetricsRaf = null;

function parseCssNumber(value) {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Определяет тип ввода (input capability)
 * @returns {'touch' | 'pointer'} - тип устройства ввода
 */
function detectInput() {
  // Проверяем наличие сенсорного ввода
  const hasCoarsePointer = window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches;
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const isTouchDevice = hasCoarsePointer || hasTouchPoints;

  if (window.DEBUG_MODE_DETECTION) {
    console.log('[DEBUG] detectInput():', {
      hasCoarsePointer,
      hasTouchPoints,
      result: isTouchDevice ? 'touch' : 'pointer',
    });
  }

  return isTouchDevice ? 'touch' : 'pointer';
}

/**
 * Классифицирует режим верстки на основе ширины и типа ввода
 * @param {number} width - ширина viewport
 * @param {'touch' | 'pointer'} inputType - тип ввода
 * @returns {'mobile' | 'tablet' | 'desktop' | 'desktop-wide'} - режим верстки
 */
function classifyMode(width, inputType) {
  const isTouchDevice = inputType === 'touch';

  let mode;

  // Touch устройства: упрощенная схема (mobile/tablet/desktop)
  if (isTouchDevice) {
    if (width < 768) {
      mode = 'mobile';
    } else if (width < 900) {
      mode = 'tablet';
    } else {
      mode = 'desktop'; // touch останавливается на desktop
    }
  }
  // Non-touch устройства: полный диапазон режимов (все 4)
  else {
    if (width < 768) {
      mode = 'mobile';
    } else if (width < 900) {
      mode = 'tablet';
    } else if (width < 1280) {
      mode = 'desktop';
    } else {
      mode = 'desktop-wide';
    }
  }

  if (window.DEBUG_MODE_DETECTION) {
    console.log('[DEBUG] classifyMode():', {
      width,
      isTouchDevice,
      mode,
    });
  }

  return mode;
}

function updateLayoutMetrics() {
  const headerHeight = header?.offsetHeight ?? 0;
  const stackOffset = Math.max(0, headerHeight + 16);
  root.style.setProperty('--stack-top', `${stackOffset}px`);
  const scrollMargin = Math.max(0, headerHeight + 24);
  root.style.setProperty('--section-scroll-margin', `${scrollMargin}px`);

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

/**
 * Определяет режим верстки на основе текущей ширины viewport
 * @param {'touch' | 'pointer'} inputType - тип ввода
 * @returns {'mobile' | 'tablet' | 'desktop' | 'desktop-wide'} - режим верстки
 */
function detectMode(inputType) {
  // Приоритет источников ширины:
  // 1. visualViewport.width - самый точный, учитывает zoom и виртуальную клавиатуру
  // 2. root.clientWidth - надежный для Safari Dev Tools
  // 3. window.innerWidth - стандартный fallback
  // 4. window.outerWidth - крайний fallback
  // 5. screen.width - последний fallback
  const sources = [
    window.visualViewport?.width,
    root?.clientWidth,
    window.innerWidth,
    window.outerWidth,
    window.screen?.width,
  ];

  for (const value of sources) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      if (window.DEBUG_MODE_DETECTION) {
        console.log('[DEBUG] detectMode() using width:', value);
      }
      return classifyMode(value, inputType);
    }
  }

  const mediaFallbacks = [
    ['mobile', '(max-width: 767px)'],
    ['tablet', '(min-width: 768px) and (max-width: 899px)'],
    ['desktop', '(min-width: 900px) and (max-width: 1279px)'],
    ['desktop-wide', '(min-width: 1280px)'],
  ];

  for (const [mode, query] of mediaFallbacks) {
    if (typeof window.matchMedia === 'function' && window.matchMedia(query).matches) {
      return mode;
    }
  }

  return 'desktop';
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

    // Управление edge-gesture lifecycle
    detachEdgeGesture();
    attachEdgeGesture();

    // Принудительный reflow для применения изменений
    void body.offsetHeight;
  }

  lockScroll();
  scheduleLayoutMetricsUpdate();
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
  const shouldEnable = currentMode === 'desktop' && sections.length >= 2;
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
 * Helper: обновляет режим и синхронизирует observer с layout
 */
function handleModeUpdate() {
  const prevMode = currentMode;
  updateMode();

  if (prevMode !== currentMode) {
    if (currentMode === 'desktop') {
      setupSectionObserver();
    } else {
      teardownObserver();
    }
  }

  scheduleLayoutMetricsUpdate();
}

function handleNext() {
  // Получаем URL следующей страницы из data-атрибута кнопки
  const nextPageUrl = btnNext?.dataset.nextPage;

  if (nextPageUrl) {
    window.location.href = nextPageUrl;
  } else {
    console.warn('Кнопка "Далее": не указан data-next-page');
  }
}

function initMenuInteractions() {
  menuHandle?.addEventListener('click', () => toggleMenu(menuHandle));
  menuRail?.addEventListener('mouseenter', () => {
    if (currentInput !== 'pointer') return;
    body.classList.add('is-slid');
  });
  menuRail?.addEventListener('mouseleave', () => {
    if (currentInput !== 'pointer') return;
    body.classList.remove('is-slid');
  });
  menuRail?.addEventListener('focusin', () => {
    if (currentInput !== 'pointer') return;
    body.classList.add('is-slid');
  });
  menuRail?.addEventListener('focusout', (event) => {
    if (currentInput !== 'pointer') return;
    if (body.classList.contains('menu-open')) return;
    const next = event.relatedTarget;
    if (next && menuRail.contains(next)) return;
    body.classList.remove('is-slid');
  });
  panel?.addEventListener('mouseenter', () => {
    if (currentInput !== 'pointer') return;
    body.classList.remove('is-slid');
  });
  panel?.addEventListener('focusin', () => {
    if (currentInput !== 'pointer') return;
    body.classList.remove('is-slid');
  });
  dockHandle?.addEventListener('click', () => {
    if (currentMode !== 'mobile') return;
    toggleMenu(dockHandle);
  });
  backdrop?.addEventListener('click', () => {
    if (!body.classList.contains('menu-open')) return;
    const origin = currentMode === 'mobile' ? dockHandle : menuHandle;
    closeMenu({ focusOrigin: origin });
  });
  menuCap?.addEventListener('click', () => {
    if (currentMode !== 'mobile') return;
    if (!body.classList.contains('menu-open')) return;
    closeMenu({ focusOrigin: dockHandle });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && body.classList.contains('menu-open')) {
      event.preventDefault();
      const origin = currentMode === 'mobile' ? dockHandle : menuHandle;
      closeMenu({ focusOrigin: origin });
    }
  });
}

/**
 * Подключает edge-gesture для tablet режима
 */
function attachEdgeGesture() {
  if (currentMode !== 'tablet') return;
  if (edgeGestureHandler) return; // Already attached

  const edgeZoneWidth = 30; // px от левого края
  edgeGestureHandler = (e) => {
    if (currentMode !== 'tablet') return;
    if (e.clientX <= edgeZoneWidth && !body.classList.contains('menu-open')) {
      openMenu({ focusOrigin: menuHandle });
    }
  };

  document.addEventListener('click', edgeGestureHandler);
}

/**
 * Отключает edge-gesture
 */
function detachEdgeGesture() {
  if (!edgeGestureHandler) return;
  document.removeEventListener('click', edgeGestureHandler);
  edgeGestureHandler = null;
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
      if (currentMode === 'mobile' || currentMode === 'tablet') {
        const origin = currentMode === 'mobile' ? dockHandle : menuHandle;
        closeMenu({ focusOrigin: origin });
      }
    });
  });
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
  let intervalId = null;
  let isPaused = false;

  // Интервал между сменами слайдов (миллисекунды)
  const SLIDE_INTERVAL = 6000; // 6 секунд

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
    if (intervalId) {
      clearInterval(intervalId);
    }
    intervalId = setInterval(nextSlide, SLIDE_INTERVAL);
  }

  function stopAutoplay() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Клики на точки для ручного переключения
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      setActiveSlide(index);
      // Перезапускаем таймер после ручного переключения
      startAutoplay();
    });
  });

  // Пауза при наведении мыши
  if (stack) {
    stack.addEventListener('mouseenter', () => {
      isPaused = true;
    });

    stack.addEventListener('mouseleave', () => {
      isPaused = false;
    });
  }

  // Первоначальное обновление
  setActiveSlide(0);

  // Запускаем автопроигрывание
  startAutoplay();
}

function init() {
  updateMode();
  initDots();
  initMenuInteractions();
  attachEdgeGesture(); // Attach only if tablet mode
  initMenuLinks();
  initStackCarousel(); // Карусель рекомендаций

  const handleNextClick = () => handleNext();
  btnNext?.addEventListener('click', handleNextClick);

  let resizeRaf = null;

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

  window.addEventListener('resize', handleResize);

  // Orientationchange
  const handleOrientationChange = () => {
    // Даем браузеру время обновить размеры перед проверкой
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        handleModeUpdate();
      });
    });
  };

  window.addEventListener('orientationchange', handleOrientationChange);

  // Добавляем обработку media queries для более точного отслеживания
  const mediaQueryListeners = [];
  if (window.matchMedia) {
    const mql1024 = window.matchMedia('(min-width: 1024px)');
    const mql1280 = window.matchMedia('(min-width: 1280px)');
    const mql1440 = window.matchMedia('(min-width: 1440px)');

    const handleMediaChange = () => {
      requestAnimationFrame(() => {
        handleModeUpdate();
      });
    };

    mql1024.addEventListener('change', handleMediaChange);
    mql1280.addEventListener('change', handleMediaChange);
    mql1440.addEventListener('change', handleMediaChange);

    mediaQueryListeners.push(
      { mql: mql1024, handler: handleMediaChange },
      { mql: mql1280, handler: handleMediaChange },
      { mql: mql1440, handler: handleMediaChange }
    );
  }

  // Cleanup function для удаления всех listeners
  return () => {
    btnNext?.removeEventListener('click', handleNextClick);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleOrientationChange);

    mediaQueryListeners.forEach(({ mql, handler }) => {
      mql.removeEventListener('change', handler);
    });

    detachEdgeGesture();
    teardownObserver();

    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf);
    }
  };
}

init();
scheduleLayoutMetricsUpdate();
window.addEventListener('load', scheduleLayoutMetricsUpdate);

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
