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

// Debug mode: установите в true для вывода информации о режимах в консоль
// Включите в Safari Dev Tools: window.DEBUG_MODE_DETECTION = true
const DEBUG_MODE_DETECTION = window.DEBUG_MODE_DETECTION || false;
let layoutMetricsRaf = null;

function parseCssNumber(value) {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : 0;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function classifyMode(width) {
  // Определяем возможности устройства
  const hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  const hasAnyCoarse = window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches;
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const isTouchDevice = hasAnyCoarse || hasTouchPoints;

  // Определяем iPad (включая iPadOS 13+ которые притворяются Mac)
  const ua = navigator.userAgent;
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && hasTouchPoints);

  let mode;

  if (width < 1024) {
    mode = 'handheld';
  } else if (width < 1440) {
    // Диапазон 1024-1439px
    // iPad всегда tablet-wide
    if (isIpad) {
      mode = 'tablet-wide';
    }
    // Сенсорное устройство без hover → tablet-wide
    else if (isTouchDevice && !hasHover) {
      mode = 'tablet-wide';
    }
    // Desktop только при 1280+, с hover и без touch
    else if (width >= 1280 && hasHover && !isTouchDevice) {
      mode = 'desktop';
    } else {
      mode = 'tablet-wide';
    }
  } else {
    // ≥1440px - iPad все равно tablet-wide
    mode = isIpad ? 'tablet-wide' : 'desktop';
  }

  if (DEBUG_MODE_DETECTION) {
    console.log('[MODE DETECTION]', {
      width,
      mode,
      hasHover,
      hasAnyCoarse,
      hasTouchPoints,
      isTouchDevice,
      isIpad,
      userAgent: ua,
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

function detectMode() {
  // root.clientWidth - самый надежный источник для Safari Dev Tools
  // window.innerWidth может быть некорректным при эмуляции
  const sources = [root?.clientWidth, window.innerWidth, window.outerWidth, window.screen?.width];

  for (const value of sources) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      if (window.DEBUG_MODE_DETECTION) {
        console.log('[DEBUG] detectMode() using width:', value);
      }
      return classifyMode(value);
    }
  }

  const mediaFallbacks = [
    ['handheld', '(max-width: 1023px)'],
    ['tablet-wide', '(min-width: 1024px) and (max-width: 1439px)'],
    ['desktop', '(min-width: 1440px)'],
  ];

  for (const [mode, query] of mediaFallbacks) {
    if (typeof window.matchMedia === 'function' && window.matchMedia(query).matches) {
      return mode;
    }
  }

  return 'tablet-wide';
}

function updateMode() {
  const nextMode = detectMode();
  const prevMode = currentMode;
  currentMode = nextMode;
  body.dataset.mode = nextMode;

  if (window.DEBUG_MODE_DETECTION) {
    if (prevMode !== nextMode) {
      console.log('[MODE CHANGE] 🔄', {
        from: prevMode,
        to: nextMode,
        viewport: {
          rootClientWidth: root?.clientWidth,
          innerWidth: window.innerWidth,
          outerWidth: window.outerWidth,
          screenWidth: window.screen?.width,
        },
      });
    } else {
      console.log('[MODE UPDATE] ✓', {
        mode: currentMode,
        viewport: {
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
  if (dotsPositionRaf !== null) {
    cancelAnimationFrame(dotsPositionRaf);
    dotsPositionRaf = null;
  }

  if (layoutMetricsRaf !== null) {
    cancelAnimationFrame(layoutMetricsRaf);
    layoutMetricsRaf = null;
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
  } else {
    // На desktop обновляем позицию dots после анимации меню
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
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

  // На desktop обновляем позицию dots после анимации закрытия меню
  if (currentMode === 'desktop') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
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
    // Обновляем позицию dots после анимации slide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
  });
  menuRail?.addEventListener('mouseleave', () => {
    if (currentMode !== 'desktop') return;
    body.classList.remove('is-slid');
    // Обновляем позицию dots после анимации slide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
  });
  menuRail?.addEventListener('focusin', () => {
    if (currentMode !== 'desktop') return;
    body.classList.add('is-slid');
    // Обновляем позицию dots после анимации slide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
  });
  menuRail?.addEventListener('focusout', (event) => {
    if (currentMode !== 'desktop') return;
    if (body.classList.contains('menu-open')) return;
    const next = event.relatedTarget;
    if (next && menuRail.contains(next)) return;
    body.classList.remove('is-slid');
    // Обновляем позицию dots после анимации slide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
  });
  panel?.addEventListener('mouseenter', () => {
    if (currentMode !== 'desktop') return;
    body.classList.remove('is-slid');
    // Обновляем позицию dots после анимации slide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
  });
  panel?.addEventListener('focusin', () => {
    if (currentMode !== 'desktop') return;
    body.classList.remove('is-slid');
    // Обновляем позицию dots после анимации slide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDotsPosition();
      });
    });
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
  // Временная реализация жестов через клики/ховеры
  // TODO: Реализовать настоящие touch events для production

  // Edge-swipe для Tablet-Wide: клик по левому краю экрана (временная замена)
  if (currentMode === 'tablet-wide') {
    const edgeZoneWidth = 30; // px от левого края
    document.addEventListener('click', (e) => {
      if (currentMode !== 'tablet-wide') return;
      if (e.clientX <= edgeZoneWidth && !body.classList.contains('menu-open')) {
        openMenu({ focusOrigin: menuHandle });
      }
    });
  }

  // Для handheld открытие/закрытие уже работает через dock-handle и menu-cap клики
  // Эти обработчики находятся в initMenuInteractions
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
        const origin = currentMode === 'handheld' ? dockHandle : menuHandle;
        closeMenu({ focusOrigin: origin });
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

  let resizeRaf = null;

  // Более быстрая обработка resize через RAF вместо debounce
  const handleResize = () => {
    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf);
    }

    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      const prevMode = currentMode;
      updateMode();

      if (prevMode !== currentMode) {
        // При смене режима обновляем dots и observer
        if (currentMode === 'desktop') {
          updateDotsPosition();
          setupSectionObserver();
        } else {
          teardownObserver();
        }
      } else if (currentMode === 'desktop') {
        // Если режим не изменился, но мы в desktop - обновляем позицию dots
        updateDotsPosition();
      }

      scheduleLayoutMetricsUpdate();
    });
  };

  window.addEventListener('resize', handleResize);

  // Orientationchange
  const handleOrientationChange = () => {
    // Даем браузеру время обновить размеры перед проверкой
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateMode();

        if (currentMode === 'desktop') {
          updateDotsPosition();
          setupSectionObserver();
        } else {
          teardownObserver();
        }

        scheduleLayoutMetricsUpdate();
      });
    });
  };

  window.addEventListener('orientationchange', handleOrientationChange);

  // Добавляем обработку media queries для более точного отслеживания
  if (window.matchMedia) {
    const mql1024 = window.matchMedia('(min-width: 1024px)');
    const mql1280 = window.matchMedia('(min-width: 1280px)');
    const mql1440 = window.matchMedia('(min-width: 1440px)');

    const handleMediaChange = () => {
      requestAnimationFrame(() => {
        const prevMode = currentMode;
        updateMode();

        if (prevMode !== currentMode) {
          if (currentMode === 'desktop') {
            updateDotsPosition();
            setupSectionObserver();
          } else {
            teardownObserver();
          }
          scheduleLayoutMetricsUpdate();
        }
      });
    };

    mql1024.addEventListener('change', handleMediaChange);
    mql1280.addEventListener('change', handleMediaChange);
    mql1440.addEventListener('change', handleMediaChange);
  }
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
    console.log('[DEBUG] Current stored mode:', currentMode);

    // Показываем все источники ширины (в порядке приоритета)
    const sources = {
      rootClientWidth: root?.clientWidth,
      innerWidth: window.innerWidth,
      outerWidth: window.outerWidth,
      screenWidth: window.screen?.width,
    };
    console.log('[DEBUG] Width sources (priority order):', sources);

    // Показываем какой источник будет использован
    const sourcesArray = [sources.rootClientWidth, sources.innerWidth, sources.outerWidth, sources.screenWidth];
    let usedWidth = null;
    let usedSource = null;
    const sourceNames = ['rootClientWidth', 'innerWidth', 'outerWidth', 'screenWidth'];
    for (let i = 0; i < sourcesArray.length; i++) {
      const value = sourcesArray[i];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        usedWidth = value;
        usedSource = sourceNames[i];
        break;
      }
    }
    console.log('[DEBUG] Width used for detection:', usedWidth, `(from ${usedSource})`);

    // Принудительно запускаем определение режима для вывода в консоль
    const detectedMode = detectMode();
    console.log('[DEBUG] Detected mode:', detectedMode);
    console.log('[DEBUG] Mode mismatch:', currentMode !== detectedMode);

    console.log('[DEBUG] Now resize the window to see automatic mode changes...');
  } else {
    console.log('[DEBUG] Mode detection logging disabled');
  }
};
