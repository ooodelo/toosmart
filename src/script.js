import { ModeUtils as ModeUtilsModule } from './js/mode-utils.js';
import './js/auth-check.js';
import { initCta } from './cta.js';

// Head inline partial should expose window.ModeUtils; fall back to module import when it doesn't.
const ModeUtils = window.ModeUtils || ModeUtilsModule;

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

if (!ModeUtils) {
  throw new Error('ModeUtils module is required for responsive mode detection.');
}

const root = document.documentElement;
const body = document.body;
const hadInitialMode = typeof window.__INITIAL_MODE__ === 'string';
const hadInitialInput = typeof window.__INITIAL_INPUT__ === 'string';
const initialState = ensureInitialModeState(body);
const initialMode = initialState.mode;
const initialInput = initialState.input;
if (hadInitialMode) {
  delete window.__INITIAL_MODE__;
}
if (hadInitialInput) {
  delete window.__INITIAL_INPUT__;
}
// Safari fix: Элементы могут быть не готовы при загрузке модуля
// Используем let и инициализируем позже в ensureElements()
let menuRail = null;
let header = null;
let menuHandle = null;
let siteMenu = null;
let backdrop = null;
let dockHandle = null;
let panel = null;
let main = null;
let dotsRail = null;
let dotFlyout = null;
let sections = [];
let menuCap = null;
let progressWidgetRoot = null;
let lastStackInline = false;

let currentMode = body.dataset.mode || initialMode || 'desktop';
let currentInput = body.dataset.input || initialInput || 'pointer';

if (!body.dataset.input && typeof initialInput === 'string') {
  body.dataset.input = initialInput;
}
let activeSectionId = sections[0]?.id ?? null;
let previousFocus = null;
let trapDisposer = null;
let observer = null;
let observerDisposer = () => { };
let contentBoundaryObserver = null;
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
let flyoutSetActiveDisposer = null;
let menuSwipeDisposers = [];
let edgeGestureDisposer = null;
let scrollHideControls = {
  suppress: () => { },
  setMode: () => { },
  detach: () => { },
};
let layoutMetricsInitialized = false;
let viewportGeometryDirty = false;
let stackCarouselCleanup = null;
let progressWidgetCleanup = null;
let dotsFeatureActive = false;

const menuState = createMenuStateController({
  body,
  handles: [menuHandle, dockHandle],
});

// Security helpers for safe DOM manipulation
function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function refreshSectionsFromLabels() {
  const labels = Array.from(document.querySelectorAll('.section-label'));
  sections.length = 0;

  labels.forEach((label, index) => {
    const title = label.textContent?.trim();
    if (!title) return;

    if (!label.id) {
      label.id = `section-label-${index + 1}`;
    }

    if (!label.dataset.section) {
      label.dataset.section = title;
    }

    sections.push(label);
  });

  if (sections.length === 0) {
    activeSectionId = null;
  } else if (!sections.some((section) => section.id === activeSectionId)) {
    activeSectionId = sections[0].id;
  }

  return sections;
}

function isMenuAvailable() {
  return Boolean(menuRail || siteMenu);
}

function ensureInitialModeState(bodyElement) {
  const { body: docBody } = document;
  const targetBody = bodyElement || docBody;

  const modeFromInline = typeof window.__INITIAL_MODE__ === 'string' ? window.__INITIAL_MODE__ : targetBody?.dataset.mode;
  const inputFromInline = typeof window.__INITIAL_INPUT__ === 'string' ? window.__INITIAL_INPUT__ : targetBody?.dataset.input;

  const needsDetection = !modeFromInline || !inputFromInline;
  if (!needsDetection) {
    return { mode: modeFromInline, input: inputFromInline };
  }

  const detected = ModeUtils.detectInitialState(window, document);
  const mode = modeFromInline || detected.mode;
  const input = inputFromInline || detected.input;

  if (targetBody) {
    if (!targetBody.dataset.mode) {
      targetBody.dataset.mode = mode;
    }
    if (!targetBody.dataset.input) {
      targetBody.dataset.input = input;
    }
  }

  return { mode, input };
}

function createMenuStateController({ body, handles = [] } = {}) {
  const normalizedHandles = handles.filter((handle) => handle instanceof HTMLElement);
  const listeners = new Set();
  let open = Boolean(body?.classList.contains('menu-open'));

  function isVisible(element) {
    if (!element) return false;
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function syncHandles() {
    const expanded = String(open);
    for (const handle of normalizedHandles) {
      if (!handle) continue;
      if (isVisible(handle)) {
        handle.setAttribute('aria-expanded', expanded);
      } else {
        handle.removeAttribute('aria-expanded');
      }
    }
  }

  function apply() {
    if (body) {
      body.classList.toggle('menu-open', open);
    }
    syncHandles();
  }

  function notify() {
    for (const listener of listeners) {
      try {
        listener(open);
      } catch (error) {
        console.error('[MenuState] Listener failed', error);
      }
    }
  }

  function setOpen(next, { silent = false } = {}) {
    const target = Boolean(next);
    if (open !== target) {
      open = target;
      apply();
      if (!silent) {
        notify();
      }
    } else {
      // Даже при отсутствии изменения состояния обновляем DOM,
      // чтобы синхронизировать aria-атрибуты после изменений layout.
      apply();
    }
    return open;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => { };
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function syncFromDom({ silent = false } = {}) {
    const target = Boolean(body?.classList.contains('menu-open'));
    const changed = target !== open;
    open = target;
    apply();
    if (changed && !silent) {
      notify();
    }
    return open;
  }

  apply();

  return {
    isOpen: () => open,
    setOpen,
    open: (options) => setOpen(true, options),
    close: (options) => setOpen(false, options),
    toggle: (options) => setOpen(!open, options),
    subscribe,
    sync: syncFromDom,
    refreshHandles: syncHandles,
  };
}

// Debug mode: установите в true для вывода информации о режимах в консоль
// Включите в Safari Dev Tools: window.DEBUG_MODE_DETECTION = true
const DEBUG_MODE_DETECTION = window.DEBUG_MODE_DETECTION || false;

// Debug: toggle flyout diagnostics via window.DEBUG_FLYOUT (defaults to false)
const DEBUG_FLYOUT = typeof window.DEBUG_FLYOUT === 'boolean' ? window.DEBUG_FLYOUT : false;
const flyoutLogger = (typeof window.DEBUG_FLYOUT_LOGGER === 'object' && window.DEBUG_FLYOUT_LOGGER)
  ? window.DEBUG_FLYOUT_LOGGER
  : console;

const MAX_FLYOUT_TRACE = 25;
const flyoutInitTimeline = [];
const setActiveSectionTimeline = [];

let setActiveSectionBridge = null;
let capturedOriginalSetActive = false;
let originalSetActiveSection = null;
let lastExternalSetActiveSection = null;
const setActiveSectionListeners = new Map();
let setActiveSectionListenerSeq = 0;
let scrollLockOffset = 0;
let skipNextScrollForDocking = false; // Skip first scroll after menu unlock to prevent jump

function logFlyout(...args) {
  if (!DEBUG_FLYOUT) return;
  if (typeof flyoutLogger?.log === 'function') {
    flyoutLogger.log(...args);
  }
}

function captureCallStack(limit = 5) {
  try {
    throw new Error('stack-capture');
  } catch (error) {
    if (!error?.stack) return undefined;
    return error.stack
      .split('\n')
      .slice(2, 2 + limit)
      .map((line) => line.trim());
  }
}

function pushFlyoutTrace(storage, entry) {
  storage.push(entry);
  while (storage.length > MAX_FLYOUT_TRACE) {
    storage.shift();
  }
  return entry;
}

function recordFlyoutInit(details = {}) {
  const entry = pushFlyoutTrace(flyoutInitTimeline, {
    timestamp: Date.now(),
    mode: currentMode,
    sections: sections.length,
    ...details,
    stack: captureCallStack(6),
  });
  logFlyout('[FLYOUT] init trace', entry);
  return entry;
}

function recordSetActiveEvent(type, details = {}) {
  const entry = pushFlyoutTrace(setActiveSectionTimeline, {
    type,
    timestamp: Date.now(),
    ...details,
    stack: captureCallStack(6),
  });
  logFlyout('[FLYOUT] setActiveSection event', entry);
  return entry;
}

function ensureSetActiveSectionBridge(reason) {
  const currentGlobal = typeof window.setActiveSection === 'function'
    ? window.setActiveSection
    : null;

  if (!capturedOriginalSetActive) {
    capturedOriginalSetActive = true;
    originalSetActiveSection = currentGlobal;
    recordSetActiveEvent('capture-original', {
      reason,
      hasOriginal: Boolean(currentGlobal),
      name: currentGlobal?.name || null,
    });
  }

  if (currentGlobal && currentGlobal !== setActiveSectionBridge && currentGlobal !== originalSetActiveSection) {
    lastExternalSetActiveSection = currentGlobal;
    recordSetActiveEvent('external-override-detected', {
      reason,
      name: currentGlobal?.name || null,
    });
  }

  const base = lastExternalSetActiveSection || originalSetActiveSection || setActiveSection;

  if (!setActiveSectionBridge) {
    setActiveSectionBridge = function bridgedSetActiveSection(id) {
      if (typeof setActiveSectionBridge.base === 'function') {
        try {
          setActiveSectionBridge.base(id);
        } catch (error) {
          console.error('[FLYOUT] base setActiveSection invocation failed', error);
        }
      }

      recordSetActiveEvent('invoke', { id });

      for (const listener of setActiveSectionListeners.values()) {
        try {
          listener.callback(id);
          recordSetActiveEvent('listener-invoke', { label: listener.label, id });
        } catch (error) {
          console.error('[FLYOUT] setActiveSection listener failed', { label: listener.label, error });
        }
      }
    };
    setActiveSectionBridge.base = base;
  } else {
    setActiveSectionBridge.base = base;
  }

  if (window.setActiveSection !== setActiveSectionBridge) {
    try {
      window.setActiveSection = setActiveSectionBridge;
      recordSetActiveEvent('bridge-apply', {
        reason,
        baseName: base?.name || null,
      });
    } catch (error) {
      console.error('[FLYOUT] Failed to apply setActiveSection bridge', error);
      recordSetActiveEvent('bridge-apply-error', {
        reason,
        error: error?.message || String(error),
      });
    }
  } else {
    recordSetActiveEvent('bridge-refresh', {
      reason,
      baseName: base?.name || null,
    });
  }

  return base;
}

function releaseSetActiveSectionBridge(reason) {
  if (!setActiveSectionBridge) return;

  if (setActiveSectionListeners.size > 0) {
    recordSetActiveEvent('bridge-retained', { reason, listeners: setActiveSectionListeners.size });
    return;
  }

  if (window.setActiveSection === setActiveSectionBridge) {
    const restoreTarget = lastExternalSetActiveSection || originalSetActiveSection;
    if (restoreTarget) {
      window.setActiveSection = restoreTarget;
    } else {
      try {
        delete window.setActiveSection;
      } catch (error) {
        window.setActiveSection = undefined;
      }
    }
    recordSetActiveEvent('bridge-release', { reason, restored: Boolean(restoreTarget) });
  } else {
    recordSetActiveEvent('bridge-release-skipped', { reason, replaced: true });
  }

  if (setActiveSectionListeners.size === 0) {
    setActiveSectionBridge = null;
  }
}

function addSetActiveSectionListener(label, callback) {
  if (typeof callback !== 'function') {
    return () => { };
  }

  ensureSetActiveSectionBridge(`listener:${label}`);

  const id = ++setActiveSectionListenerSeq;
  setActiveSectionListeners.set(id, { label, callback });
  recordSetActiveEvent('listener-register', { label, id });

  return () => {
    if (!setActiveSectionListeners.has(id)) return;
    setActiveSectionListeners.delete(id);
    recordSetActiveEvent('listener-unregister', { label, id });
    releaseSetActiveSectionBridge(`listener:${label}:dispose`);
  };
}

function describeSetActiveSectionBridge() {
  return {
    hasBridge: Boolean(setActiveSectionBridge),
    listeners: Array.from(setActiveSectionListeners.values()).map((listener) => listener.label),
    capturedOriginal: capturedOriginalSetActive,
    hasOriginal: Boolean(originalSetActiveSection),
    hasExternal: Boolean(lastExternalSetActiveSection),
  };
}
let layoutMetricsRaf = null;
let modeUpdateRaf = null;
let lastVisualViewportWidth = null;
let lastVisualViewportHeight = null;
let visualViewportListenersBound = false;

function pickReadingContainer() {
  const selectors = [
    '.text-box',
    '.article__content',
    'main article',
    'article',
    '.article',
    '.content',
    '#content',
    'main',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return { element, selector, matchedTextBox: selector === '.text-box' };
    }
  }

  return { element: document.body, selector: 'body', matchedTextBox: false };
}

function getOverflowY(element) {
  if (!element) return 'visible';
  try {
    const styles = getComputedStyle(element);
    return styles.overflowY || styles.overflow || 'visible';
  } catch (error) {
    console.warn('[ProgressWidget] Failed to read overflowY', { error, element });
    return 'visible';
  }
}

function findScrollContainer(startElement) {
  let current = startElement;

  while (current && current !== document.body && current !== document.documentElement) {
    const overflowY = getOverflowY(current);
    const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') &&
      current.scrollHeight > current.clientHeight + 1;

    if (isScrollable) {
      return { element: current, mode: 'element' };
    }

    current = current.parentElement;
  }

  const fallback = document.scrollingElement || document.documentElement || window;
  return { element: fallback, mode: 'document' };
}

const APP_GLOBAL_KEY = '__TOOSMART_APP__';

function createResourceDiagnostics() {
  const activeResources = new Map();
  const recentDisposals = [];
  let resourceCounter = 0;

  const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());

  function register(meta = {}) {
    const id = ++resourceCounter;
    const entry = {
      id,
      createdAt: now(),
      disposedAt: null,
      meta: { ...meta },
    };

    activeResources.set(id, entry);
    let released = false;

    function release(extraMeta) {
      if (released) return;
      released = true;
      if (extraMeta && typeof extraMeta === 'object') {
        entry.meta = { ...entry.meta, ...extraMeta };
      }
      entry.disposedAt = now();
      activeResources.delete(id);
      recentDisposals.push({ ...entry });
      if (recentDisposals.length > 40) {
        recentDisposals.shift();
      }
    }

    function updateMeta(update) {
      if (!update || typeof update !== 'object') return;
      entry.meta = { ...entry.meta, ...update };
    }

    return {
      id,
      release,
      updateMeta,
      get meta() {
        return entry.meta;
      },
    };
  }

  function snapshot() {
    const resources = Array.from(activeResources.values()).map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      meta: { ...entry.meta },
    }));
    const byKind = resources.reduce((acc, entry) => {
      const kind = entry.meta?.kind || 'unknown';
      acc[kind] = (acc[kind] || 0) + 1;
      return acc;
    }, {});

    return {
      total: resources.length,
      byKind,
      resources,
      recentDisposals: recentDisposals.slice(-10),
      timestamp: now(),
    };
  }

  function logSnapshot(label = 'Active resources') {
    const snap = snapshot();
    const currentNow = now();
    console.groupCollapsed(`[Diagnostics] ${label}: ${snap.total}`);
    if (snap.resources.length) {
      const tableData = snap.resources.map((entry) => {
        const meta = entry.meta || {};
        return {
          id: entry.id,
          kind: meta.kind ?? 'unknown',
          label: meta.label ?? meta.event ?? meta.target ?? '-',
          lifecycle: meta.lifecycle ?? 'n/a',
          ageMs: Math.round(currentNow - entry.createdAt),
        };
      });
      console.table(tableData);
    } else {
      console.log('No active resources.');
    }
    console.log('[Diagnostics] Count by kind', snap.byKind);
    if (snap.recentDisposals.length) {
      const recent = snap.recentDisposals.map((entry) => ({
        id: entry.id,
        kind: entry.meta?.kind ?? 'unknown',
        lifecycle: entry.meta?.lifecycle ?? 'n/a',
        releasedAgoMs: entry.disposedAt ? Math.round(currentNow - entry.disposedAt) : null,
      }));
      console.log('[Diagnostics] Recent disposals', recent);
    }
    console.groupEnd();
    return snap;
  }

  return {
    register,
    snapshot,
    logSnapshot,
    getActiveCount() {
      return activeResources.size;
    },
  };
}

const resourceDiagnostics = createResourceDiagnostics();

function createLifecycleRegistry(label) {
  const records = [];

  function track(disposer, meta = {}) {
    if (typeof disposer !== 'function') {
      return () => { };
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
  if (typeof disposer !== 'function') {
    return () => { };
  }

  const lifecycle = getActiveLifecycle();
  const normalizedMeta = meta && typeof meta === 'object' ? meta : {};
  const tracker = resourceDiagnostics.register({
    ...normalizedMeta,
    lifecycle: lifecycle?.label ?? 'detached',
  });

  function safelyDispose(contextLabel) {
    try {
      disposer?.();
    } catch (error) {
      console.error(`[Lifecycle] Disposer failed${contextLabel ? ` (${contextLabel})` : ''}`, {
        meta,
        error,
      });
    } finally {
      tracker.release();
    }
  }

  if (!lifecycle) {
    return () => safelyDispose('outside lifecycle');
  }

  return lifecycle.track(() => safelyDispose(), { ...normalizedMeta, resourceId: tracker.id });
}

function trackEvent(target, type, handler, options, meta = {}) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => { };
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
    return () => { };
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
    return () => { };
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
    return () => { };
  }

  return registerLifecycleDisposer(() => {
    observer.disconnect();
  }, {
    kind: 'observer',
    ...meta,
  });
}

function createLazyFeatureManager(options = {}) {
  const features = new Map();
  const elementStates = new Map();
  let observedElements = new WeakSet();
  let observer = null;

  const supportsIntersectionObserver = typeof window !== 'undefined'
    && typeof window.IntersectionObserver === 'function';
  let fallbackWarningShown = false;

  const threshold = Array.isArray(options.threshold) || typeof options.threshold === 'number'
    ? options.threshold
    : 0.2;
  const rootMargin = typeof options.rootMargin === 'string'
    ? options.rootMargin
    : '0px 0px -10% 0px';

  function parseTokens(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return [];
    }
    return value
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function ensureObserver() {
    if (!supportsIntersectionObserver) {
      return null;
    }
    if (observer) {
      return observer;
    }
    observer = new IntersectionObserver(handleEntries, {
      threshold,
      rootMargin,
    });
    return observer;
  }

  function handleEntries(entries) {
    for (const entry of entries) {
      const tokens = parseTokens(entry.target?.dataset?.lazy);
      if (tokens.length === 0) {
        continue;
      }

      let featureMap = elementStates.get(entry.target);
      if (!featureMap) {
        featureMap = new Map();
        elementStates.set(entry.target, featureMap);
      }

      for (const id of tokens) {
        const feature = features.get(id);
        if (!feature) {
          continue;
        }

        let state = featureMap.get(id);
        if (!state) {
          state = { active: false, cleanup: null };
          featureMap.set(id, state);
        }

        if (entry.isIntersecting) {
          if (state.active) {
            continue;
          }
          state.active = true;
          let cleanup = null;
          try {
            cleanup = feature.onEnter?.({
              id,
              element: entry.target,
              entry,
            });
          } catch (error) {
            console.error('[LazyFeatures] Activation failed', { id, error });
          }
          state.cleanup = typeof cleanup === 'function' ? cleanup : null;
        } else if (state.active) {
          if (feature?.sticky) {
            continue;
          }
          state.active = false;
          if (typeof feature.onExit === 'function') {
            try {
              feature.onExit({
                id,
                element: entry.target,
                entry,
                cleanup: state.cleanup,
              });
            } catch (error) {
              console.error('[LazyFeatures] onExit handler failed', { id, error });
            }
          }
          if (typeof state.cleanup === 'function') {
            try {
              state.cleanup();
            } catch (error) {
              console.error('[LazyFeatures] Cleanup failed', { id, error });
            }
          }
          featureMap.delete(id);
          if (featureMap.size === 0) {
            elementStates.delete(entry.target);
          }
          state.cleanup = null;
        }
      }
    }
  }

  function activateElementFeaturesImmediately(element) {
    const tokens = parseTokens(element?.dataset?.lazy);
    if (tokens.length === 0) {
      return;
    }

    if (!fallbackWarningShown) {
      fallbackWarningShown = true;
      console.warn('[LazyFeatures] IntersectionObserver is not supported — activating features immediately');
    }

    let featureMap = elementStates.get(element);
    if (!featureMap) {
      featureMap = new Map();
      elementStates.set(element, featureMap);
    }

    for (const id of tokens) {
      const feature = features.get(id);
      if (!feature) {
        continue;
      }

      const state = featureMap.get(id);
      if (state?.active) {
        continue;
      }

      let cleanup = null;
      try {
        cleanup = feature.onEnter?.({
          id,
          element,
          entry: null,
        });
      } catch (error) {
        console.error('[LazyFeatures] Activation failed (fallback)', { id, error });
      }

      featureMap.set(id, {
        active: true,
        cleanup: typeof cleanup === 'function' ? cleanup : null,
      });
    }
  }

  function observeElement(element) {
    if (!(element instanceof Element)) {
      return;
    }
    if (observedElements.has(element)) {
      return;
    }
    observedElements.add(element);
    const io = ensureObserver();
    if (io) {
      io.observe(element);
      return;
    }

    activateElementFeaturesImmediately(element);
  }

  function register(id, handlers = {}) {
    if (!id) {
      return () => { };
    }
    features.set(id, handlers);

    if (!supportsIntersectionObserver) {
      for (const element of elementStates.keys()) {
        const tokens = parseTokens(element?.dataset?.lazy);
        if (tokens.includes(id)) {
          activateElementFeaturesImmediately(element);
        }
      }
    }

    return () => {
      features.delete(id);
    };
  }

  function observeAll(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }
    root.querySelectorAll('[data-lazy]').forEach((element) => observeElement(element));
  }

  function disconnect() {
    if (observer) {
      observer.disconnect();
    }
    for (const [element, featureMap] of elementStates.entries()) {
      for (const [id, state] of featureMap.entries()) {
        if (state.active && typeof state.cleanup === 'function') {
          try {
            state.cleanup();
          } catch (error) {
            console.error('[LazyFeatures] Cleanup during disconnect failed', { id, error });
          }
        }
      }
    }
    elementStates.clear();
    observedElements = new WeakSet();
    observer = null;
  }

  return {
    register,
    observeAll,
    observeElement,
    disconnect,
  };
}

const lazyFeatures = createLazyFeatureManager({
  threshold: [0, 0.2], // Safari fix: массив гарантирует срабатывание callback
  rootMargin: '0px 0px -10% 0px',
});

function createMetricsOverlay(diagnostics) {
  const overlay = document.createElement('div');
  overlay.dataset.devOverlay = 'resource-metrics';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '9999',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '8px',
    fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    pointerEvents: 'none',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
    minWidth: '160px',
    whiteSpace: 'nowrap',
    opacity: '0',
    transition: 'opacity 120ms ease-in-out',
  });
  overlay.hidden = true;

  const fpsLine = document.createElement('div');
  const frameLine = document.createElement('div');
  const resourceLine = document.createElement('div');

  overlay.appendChild(fpsLine);
  overlay.appendChild(frameLine);
  overlay.appendChild(resourceLine);

  let mounted = false;
  let enabled = false;
  let rafId = null;
  const getNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());
  let lastFrame = getNow();
  let lastFpsSample = lastFrame;
  let frameCounter = 0;
  let fps = 0;
  let avgFrame = 0;

  const targetFrame = 1000 / 60;

  function ensureMounted() {
    if (mounted) return;

    const mount = () => {
      if (!document.body || mounted) return;
      document.body.appendChild(overlay);
      mounted = true;
    };

    if (document.body) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    }
  }

  function render(now) {
    const delta = now - lastFrame;
    lastFrame = now;
    frameCounter += 1;
    avgFrame = avgFrame ? avgFrame * 0.85 + delta * 0.15 : delta;

    if (now - lastFpsSample >= 500) {
      fps = Math.round((frameCounter * 1000) / (now - lastFpsSample));
      frameCounter = 0;
      lastFpsSample = now;
    }

    const busyRatio = Math.min(100, Math.max(0, (avgFrame / targetFrame) * 100));
    const snapshot = diagnostics?.snapshot();
    const resourceCount = snapshot?.total ?? 0;

    fpsLine.textContent = `FPS: ${String(fps).padStart(2, '0')}`;
    frameLine.textContent = `Frame: ${avgFrame.toFixed(1)}ms (${busyRatio.toFixed(0)}% load)`;
    if (snapshot) {
      const kinds = Object.entries(snapshot.byKind || {})
        .map(([kind, count]) => `${kind}:${count}`)
        .join(' ');
      resourceLine.textContent = `Resources: ${resourceCount}${kinds ? ` [${kinds}]` : ''}`;
    } else {
      resourceLine.textContent = `Resources: n/a`;
    }
  }

  function loop(now) {
    render(now);
    if (enabled) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function start() {
    if (enabled) return;
    ensureMounted();
    enabled = true;
    overlay.hidden = false;
    overlay.style.opacity = '1';
    lastFrame = getNow();
    lastFpsSample = lastFrame;
    frameCounter = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (!enabled) return;
    enabled = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    overlay.style.opacity = '0';
    overlay.hidden = true;
  }

  function toggle() {
    if (enabled) {
      stop();
    } else {
      start();
    }
    return enabled;
  }

  return {
    start,
    stop,
    toggle,
    isActive: () => enabled,
    element: overlay,
  };
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

function updateLayoutMetrics(pwRoot = progressWidgetRoot) {
  const headerHeight = header?.offsetHeight ?? 0;
  const stackOffset = Math.max(0, headerHeight + 16);
  root.style.setProperty('--stack-top', `${stackOffset}px`);
  const scrollMargin = Math.max(0, headerHeight + 24);
  root.style.setProperty('--section-scroll-margin', `${scrollMargin}px`);

  // Вычисление footprint для Progress Widget
  const widgetRoot = pwRoot instanceof HTMLElement ? pwRoot : progressWidgetRoot;
  if (!(widgetRoot instanceof HTMLElement)) {
    progressWidgetRoot = null;
    return;
  }

  progressWidgetRoot = widgetRoot;

  const styles = window.getComputedStyle(widgetRoot);
  let footprint = widgetRoot.offsetHeight;

  if (styles.position === 'sticky') {
    footprint += parseCssNumber(styles.bottom);
  } else {
    footprint += parseCssNumber(styles.marginBottom);
  }

  if (body.dataset.mode === 'mobile') {
    updateProgressWidgetFloatingAnchors(widgetRoot);
  } else {
    widgetRoot.style.removeProperty('--pw-float-left');
    widgetRoot.style.removeProperty('--pw-float-bottom');
  }

  footprint = Math.max(0, Math.round(footprint));
  root.style.setProperty('--pw-footprint', `${footprint}px`);

  updateStackInlineState();
}

let stackTransitionLock = false;
let stackDebounceTimer = null;

function updateStackInlineState() {
  // Debounce: delay execution until resize/scroll events stop
  clearTimeout(stackDebounceTimer);
  stackDebounceTimer = setTimeout(() => {
    updateStackInlineStateImpl();
  }, 100);
}

function updateStackInlineStateImpl() {
  const stack = document.querySelector('.stack');
  if (!stack) return;

  // Ignore calls during transition to prevent layout feedback loop
  if (stackTransitionLock) return;

  const isDesktop = currentMode === 'desktop' || currentMode === 'desktop-wide';
  if (!isDesktop) {
    if (lastStackInline) {
      stack.classList.remove('stack--inline');
      lastStackInline = false;
    }
    return;
  }

  const textBox = document.querySelector('.text-box');
  if (!textBox) return;

  // Используем реальные размеры из DOM вместо парсинга CSS переменных
  const viewportWidth = document.documentElement.clientWidth;
  const textBoxRect = textBox.getBoundingClientRect();

  // Вычисляем доступное пространство справа от текстового блока
  const availableRight = viewportWidth - textBoxRect.right;

  // Получаем минимальную ширину стека (или 220px по умолчанию)
  const styles = window.getComputedStyle(stack);
  const minStackWidth = parseCssNumber(styles.minWidth) || 220;

  const separation = 20; // отступ от текста
  const rightPadding = 10; // минимальный отступ от правого края
  const hysteresis = 80; // буфер для предотвращения дребезга

  const requiredSpace = minStackWidth + separation + rightPadding;
  const threshold = lastStackInline ? requiredSpace + hysteresis : requiredSpace;

  const shouldInline = availableRight < threshold;

  console.log('[StackDebug]', {
    viewportWidth,
    textBoxRight: textBoxRect.right,
    availableRight,
    minStackWidth,
    requiredSpace,
    threshold,
    shouldInline,
    lastStackInline
  });

  if (shouldInline !== lastStackInline) {
    stack.classList.toggle('stack--inline', shouldInline);
    // Don't manually toggle stack--mobile - let carousel handle it via isMobileMode()
    lastStackInline = shouldInline;

    // Lock transitions for 250ms to allow layout to stabilize
    stackTransitionLock = true;
    setTimeout(() => {
      stackTransitionLock = false;
    }, 250);
  }
}

let lastProgressWidgetAnchors = null;

function updateProgressWidgetFloatingAnchors(pwRoot) {
  if (!(pwRoot instanceof HTMLElement) || body.dataset.mode !== 'mobile') {
    return;
  }

  const anchorCandidates = [dockHandle, menuHandle].filter((node) => node instanceof HTMLElement);
  const anchor = anchorCandidates.find((node) => node.getClientRects().length > 0 && node.offsetWidth > 0);

  if (!anchor && lastProgressWidgetAnchors) {
    pwRoot.style.setProperty('--pw-float-left', `${lastProgressWidgetAnchors.left}px`);
    pwRoot.style.setProperty('--pw-float-bottom', `${lastProgressWidgetAnchors.bottom}px`);
    return;
  }
  if (!anchor) {
    return;
  }

  // Use visualViewport for stable positioning when mobile browser bars show/hide
  const viewport = (() => {
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
      const layoutHeight = window.innerHeight || document.documentElement?.clientHeight || vv.height;
      const safeBottom = Math.max(0, layoutHeight - (vv.height + (vv.offsetTop || 0)));
      return {
        width: vv.width,
        height: vv.height,
        offsetLeft: vv.offsetLeft || 0,
        offsetTop: vv.offsetTop || 0,
        safeBottom,
      };
    }
    return {
      width: window.innerWidth || document.documentElement?.clientWidth || 0,
      height: window.innerHeight || document.documentElement?.clientHeight || 0,
      offsetLeft: 0,
      offsetTop: 0,
      safeBottom: 0,
    };
  })();

  const anchorRect = anchor.getBoundingClientRect();
  const styles = window.getComputedStyle(pwRoot);
  const widgetHeight = pwRoot.offsetHeight || parseCssNumber(styles.height) || parseCssNumber(styles.getPropertyValue('--pw-pill-height')) || 0;
  const widgetWidth = pwRoot.offsetWidth || parseCssNumber(styles.width) || parseCssNumber(styles.getPropertyValue('--pw-pill-width')) || 0;

  if (viewport.width > 0 && anchorRect.width > 0) {
    const maxLeft = Math.max(
      0,
      Math.min(anchorRect.left + viewport.offsetLeft, viewport.width - widgetWidth)
    );
    pwRoot.style.setProperty('--pw-float-left', `${Math.round(maxLeft)}px`);
  }

  if (viewport.height > 0) {
    const gap = 10;
    const verticalOffset = 67; // Position widget 67px ABOVE the anchor button
    const anchorBottom = anchorRect.bottom + viewport.offsetTop;
    const anchorHeight = anchorRect.height || 0;
    const baseBottom = Math.max(
      gap,
      Math.round(viewport.height - anchorBottom + ((anchorHeight - widgetHeight) / 2 || 0)) + verticalOffset
    );
    const bottom = Math.max(gap, baseBottom + viewport.safeBottom);
    pwRoot.style.setProperty('--pw-float-bottom', `${bottom}px`);
  }

  lastProgressWidgetAnchors = {
    left: parseCssNumber(pwRoot.style.getPropertyValue('--pw-float-left')),
    bottom: parseCssNumber(pwRoot.style.getPropertyValue('--pw-float-bottom')),
  };
}

function requestLayoutMetricsUpdate({ force = false, modeChanged = false, viewportChanged = false, elementChanged = false } = {}) {
  if (!force && !modeChanged && !viewportChanged && !elementChanged) {
    return false;
  }

  scheduleLayoutMetricsUpdate();
  return true;
}

function scheduleLayoutMetricsUpdate() {
  // Первый расчёт — сразу, чтобы sticky позиции применились до первого кадра
  if (!layoutMetricsInitialized) {
    updateLayoutMetrics(progressWidgetRoot);
    layoutMetricsInitialized = true;
    return;
  }

  if (layoutMetricsRaf !== null) return;
  layoutMetricsRaf = requestAnimationFrame(() => {
    layoutMetricsRaf = null;
    updateLayoutMetrics(progressWidgetRoot);
  });
}

function normalizeViewportDimension(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 1000);
}

function updateVisualViewportSize(viewport) {
  if (!viewport) {
    return false;
  }

  const width = normalizeViewportDimension(viewport.width);
  const height = normalizeViewportDimension(viewport.height);

  if (width === lastVisualViewportWidth && height === lastVisualViewportHeight) {
    return false;
  }

  lastVisualViewportWidth = width;
  lastVisualViewportHeight = height;
  return true;
}

function recordViewportGeometry(viewport) {
  const changed = updateVisualViewportSize(viewport);
  if (changed) {
    viewportGeometryDirty = true;
  }
  return changed;
}

function syncScrollHideMode() {
  if (typeof scrollHideControls.setMode === 'function') {
    // Хедер скрываем только на мобильных
    const shouldEnable = currentMode === 'mobile';
    scrollHideControls.setMode(shouldEnable);
  }
}

/**
 * Обновляет режим верстки (data-mode) и тип ввода (data-input)
 */
function updateMode() {
  const nextInput = detectInput();
  const nextMode = detectMode(nextInput);
  const prevMode = currentMode;
  const prevInput = currentInput;

  const modeChanged = prevMode !== nextMode;
  const inputChanged = prevInput !== nextInput;

  if (!modeChanged && !inputChanged) {
    return { modeChanged, inputChanged };
  }

  currentMode = nextMode;
  currentInput = nextInput;
  body.dataset.mode = nextMode;
  body.dataset.input = nextInput;

  syncScrollHideMode();

  if (window.DEBUG_MODE_DETECTION) {
    if (modeChanged || inputChanged) {
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
    }
  }

  if (modeChanged) {
    // Полный сброс всех состояний при смене режима
    body.classList.remove('is-slid');
    menuState.setOpen(false, { silent: true });

    // Сброс атрибутов меню
    if (siteMenu) {
      siteMenu.removeAttribute('role');
      siteMenu.removeAttribute('aria-modal');
    }

    // Отключение trap
    detachTrap();

    // Восстановление фокуса если был сохранен
    if (previousFocus && document.body.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
      previousFocus = null;
    }

    if (dotsFeatureActive) {
      configureDots();
      initDotsFlyout(); // Обновляем flyout при смене режима
    }

    // Управление edge-gesture lifecycle
    detachEdgeGesture();
    attachEdgeGesture();

    // Принудительный reflow для применения изменений
    void body.offsetHeight;
  }

  menuState.refreshHandles();

  lockScroll();
  // updateRailClosedWidth() больше не нужна - --rail-closed вычисляется через CSS calc()

  return { modeChanged, inputChanged };
}

function teardownObserver() {
  if (typeof observerDisposer === 'function') {
    try {
      observerDisposer();
    } catch (error) {
      console.error('[Observer] Failed to dispose section observer', error);
    }
  }
  observerDisposer = () => { };
  observer = null;

  // Отменяем все pending RAF для предотвращения утечек памяти
  if (layoutMetricsRaf !== null) {
    cancelAnimationFrame(layoutMetricsRaf);
    layoutMetricsRaf = null;
  }
}

function configureDots() {
  if (!dotsFeatureActive) {
    teardownObserver();
    if (dotsRail) {
      clearElement(dotsRail);
      dotsRail.hidden = true;
    }
    return;
  }
  refreshSectionsFromLabels();
  if (!dotsRail) return;
  clearElement(dotsRail);
  const shouldEnable = (currentMode === 'desktop' || currentMode === 'desktop-wide') && sections.length >= 1;
  dotsRail.hidden = !shouldEnable;
  if (!shouldEnable) {
    teardownObserver();
    return;
  }
  sections.forEach((section) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dots-rail__dot';
    const label = section.dataset.section || section.textContent?.trim() || section.id;
    if (label) {
      dot.setAttribute('aria-label', label);
    }
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
  observerDisposer = trackObserver(observer, {
    label: 'section-progress',
    target: '.section-label',
  });
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
    scrollHideControls.suppress(true);
  }

  body.classList.remove('is-slid');
  menuState.setOpen(true);

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
  lockScroll();
  return true;
}

function closeMenu({ focusOrigin = menuHandle } = {}) {
  if (!isMenuAvailable()) {
    return false;
  }

  menuState.setOpen(false);
  body.classList.remove('is-slid');
  if (siteMenu) {
    siteMenu.removeAttribute('role');
    siteMenu.removeAttribute('aria-modal');
  }
  detachTrap();
  lockScroll();
  if (currentMode === 'mobile' || currentMode === 'tablet') {
    scrollHideControls.suppress(false);
  }
  if (previousFocus) {
    previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  } else if (focusOrigin && focusOrigin instanceof HTMLElement) {
    focusOrigin.focus({ preventScroll: true });
  }
  return true;
}

function toggleMenu(origin) {
  if (!isMenuAvailable()) {
    return false;
  }

  if (menuState.isOpen()) {
    return closeMenu({ focusOrigin: origin });
  } else {
    return openMenu({ focusOrigin: origin });
  }
}

function lockScroll() {
  const shouldLock = body.classList.contains('menu-open');
  const isLocked = body.dataset.lock === 'scroll';

  if (shouldLock && !isLocked) {
    // Lock: just set data attribute, CSS handles the rest
    // No position:fixed = no visual jump
    body.dataset.lock = 'scroll';
    root.dataset.lock = 'scroll';
  } else if (!shouldLock && isLocked) {
    // Unlock: just remove data attribute
    // No scrollTo needed = no visual jump
    delete body.dataset.lock;
    delete root.dataset.lock;
  }
}

function initDots() {
  if (!dotsFeatureActive) {
    return;
  }
  configureDots();
  setupContentBoundaryObserver();
}

/**
 * Установка observer для скрытия dots-rail когда контент уходит из viewport
 */
function setupContentBoundaryObserver() {
  // Очистка предыдущего observer
  if (contentBoundaryObserver) {
    contentBoundaryObserver.disconnect();
    contentBoundaryObserver = null;
  }

  if (!dotsRail) return;

  // Пропускаем если не в desktop режиме
  if (currentMode !== 'desktop' && currentMode !== 'desktop-wide') {
    dotsRail.classList.remove('is-fading');
    return;
  }

  // Проверка поддержки IntersectionObserver
  if (!('IntersectionObserver' in window)) {
    return;
  }

  // Ищем контейнер контента
  // Берём тот .content-body, который реально содержит section-label (основной текст),
  // иначе — последний .content-body на странице, иначе — .text-box.
  const allBodies = Array.from(document.querySelectorAll('.content-body'));
  const bodyWithSections = allBodies.find(body => body.querySelector('.section-label'));
  const contentBody = bodyWithSections || allBodies[allBodies.length - 1] || document.querySelector('.text-box');
  if (!contentBody) {
    return;
  }

  const updateDotsFade = () => {
    if (!contentBody || !dotsRail) return;
    const viewportHeight = window.innerHeight || root.clientHeight || 0;
    const rect = contentBody.getBoundingClientRect();
    const hide = rect.bottom <= viewportHeight - 10; // низ контента выше на 10px от низа вьюпорта
    dotsRail.classList.toggle('is-fading', hide);
  };

  // rAF-троттлинг для scroll/resize
  let fadeScheduled = false;
  const scheduleFadeUpdate = () => {
    if (fadeScheduled) return;
    fadeScheduled = true;
    requestAnimationFrame(() => {
      fadeScheduled = false;
      updateDotsFade();
    });
  };

  contentBoundaryObserver = new IntersectionObserver(
    () => updateDotsFade(),
    {
      root: null,
      rootMargin: '0px 0px -10px 0px', // линия сдвинута на 10px от низа
      threshold: 0
    }
  );

  contentBoundaryObserver.observe(contentBody);
  updateDotsFade();

  // Следим за скроллом/resize, чтобы состояние обновлялось постоянно
  trackEvent(window, 'scroll', scheduleFadeUpdate, { passive: true }, { module: 'dotsRail', target: 'window' });
  trackEvent(window, 'resize', scheduleFadeUpdate, { passive: true }, { module: 'dotsRail', target: 'window' });

  registerLifecycleDisposer(() => {
    if (contentBoundaryObserver) {
      contentBoundaryObserver.disconnect();
      contentBoundaryObserver = null;
    }
  }, { module: 'dotsRail', kind: 'observer', detail: 'content boundary' });
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
  if (!dotsFeatureActive) {
    if (typeof flyoutSetActiveDisposer === 'function') {
      try {
        flyoutSetActiveDisposer();
      } catch (error) {
        console.error('[FLYOUT] Failed to dispose setActiveSection listener during idle state', error);
      }
    }
    flyoutSetActiveDisposer = null;
    detachFlyoutListeners();
    if (dotFlyout) {
      clearElement(dotFlyout);
      dotFlyout.setAttribute('hidden', '');
      dotFlyout.classList.add('is-hidden');
    }
    releaseSetActiveSectionBridge('dotsFlyout.lazy-inactive');
    return;
  }

  refreshSectionsFromLabels();
  logFlyout('[FLYOUT] initDotsFlyout START', {
    dotsRail: !!dotsRail,
    dotFlyout: !!dotFlyout,
    currentMode,
    sectionsLength: sections.length
  });

  recordFlyoutInit({
    mode: currentMode,
    sections: sections.length,
  });

  if (!dotsRail || !dotFlyout) {
    console.error('[FLYOUT] ERROR: dotsRail or dotFlyout not found!', {
      dotsRail: !!dotsRail,
      dotFlyout: !!dotFlyout
    });
    return;
  }

  // Flyout показывается только в desktop/desktop-wide
  const shouldEnable = (currentMode === 'desktop' || currentMode === 'desktop-wide') && sections.length >= 1;

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
    dotFlyout.classList.add('is-hidden');
    detachFlyoutListeners();
    if (typeof flyoutSetActiveDisposer === 'function') {
      try {
        flyoutSetActiveDisposer();
      } catch (error) {
        console.error('[FLYOUT] Failed to detach setActiveSection listener while disabling', error);
      }
      flyoutSetActiveDisposer = null;
    }
    return;
  }

  // Построение списка разделов
  function buildFlyoutMenu() {
    clearElement(dotFlyout);

    let rendered = 0;

    sections.forEach((section, index) => {
      const sectionTitle = section.dataset.section || section.textContent?.trim() || '';
      if (!sectionTitle) return;

      if (!section.id) {
        section.id = `section-label-${index + 1}`;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dot-flyout__item';
      btn.dataset.index = String(rendered);
      btn.dataset.sectionId = section.id;
      btn.textContent = sectionTitle;
      btn.setAttribute('aria-controls', section.id);

      dotFlyout.appendChild(btn);
      rendered += 1;
    });

    logFlyout('[FLYOUT] Built menu with', rendered, 'items');
  }

  // Показ flyout с задержкой при закрытии
  function showFlyout() {
    logFlyout('[FLYOUT] ⭐ showFlyout called!');
    if (typeof flyoutHideTimeoutCancel === 'function') {
      flyoutHideTimeoutCancel();
      flyoutHideTimeoutCancel = null;
    }
    dotFlyout.removeAttribute('hidden');
    dotFlyout.classList.remove('is-hidden');
    logFlyout('[FLYOUT] hidden attribute removed and is-hidden class removed');
  }

  function hideFlyout() {
    logFlyout('[FLYOUT] hideFlyout called');
    if (typeof flyoutHideTimeoutCancel === 'function') {
      flyoutHideTimeoutCancel();
      flyoutHideTimeoutCancel = null;
    }
    flyoutHideTimeoutCancel = trackTimeout(() => {
      dotFlyout.setAttribute('hidden', '');
      dotFlyout.classList.add('is-hidden');
      flyoutHideTimeoutCancel = null;
      logFlyout('[FLYOUT] hidden attribute set and is-hidden class added');
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
    if (dotFlyout.hasAttribute('hidden') || dotFlyout.classList.contains('is-hidden')) return;

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
    if (dotFlyout.hasAttribute('hidden') || dotFlyout.classList.contains('is-hidden')) return;

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
  if (typeof flyoutSetActiveDisposer === 'function') {
    flyoutSetActiveDisposer();
  }

  flyoutSetActiveDisposer = addSetActiveSectionListener('dotsFlyout.active-sync', updateFlyoutActiveItem);

  registerLifecycleDisposer(() => {
    try {
      if (typeof flyoutSetActiveDisposer === 'function') {
        flyoutSetActiveDisposer();
      }
    } catch (error) {
      console.error('[FLYOUT] Failed to dispose setActiveSection listener', error);
    }
    flyoutSetActiveDisposer = null;
  }, { module: 'dotsFlyout', kind: 'global', detail: 'setActiveSection listener' });

  // Первоначальное обновление
  updateFlyoutActiveItem();

  registerLifecycleDisposer(() => {
    detachFlyoutListeners();
    if (dotFlyout) {
      dotFlyout.setAttribute('hidden', '');
      dotFlyout.classList.add('is-hidden');
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
 * Fallback для CSS :has() селектора (iOS 15, Safari <16)
 * Добавляет класс .text-section--before-paywall к секциям перед paywall
 */
function applyHasSelectorFallback() {
  // Проверяем поддержку :has() селектора
  let hasSupported = false;
  try {
    hasSupported = CSS.supports('selector(:has(+ *))');
  } catch (e) {
    hasSupported = false;
  }

  if (hasSupported) {
    if (DEBUG_MODE_DETECTION) {
      console.log('[FEATURE] CSS :has() supported ✓');
    }
    return;
  }

  if (DEBUG_MODE_DETECTION) {
    console.log('[FEATURE] CSS :has() not supported, applying JS fallback');
  }

  // Находим все .paywall-block элементы
  const paywallBlocks = document.querySelectorAll('.paywall-block');

  paywallBlocks.forEach((paywall) => {
    // Ищем предыдущий sibling .text-section
    let prev = paywall.previousElementSibling;
    while (prev) {
      if (prev.classList.contains('text-section')) {
        prev.classList.add('text-section--before-paywall');
        break;
      }
      prev = prev.previousElementSibling;
    }

    // Также проверяем случай когда paywall внутри #article-content
    const articleContent = paywall.closest('#article-content');
    if (articleContent) {
      let prevSection = articleContent.previousElementSibling;
      while (prevSection) {
        if (prevSection.classList.contains('text-section')) {
          prevSection.classList.add('text-section--before-paywall');
          break;
        }
        prevSection = prevSection.previousElementSibling;
      }
    }
  });
}

/**
 * Helper: обновляет режим и синхронизирует observer с layout
 */
function runModeUpdateFrame() {
  modeUpdateRaf = null;

  const { modeChanged } = updateMode();

  if (modeChanged) {
    if (dotsFeatureActive && (currentMode === 'desktop' || currentMode === 'desktop-wide')) {
      setupSectionObserver();
      initDotsFlyout(); // Пересоздаем flyout при переходе в desktop
    } else {
      teardownObserver();
      // Скрываем flyout в tablet/mobile или при неактивном состоянии
      if (dotFlyout) {
        dotFlyout.setAttribute('hidden', '');
        dotFlyout.classList.add('is-hidden');
      }
      if (dotsFeatureActive) {
        initDotsFlyout();
      }
    }
  }

  requestLayoutMetricsUpdate({
    force: !layoutMetricsInitialized,
    modeChanged,
    viewportChanged: viewportGeometryDirty,
  });
  viewportGeometryDirty = false;
}

function handleModeUpdate() {
  if (modeUpdateRaf !== null) {
    return;
  }

  modeUpdateRaf = requestAnimationFrame(runModeUpdateFrame);
}

function initMenuInteractions() {
  if (menuHandle) {
    trackEvent(menuHandle, 'click', () => toggleMenu(menuHandle), undefined, {
      module: 'menu.interactions',
    });
  }

  if (menuRail) {
    const stopBodyScrollFromMenu = (event) => {
      if (!(event?.target instanceof HTMLElement)) return;
      if (!body.classList.contains('menu-open')) return;
      if (!siteMenu || !siteMenu.contains(event.target)) return;
      // Перехватываем колесо/трекпад чтобы курсор над меню не скролил основной контент
      if (siteMenu && typeof event.deltaY === 'number') {
        const maxScroll = Math.max(0, siteMenu.scrollHeight - siteMenu.clientHeight);
        if (maxScroll > 0) {
          const before = siteMenu.scrollTop;
          const nextScroll = Math.min(maxScroll, Math.max(0, before + event.deltaY));
          siteMenu.scrollTop = nextScroll;
          // Блокируем только если реально скроллили меню, иначе позволяем прокручивать страницу
          if (nextScroll !== before) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
      }
    };

    trackEvent(menuRail, 'wheel', stopBodyScrollFromMenu, { passive: false }, {
      module: 'menu.interactions',
      target: describeTarget(menuRail),
      detail: 'scrollIsolation',
    });

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
      if (currentMode === 'mobile') {
        closeMenu({ focusOrigin: dockHandle || backdrop });
      }
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

function initStackCarousel() {
  const stack = document.querySelector('.stack');
  if (!stack) return;

  const deck = stack.querySelector('[data-stack-deck]');
  if (!deck) return;

  const mobileHint = stack.querySelector('[data-stack-mobile-hint]');
  const navButtons = Array.from(stack.querySelectorAll('[data-stack-prev], [data-stack-next]'));
  const dotsContainer = stack.querySelector('[data-stack-dots]');

  const RECOMMENDATIONS_URL = '/shared/recommendations.json';
  const AUTOPLAY_INTERVAL = 4000;

  let cardsData = [];
  let cardElements = [];
  let activeIndex = 0;
  let isHovered = false;
  let hoveredId = null;
  let autoplayDisposer = null;
  const pauseReasons = new Set();
  const disposers = [];
  const cardDisposers = [];
  let cleaned = false;

  const fallbackData = readCardsFromDom(deck);
  renderCards(fallbackData);

  fetch(RECOMMENDATIONS_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(recommendations => {
      const normalized = Array.isArray(recommendations)
        ? recommendations.map((rec, idx) => normalizeCard(rec, idx))
        : [];
      if (normalized.length > 0) {
        renderCards(normalized);
      } else {
        requestLayoutMetricsUpdate({ elementChanged: true });
      }
    })
    .catch(error => {
      console.warn('[StackCarousel] Не удалось загрузить рекомендации:', error);
      restartAutoplay();
      requestLayoutMetricsUpdate({ elementChanged: true });
    });

  function normalizeCover(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  function normalizeCard(rec, idx) {
    if (!rec) {
      return null;
    }
    const title = (rec.title || rec.name || '').trim();
    const description = (rec.description || rec.excerpt || '').trim();
    const slug = typeof rec.slug === 'string' ? rec.slug.trim() : '';
    const url = typeof rec.url === 'string' && rec.url
      ? rec.url
      : slug
        ? `/recommendations/${slug}.html`
        : '';
    const cover = normalizeCover(rec.cover || rec.emoji || rec.icon || rec.image || '');

    const id = slug || rec.id || `card-${idx}`;

    return {
      id,
      slug,
      title: title || slug || id || 'Рекомендация',
      description: description || '',
      cover,
      url,
    };
  }

  function readCardsFromDom(container) {
    if (!container) return [];
    const nodes = Array.from(container.querySelectorAll('[data-stack-card]'));
    if (!nodes.length) return [];

    return nodes.map((node, idx) => normalizeCard({
      id: node.dataset.cardId || node.dataset.slug,
      slug: node.dataset.slug,
      title: node.dataset.title || node.querySelector('.stack-card__title')?.textContent,
      description: node.dataset.description || node.querySelector('.stack-card__description')?.textContent,
      cover: node.dataset.cover || node.querySelector('.stack-card__emoji')?.textContent,
      url: node.dataset.url || (node instanceof HTMLAnchorElement ? node.getAttribute('href') : ''),
    }, idx)).filter(Boolean);
  }

  function cleanupCardListeners() {
    while (cardDisposers.length) {
      const dispose = cardDisposers.pop();
      try {
        dispose?.();
      } catch (error) {
        console.error('[StackCarousel] Failed to dispose card listener', error);
      }
    }
  }

  function renderCards(data) {
    cleanupCardListeners();
    clearElement(deck);

    const normalized = Array.isArray(data) ? data.map((item, idx) => normalizeCard(item, idx)).filter(Boolean) : [];
    cardsData = normalized;
    cardElements = [];

    if (!cardsData.length) {
      stack.classList.add('stack--empty');
      stack.style.display = 'none';
      stopAutoplay();
      renderDots();
      return;
    }

    stack.classList.remove('stack--empty');
    stack.style.display = '';

    cardsData.forEach((card, index) => {
      const element = createCardElement(card, index);
      cardElements.push(element);
      deck.appendChild(element);
    });

    activeIndex = 0;
    hoveredId = null;
    isHovered = false;
    renderDots();
    applyLayout();
    restartAutoplay();
    requestLayoutMetricsUpdate({ elementChanged: true });
  }

  function renderDots() {
    if (!dotsContainer) return;
    clearElement(dotsContainer);

    const total = cardsData.length;
    if (total <= 1) return;

    for (let i = 0; i < total; i++) {
      const dot = document.createElement('button');
      dot.className = 'stack__dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Перейти к карточке ${i + 1}`);
      if (i === activeIndex) {
        dot.setAttribute('aria-current', 'true');
      }

      disposers.push(trackEvent(dot, 'click', (event) => {
        event.preventDefault();
        setActiveIndex(i);
      }, undefined, { module: 'stackCarousel', target: `dot-${i}` }));

      dotsContainer.appendChild(dot);
    }
  }

  function updateDots() {
    if (!dotsContainer) return;
    const dots = dotsContainer.querySelectorAll('.stack__dot');
    dots.forEach((dot, index) => {
      if (index === activeIndex) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
  }

  function buildCover(card) {
    const wrapper = document.createElement('div');
    wrapper.className = 'stack-card__cover';

    const coverValue = normalizeCover(card.cover);
    if (!coverValue) {
      const emoji = document.createElement('span');
      emoji.className = 'stack-card__emoji';
      emoji.textContent = '✨';
      wrapper.appendChild(emoji);
      return wrapper;
    }

    const isImage = /^https?:\/\//i.test(coverValue) || coverValue.startsWith('/');
    if (isImage) {
      const img = document.createElement('img');
      img.src = coverValue;
      img.alt = card.title || 'Иллюстрация';
      img.loading = 'lazy';
      wrapper.classList.add('stack-card__cover--image');
      wrapper.appendChild(img);
      return wrapper;
    }

    const emoji = document.createElement('span');
    emoji.className = 'stack-card__emoji';
    emoji.textContent = coverValue;
    wrapper.appendChild(emoji);
    return wrapper;
  }

  function createCardElement(card, index) {
    const isLink = Boolean(card.url);
    const node = document.createElement(isLink ? 'a' : 'div');
    node.className = 'stack-card';
    if (isLink) {
      node.href = card.url;
    }
    node.dataset.cardId = card.id || `card-${index}`;
    node.setAttribute('data-analytics', 'recommendation-card');

    const inner = document.createElement('div');
    inner.className = 'stack-card__inner';

    // Cover: emoji или картинка одного размера
    const coverWrapper = buildCover(card);
    inner.appendChild(coverWrapper);

    // Title
    const title = document.createElement('h3');
    title.className = 'stack-card__title';
    title.textContent = card.title || 'Рекомендация';
    inner.appendChild(title);

    // Description
    const description = document.createElement('p');
    description.className = 'stack-card__description';
    description.textContent = card.description || '';
    inner.appendChild(description);

    node.appendChild(inner);

    // Bubble tail SVG
    const tail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tail.setAttribute('class', 'stack-card__tail');
    tail.setAttribute('viewBox', '0 0 60 13');
    tail.setAttribute('aria-hidden', 'true');
    const tailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tailPath.setAttribute('d', 'M0 0 C20 0 20 13 30 13 C40 13 40 0 60 0 Z');
    tail.appendChild(tailPath);
    node.appendChild(tail);

    bindCardInteractions(node, index);

    return node;
  }

  function bindCardInteractions(node, index) {
    cardDisposers.push(trackEvent(node, 'mouseenter', () => {
      if (!isPointerInteractive() || isMobileMode()) return;
      hoveredId = cardsData[index]?.id || node.dataset.cardId || '';
      applyLayout();
    }, undefined, { module: 'stackCarousel', target: describeTarget(node) }));

    cardDisposers.push(trackEvent(node, 'mouseleave', () => {
      if (!isPointerInteractive() || isMobileMode()) return;
      hoveredId = null;
      applyLayout();
    }, undefined, { module: 'stackCarousel', target: describeTarget(node) }));

    cardDisposers.push(trackEvent(node, 'click', (event) => {
      handleCardClick(event, index, node);
    }, undefined, { module: 'stackCarousel', target: describeTarget(node) }));
  }

  function handleCardClick(event, index, node) {
    const total = cardElements.length;
    if (!total) return;

    const hasHref = node instanceof HTMLAnchorElement && typeof node.href === 'string' && node.href.length > 0;

    // If it's a link, allow default navigation (don't preventDefault)
    if (hasHref) {
      return;
    }

    // If not a link, just select/advance
    event.preventDefault();
    setActiveIndex(index);
  }

  function setActiveIndex(nextIndex, options = {}) {
    const { fromAutoplay = false } = options;
    if (!cardElements.length) return;

    const total = cardElements.length;
    if (total <= 1) {
      activeIndex = 0;
      applyLayout();
      updateDots();
      stopAutoplay();
      return;
    }

    const safeIndex = ((nextIndex % total) + total) % total;
    if (safeIndex === activeIndex && fromAutoplay) {
      // Принудительно сдвигаем дальше, чтобы автоплей не залипал
      const forcedIndex = (safeIndex + 1) % total;
      activeIndex = forcedIndex;
      applyLayout();
      updateDots();
      return;
    }

    activeIndex = safeIndex;
    applyLayout();
    updateDots();
    if (!fromAutoplay) {
      restartAutoplay();
    }
  }

  function calculateOffset(index) {
    const total = cardElements.length;
    if (!total) return 0;
    return (index - activeIndex + total) % total;
  }

  function applyLayout() {
    // Ensure inline class is set for non-wide modes (Desktop < 1280px, Tablet, Mobile)
    // This triggers isMobileMode() -> true, enabling horizontal list logic
    stack.classList.toggle('stack--inline', currentMode !== 'desktop-wide');

    const isMobile = isMobileMode();
    const pointerAllowed = isPointerInteractive();

    if (!pointerAllowed || isMobile) {
      isHovered = false;
      hoveredId = null;
    }

    stack.classList.toggle('stack--mobile', isMobile);
    stack.classList.toggle('stack--hover', isHovered && pointerAllowed && !isMobile);
    stack.classList.toggle('stack--expanded', isHovered && pointerAllowed && !isMobile);

    if (mobileHint) {
      mobileHint.hidden = !isMobile;
    }

    const total = cardElements.length;
    setControlsState(total <= 1);

    cardElements.forEach((node, index) => {
      const style = calculateCardStyle(index, isMobile);
      applyCardStyle(node, style);
      node.dataset.active = style.offset === 0 ? 'true' : 'false';
    });
  }

  function calculateCardStyle(index, isMobile) {
    const total = cardElements.length;
    if (!total) {
      return { pointerEvents: 'none', offset: 0 };
    }

    const offset = calculateOffset(index);
    const STEP_Y = isMobile ? 0 : 14;
    const STEP_X = isMobile ? 24 : 0;
    const SCALE_STEP = 0.05;

    const yStart = offset * STEP_Y;
    const xStart = offset * STEP_X;
    const scaleStart = 1 - (offset * SCALE_STEP);

    const yEnd = isMobile ? 0 : Math.max(0, (offset - 1) * STEP_Y);
    const xEnd = isMobile ? Math.max(0, (offset - 1) * STEP_X) : 0;
    const scaleEnd = Math.min(1, 1 - ((offset - 1) * SCALE_STEP));

    const isCardHovered = isHovered && cardsData[index]?.id === hoveredId;

    const cssVars = {
      '--x-from': `${xStart}px`,
      '--y-from': `${yStart}px`,
      '--x-to': `${xEnd}px`,
      '--y-to': `${yEnd}px`,
      '--s-from': `${scaleStart}`,
      '--s-to': `${scaleEnd}`,
      '--z-start': `-${offset}px`,
      '--z-end': `-${Math.max(0, offset - 1)}px`,
    };

    let style = {
      offset,
      vars: cssVars,
      zIndex: isCardHovered ? 100 : 50 - offset,
      pointerEvents: (offset === 0 || (isHovered && !isMobile)) ? 'auto' : 'none',
      opacity: '',
      transform: '',
      transition: '',
      animation: '',
      boxShadow: '',
      border: '',
    };

    if (isMobile) {
      if (offset === 0) {
        style.transform = 'translate3d(0, 0, 0) scale(1)';
        style.opacity = 1;
        style.animation = 'none';
      } else if (offset === total - 1) {
        style.zIndex = 60;
        style.animation = 'flyOutMobile 800ms cubic-bezier(0.32, 0.72, 0, 1) forwards';
      } else {
        const animName = 'stackTransform';
        style.zIndex = 40 - offset;
        style.animation = `${animName} var(--stack-animation-duration) linear forwards`;
      }
    } else if (isHovered) {
      // Horizontal expansion to the left
      // Each card shifts left by its offset * (step)
      // Card width is 280px. Overlap is 30px.
      // Step = 280 - 30 = 250px.
      const expandedXOffset = `calc(-${offset} * 250px)`;
      style.transform = `translate3d(${expandedXOffset}, 0, 0) scale(1)`;
      style.opacity = 1;

      // Shadow logic:
      // Base expanded shadow: 0 30px 60px -12px rgba(0,0,0,0.25)
      // Selected shadow (50% darker): 0 30px 60px -12px rgba(0,0,0,0.4)
      style.boxShadow = isCardHovered
        ? '0 30px 60px -12px rgba(0,0,0,0.4)'
        : '0 30px 60px -12px rgba(0,0,0,0.25)';

      // No border
      style.border = 'none';

      // Staggered delay: 0.1s per card index (distinct, luxurious wave)
      // Soft & Luxurious easing: cubic-bezier(0.2, 0.8, 0.2, 1) (Very smooth ease-out, no bounce)
      // Duration: 1.0s for a slow, elegant feel
      style.transition = `transform 1.0s cubic-bezier(0.2, 0.8, 0.2, 1) ${offset * 0.1}s, box-shadow 0.5s ease`;
    } else {
      // Desktop Idle State (Stacked)
      // We use transitions instead of animations to ensure smooth reversibility from hover
      // and smooth updates during autoplay/navigation.

      // Adjusted shift: 15px (was 18px)
      const yPos = offset * -15;
      const zPos = -Math.max(0, offset - 1);
      const scale = 1 - (offset * 0.05);

      style.transform = `translate3d(0, ${yPos}px, ${zPos}px) scale(${scale})`;
      style.opacity = 1;
      style.animation = 'none';

      // Smooth return/update transition
      // Matches the "Soft & Luxurious" feel
      style.transition = `transform 1.0s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.5s ease`;

      // Add shadow to stacked cards for better separation
      // Stronger blur and slightly darker as requested
      style.boxShadow = '0 15px 50px -10px rgba(0, 0, 0, 0.25)';
    }

    return style;
  }

  function applyCardStyle(node, style) {
    if (style.vars) {
      Object.entries(style.vars).forEach(([key, value]) => {
        node.style.setProperty(key, value);
      });
    }

    node.style.zIndex = style.zIndex != null ? String(style.zIndex) : '';
    node.style.pointerEvents = style.pointerEvents || 'auto';
    node.style.opacity = style.opacity !== '' ? String(style.opacity) : '';
    node.style.transform = style.transform || '';
    node.style.transition = style.transition || '';
    node.style.boxShadow = style.boxShadow || '';
    node.style.border = style.border || '';

    const hasAnimation = style.animation && style.animation !== 'none';
    node.style.animation = 'none';
    if (hasAnimation) {
      // Форсируем перезапуск анимации
      void node.offsetWidth;
      node.style.animation = style.animation;
    }
  }

  function scheduleAutoplay() {
    stopAutoplay();
    if (pauseReasons.size > 0 || cardElements.length <= 1) {
      return;
    }
    autoplayDisposer = trackInterval(() => {
      setActiveIndex(activeIndex + 1, { fromAutoplay: true });
    }, AUTOPLAY_INTERVAL, { module: 'stackCarousel', detail: 'autoplay' });
  }

  function restartAutoplay() {
    scheduleAutoplay();
  }

  function stopAutoplay() {
    if (autoplayDisposer) {
      autoplayDisposer();
      autoplayDisposer = null;
    }
  }

  function pauseAutoplay(reason) {
    if (!reason || pauseReasons.has(reason)) {
      return;
    }
    pauseReasons.add(reason);
    stopAutoplay();
  }

  function resumeAutoplay(reason) {
    if (!reason || !pauseReasons.has(reason)) {
      return;
    }
    pauseReasons.delete(reason);
    scheduleAutoplay();
  }

  function isMobileMode() {
    // Treat inline stack on desktop as mobile mode for layout purposes
    return currentMode === 'mobile' || currentMode === 'tablet' || stack?.classList.contains('stack--inline');
  }

  function isPointerInteractive() {
    return currentInput === 'pointer';
  }

  function setControlsState(disabled) {
    navButtons.forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = disabled;
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
  }

  const handleResize = () => {
    requestAnimationFrame(() => applyLayout());
  };

  disposers.push(trackEvent(stack, 'mouseenter', () => {
    if (!isPointerInteractive() || isMobileMode()) return;
    isHovered = true;
    pauseAutoplay('hover');
    applyLayout();
  }, undefined, { module: 'stackCarousel', target: describeTarget(deck) }));

  disposers.push(trackEvent(stack, 'mouseleave', () => {
    if (!isPointerInteractive() || isMobileMode()) return;
    isHovered = false;
    hoveredId = null;
    resumeAutoplay('hover');
    applyLayout();
  }, undefined, { module: 'stackCarousel', target: describeTarget(deck) }));

  let touchStartX = 0;
  let touchStartY = 0;
  let swipeDirection = null;
  const MIN_SWIPE = 50;
  const DIRECTION_THRESHOLD = 10;

  disposers.push(trackEvent(deck, 'touchstart', (e) => {
    if (!e.changedTouches || !e.changedTouches.length) return;
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    swipeDirection = null;
    pauseAutoplay('touch');
  }, { passive: true }, { module: 'stackCarousel', target: describeTarget(deck) }));

  disposers.push(trackEvent(deck, 'touchmove', (e) => {
    if (!isMobileMode()) return;
    if (!swipeDirection) {
      const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (deltaX > DIRECTION_THRESHOLD || deltaY > DIRECTION_THRESHOLD) {
        swipeDirection = deltaX > deltaY ? 'horizontal' : 'vertical';
      }
    }
    if (swipeDirection === 'horizontal') {
      e.preventDefault();
    }
  }, { passive: false }, { module: 'stackCarousel', target: describeTarget(deck) }));

  disposers.push(trackEvent(deck, 'touchend', (e) => {
    if (!e.changedTouches || !e.changedTouches.length) {
      resumeAutoplay('touch');
      return;
    }
    if (isMobileMode() && swipeDirection === 'horizontal') {
      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchStartX - touchEndX;
      if (Math.abs(deltaX) >= MIN_SWIPE) {
        setActiveIndex(deltaX > 0 ? activeIndex + 1 : activeIndex - 1);
      }
    }
    swipeDirection = null;
    resumeAutoplay('touch');
  }, { passive: true }, { module: 'stackCarousel', target: describeTarget(deck) }));

  disposers.push(trackEvent(deck, 'touchcancel', () => {
    swipeDirection = null;
    resumeAutoplay('touch');
  }, { passive: true }, { module: 'stackCarousel', target: describeTarget(deck) }));

  navButtons.forEach((btn) => {
    const isNext = btn.hasAttribute('data-stack-next');
    disposers.push(trackEvent(btn, 'click', (event) => {
      event.preventDefault();
      if (btn.disabled) return;
      setActiveIndex(isNext ? activeIndex + 1 : activeIndex - 1);
    }, undefined, { module: 'stackCarousel', target: describeTarget(btn) }));
  });

  disposers.push(trackEvent(window, 'resize', handleResize, undefined, { module: 'stackCarousel', target: 'window' }));
  disposers.push(trackEvent(window, 'orientationchange', handleResize, undefined, { module: 'stackCarousel', target: 'window' }));

  applyLayout();
  restartAutoplay();

  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    stopAutoplay();
    pauseReasons.clear();
    cleanupCardListeners();
    while (disposers.length) {
      const dispose = disposers.pop();
      try {
        dispose();
      } catch (error) {
        console.error('[StackCarousel] Failed to dispose listener', error);
      }
    }
  };

  const deregisterLifecycleCleanup = registerLifecycleDisposer(() => {
    cleanup();
  }, { module: 'stackCarousel', kind: 'cleanup' });

  return () => {
    cleanup();
    try {
      deregisterLifecycleCleanup?.();
    } catch (error) {
      console.error('[StackCarousel] Failed to deregister lifecycle cleanup', error);
    }
  };
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
  let enabledForMode = currentMode === 'mobile' || currentMode === 'tablet';
  let suppressed = false;
  let disposeScroll = null;

  const syncLastScroll = () => {
    lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
  };

  const resetAttributes = () => {
    if (body.hasAttribute('data-scroll')) {
      body.removeAttribute('data-scroll');
    }
  };

  function updateScrollDirection() {
    if (!enabledForMode) {
      resetAttributes();
      scrollTicking = false;
      syncLastScroll();
      return;
    }

    if (suppressed || body.classList.contains('menu-open')) {
      resetAttributes();
      scrollTicking = false;
      syncLastScroll();
      return;
    }

    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const scrollDiff = currentScrollY - lastScrollY;

    if (Math.abs(scrollDiff) < scrollThreshold) {
      scrollTicking = false;
      return;
    }

    if (scrollDiff > 0 && currentScrollY > scrollTopThreshold) {
      if (body.dataset.scroll !== 'down') {
        body.dataset.scroll = 'down';
      }
    } else if (scrollDiff < 0) {
      if (body.dataset.scroll !== 'up') {
        body.dataset.scroll = 'up';
      }
    }

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

  function setModeEnabled(shouldEnable) {
    const next = Boolean(shouldEnable);
    if (enabledForMode === next) {
      if (!next) {
        resetAttributes();
        syncLastScroll();
      }
      return;
    }

    enabledForMode = next;
    resetAttributes();
    syncLastScroll();
    if (!enabledForMode) {
      suppressed = false;
    }
  }

  function setSuppressed(next) {
    const shouldSuppress = Boolean(next);
    if (suppressed === shouldSuppress) {
      if (shouldSuppress) {
        resetAttributes();
        syncLastScroll();
      }
      return;
    }

    suppressed = shouldSuppress;
    resetAttributes();
    syncLastScroll();
  }

  function detach() {
    if (typeof disposeScroll === 'function') {
      disposeScroll();
      disposeScroll = null;
    }
    resetAttributes();
    scrollTicking = false;
  }

  disposeScroll = trackEvent(window, 'scroll', onScroll, { passive: true }, {
    module: 'scroll.hideHeader',
    target: 'window',
  });

  scrollHideControls = {
    suppress: setSuppressed,
    setMode: setModeEnabled,
    detach,
  };

  setModeEnabled(enabledForMode);

  registerLifecycleDisposer(() => {
    detach();
    scrollHideControls = {
      suppress: () => { },
      setMode: () => { },
      detach: () => { },
    };
  }, { module: 'scroll.hideHeader', kind: 'cleanup' });
}

/**
 * Progress Widget - виджет прогресса чтения
 * Показывает круг с процентами (0-100%), при 100% морфится в кнопку "Далее"
 */
function initProgressWidget() {
  // 1. Анализ структуры текста
  const containerInfo = pickReadingContainer();
  const scrollInfo = findScrollContainer(containerInfo.element);
  const textContainer = containerInfo.element;
  const scrollRoot = scrollInfo.element;
  const controlsWindowScroll = scrollInfo.mode === 'document' || scrollRoot === window;

  if (!containerInfo.matchedTextBox) {
    console.warn('[ProgressWidget] .text-box not found, using fallback container', {
      selector: containerInfo.selector,
      scrollMode: scrollInfo.mode,
    });
  }

  // 2. Создание/получение элемента виджета
  let root = progressWidgetRoot instanceof HTMLElement ? progressWidgetRoot : document.getElementById('pw-root');
  if (!root) {
    root = document.createElement('aside');
    root.id = 'pw-root';
    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-disabled', 'true');
    root.setAttribute('aria-label', 'Прогресс чтения: 0%');
  }

  progressWidgetRoot = root;

  // Slot is now outside main - look in document first
  let slot = document.querySelector('.pw-slot');
  let slotCreated = false;
  if (!slot) {
    // Fallback: create slot inside textContainer for backwards compat
    slot = document.createElement('div');
    slot.className = 'pw-slot';
    textContainer.appendChild(slot);
    slotCreated = true;
  }

  // Widget always stays in body for stable animations
  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  // Docking state
  let isSlotDocked = false;

  root.dataset.pwContainer = containerInfo.selector;
  root.dataset.pwScrollMode = scrollInfo.mode;

  // Читаем текст кнопки из data-button-text (декларативный подход)
  // Приоритет: 1) slot (.pw-slot), 2) textContainer (.text-box), 3) "Далее" по умолчанию
  const buttonText = slot?.dataset.buttonText || textContainer?.dataset.buttonText || 'Далее';

  // Build DOM safely without innerHTML
  clearElement(root);
  const visual = document.createElement('div');
  visual.className = 'pw-visual';

  const dot = document.createElement('div');
  dot.className = 'pw-dot';

  const pill = document.createElement('div');
  pill.className = 'pw-pill';

  const pctDiv = document.createElement('div');
  pctDiv.className = 'pw-pct';
  const pctSpan = document.createElement('span');
  pctSpan.id = 'pwPct';
  pctSpan.textContent = '0%';
  pctDiv.appendChild(pctSpan);

  const nextDiv = document.createElement('div');
  nextDiv.className = 'pw-next';
  nextDiv.textContent = buttonText; // Safe: uses textContent instead of innerHTML

  visual.appendChild(dot);
  visual.appendChild(pill);
  visual.appendChild(pctDiv);
  visual.appendChild(nextDiv);
  root.appendChild(visual);

  // 3. References to elements (already created above)
  const pct = pctDiv;
  const next = nextDiv;

  const prefersReduced = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const DONE_TRIGGER_PERCENT = 95;

  // 4. Функции измерения прогресса
  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function measureWindowProgress() {
    const rect = textContainer.getBoundingClientRect();
    const viewport = window.innerHeight;
    const total = Math.max(textContainer.scrollHeight, rect.height) - viewport;
    if (total <= 0) return 1;
    const read = Math.min(Math.max(-rect.top, 0), total);
    return clamp01(read / total);
  }

  function measureElementProgress() {
    const total = Math.max(scrollRoot.scrollHeight, textContainer.scrollHeight) - scrollRoot.clientHeight;
    if (total <= 0) return 1;
    const read = scrollRoot.scrollTop;
    return clamp01(read / total);
  }

  function measureProgress() {
    return controlsWindowScroll ? measureWindowProgress() : measureElementProgress();
  }

  // 4. Определение URL следующей страницы
  // Для index-страницы: проверяем авторизацию и используем premium URL если залогинен
  function detectNextUrl() {
    // ПРИОРИТЕТ 0: Проверка авторизации для index-страницы
    // Если есть data-next-page-premium, сначала проверяем логин
    const premiumUrl = document.body.dataset.nextPagePremium;
    if (premiumUrl) {
      // Асинхронная проверка делается через checkAuthAndRedirect
      // Здесь возвращаем free URL, а реальный редирект идёт через checkAuthAndRedirect
    }

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

  // Асинхронная проверка авторизации для index-страницы
  async function checkAuthAndGetNextUrl() {
    const premiumUrl = document.body.dataset.nextPagePremium;
    const freeUrl = document.body.dataset.nextPage;

    if (!premiumUrl) {
      return freeUrl || detectNextUrl();
    }

    try {
      const response = await fetch('/server/api/user-info.php', {
        method: 'GET',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.status === 'success' && data.email) {
        // Пользователь залогинен → premium URL
        return premiumUrl;
      }
    } catch (e) {
      console.warn('[ProgressWidget] Auth check failed, using free URL:', e);
    }

    // Не залогинен → free URL
    return freeUrl || detectNextUrl();
  }

  const NEXT_URL = detectNextUrl();

  // Задача 2: Определяем тип страницы из data-атрибута
  const article = document.querySelector('article[data-page-type]');
  const pageType = article?.dataset.pageType || 'unknown';

  // Типы страниц: free, premium, recommendation, intro-free, intro-premium
  const isFreeVersion = pageType === 'free' || pageType === 'intro-free';
  const isRecommendation = pageType === 'recommendation';
  const isPremium = pageType === 'premium' || pageType === 'intro-premium';
  const isIntroPage = pageType === 'intro-free' || pageType === 'intro-premium'; // Для проверки авторизации на index

  if (isFreeVersion) {
    root.setAttribute('data-free-version', 'true');
  }

  // Ключ для localStorage - сохранение последней позиции в premium
  const LAST_POSITION_KEY = 'toosmart_last_premium_position';

  // Для premium страниц: сохраняем текущую позицию при достижении 100%
  function saveLastPosition() {
    if (isPremium && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LAST_POSITION_KEY, window.location.pathname);
      } catch (e) {
        console.warn('[ProgressWidget] Не удалось сохранить позицию:', e);
      }
    }
  }

  // Для рекомендаций: получаем последнюю сохраненную позицию
  function getSmartNextUrl() {
    if (isRecommendation && typeof localStorage !== 'undefined') {
      try {
        const savedPosition = localStorage.getItem(LAST_POSITION_KEY);
        if (savedPosition && savedPosition.includes('/premium/')) {
          return savedPosition;
        }
      } catch (e) {
        console.warn('[ProgressWidget] Не удалось получить позицию:', e);
      }
    }
    return NEXT_URL;
  }

  // 5. Анимации
  let aDot = null, aPill = null, aPct = null, aNext = null;
  let doneState = false;
  let centeringInProgress = false;
  let centeringFallbackId = null;
  let ticking = false;
  const EASING_FORWARD = 'cubic-bezier(0.25, 0.6, 0.4, 1)'; // slow start → even mid → fast finish
  const EASING_REVERSE = 'cubic-bezier(0.7, 0, 0.25, 1)';  // fast start → smooth finish

  function parseTimeListMs(raw) {
    if (typeof raw !== 'string') return [];
    return raw.split(',')
      .map((part) => part.trim())
      .map((token) => {
        if (token.endsWith('ms')) return parseFloat(token);
        if (token.endsWith('s')) return parseFloat(token) * 1000;
        const num = parseFloat(token);
        return Number.isFinite(num) ? num : 0;
      })
      .filter((num) => Number.isFinite(num) && num >= 0);
  }

  function getMaxTransitionMs(element) {
    if (!(element instanceof HTMLElement)) return null;
    const styles = window.getComputedStyle(element);
    const durations = parseTimeListMs(styles.transitionDuration);
    const delays = parseTimeListMs(styles.transitionDelay);
    const count = Math.max(durations.length, delays.length);
    if (!count) return null;

    let max = 0;
    for (let i = 0; i < count; i += 1) {
      const d = durations[i % durations.length] ?? 0;
      const l = delays[i % delays.length] ?? 0;
      max = Math.max(max, d + l);
    }
    return max;
  }

  function isMobileMode() {
    return body.dataset.mode === 'mobile';
  }

  function ensureMobilePositioning() {
    if (isMobileMode()) {
      root.classList.add('is-floating');
    } else {
      root.classList.remove('is-floating');
    }
  }

  // === INSTANT SNAP DOCKING FUNCTIONS ===
  // Logic: Dock when slot's Y <= floating button's Y
  //        Undock when slot's Y > floating button's Y

  function getFloatingBottomOffset() {
    // Default floating position from bottom of viewport
    const parsed = parseFloat(root.style.getPropertyValue('--pw-float-bottom')) || 0;
    return parsed > 0 ? parsed : 45; // fallback to 45px
  }

  function getFloatingY() {
    // Y position of floating button (center)
    const bottomOffset = getFloatingBottomOffset();
    const widgetHeight = root.offsetHeight || 44;
    return window.innerHeight - bottomOffset - widgetHeight / 2;
  }

  function getSlotCenterY() {
    if (!slot) return Infinity;
    const rect = slot.getBoundingClientRect();
    return rect.top + rect.height / 2;
  }

  function syncToSlotPosition() {
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    root.style.setProperty('--pw-dock-top', `${Math.round(centerY)}px`);
  }

  function updateDockingState() {
    // Skip first scroll after menu unlock (prevents jump)
    if (skipNextScrollForDocking) {
      skipNextScrollForDocking = false;
      return;
    }

    // Docking works on all modes now (pw-slot is display:flex everywhere)

    // Only dock when button is in "done" state (100%)
    if (!doneState) {
      if (isSlotDocked) {
        root.classList.remove('is-docked');
        root.style.removeProperty('--pw-dock-top');
        isSlotDocked = false;
      }
      return;
    }

    const slotY = getSlotCenterY();
    const floatingY = getFloatingY();

    // Dock: slot is AT or ABOVE floating position
    if (slotY <= floatingY) {
      syncToSlotPosition();
      if (!isSlotDocked) {
        root.classList.add('is-docked');
        isSlotDocked = true;
      }
    } else {
      // Undock: slot is BELOW floating position
      if (isSlotDocked) {
        root.classList.remove('is-docked');
        root.style.removeProperty('--pw-dock-top');
        isSlotDocked = false;
      }
    }
  }

  // === END DOCKING FUNCTIONS ===

  ensureMobilePositioning();

  function updateMenuOverlapState() {
    if (body.classList.contains('menu-open')) {
      root.classList.add('is-menu-covered');
    } else {
      root.classList.remove('is-menu-covered');
    }
  }

  updateMenuOverlapState();

  let disconnectMenuObserver = () => { };
  if (typeof MutationObserver === 'function') {
    const menuStateObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'class') {
          updateMenuOverlapState();
          break;
        }
      }
    });

    menuStateObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
    disconnectMenuObserver = trackObserver(menuStateObserver, {
      module: 'progressWidget',
      target: 'body[class] mutation',
    });
  } else {
    let lastMenuState = body.classList.contains('menu-open');
    const pollMenuState = () => {
      const currentState = body.classList.contains('menu-open');
      if (currentState !== lastMenuState) {
        lastMenuState = currentState;
        updateMenuOverlapState();
      }
    };
    disconnectMenuObserver = trackInterval(pollMenuState, 250, {
      module: 'progressWidget',
      target: 'body[class] poll',
    });
  }

  function killAnims() {
    for (const a of [aDot, aPill, aPct, aNext]) {
      try { a && a.cancel(); } catch (e) { }
    }
    aDot = aPill = aPct = aNext = null;
  }

  function setVisualState(isDone) {
    const done = Boolean(isDone);
    pct.style.opacity = done ? '0' : '1';
    next.style.opacity = done ? '1' : '0';
  }

  function playForward() {
    const dotBaseTransform = 'translate(var(--pw-dot-translate-x), -50%)';
    const pctBaseTransform = 'translate(var(--pw-dot-translate-x), -50%)';
    const pctExitTransform = 'translate(var(--pw-dot-translate-x), calc(-50% + 8px))';

    if (prefersReduced) {
      dot.style.opacity = '0';
      pill.style.opacity = '1';
      pill.style.transform = 'translate(-50%,-50%) scaleX(1)';
      setVisualState(true);
      pct.style.transform = pctExitTransform;
      next.style.transform = 'translateY(0)';
      next.style.letterSpacing = '0px';
      return;
    }
    killAnims();

    aDot = dot.animate(
      [
        { transform: `${dotBaseTransform} scale(1)`, opacity: 1 },
        { transform: `${dotBaseTransform} scale(1.08)`, opacity: 0.85, offset: 0.18 },
        { transform: `${dotBaseTransform} scale(0.82)`, opacity: 0.45, offset: 0.48 },
        { transform: `${dotBaseTransform} scale(0.6)`, opacity: 0 }
      ],
      { duration: 500, easing: EASING_FORWARD, fill: 'forwards' }
    );
    aPill = pill.animate(
      [
        { transform: 'translate(-50%,-50%) scaleX(0.001)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scaleX(0.72)', opacity: 1, offset: 0.42 },
        { transform: 'translate(-50%,-50%) scaleX(1.08)', opacity: 1, offset: 0.72 },
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 }
      ],
      { duration: 500, easing: EASING_FORWARD, fill: 'forwards' }
    );
    aPct = pct.animate(
      [
        { transform: pctBaseTransform, offset: 0 },
        { transform: pctExitTransform, offset: 0.45 }
      ],
      { duration: 500, easing: EASING_FORWARD, fill: 'forwards' }
    );
    aNext = next.animate(
      [
        { transform: 'translateY(8px)', letterSpacing: '0.4px', offset: 0.55 },
        { transform: 'translateY(0)', letterSpacing: '0px', offset: 1 }
      ],
      { duration: 500, easing: EASING_FORWARD, fill: 'forwards' }
    );
  }

  function playReverse() {
    const dotBaseTransform = 'translate(var(--pw-dot-translate-x), -50%)';
    const pctBaseTransform = 'translate(var(--pw-dot-translate-x), -50%)';
    const pctEnterTransform = 'translate(var(--pw-dot-translate-x), calc(-50% - 6px))';

    if (prefersReduced) {
      dot.style.opacity = '1';
      dot.style.transform = `${dotBaseTransform} scale(1)`;
      pill.style.opacity = '0';
      pill.style.transform = 'translate(-50%,-50%) scaleX(0.001)';
      pct.style.opacity = '1';
      pct.style.transform = pctBaseTransform;
      next.style.opacity = '0';
      next.style.transform = 'translateY(6px)';
      next.style.letterSpacing = '0.4px';
      return;
    }
    killAnims();

    aDot = dot.animate(
      [
        { transform: `${dotBaseTransform} scale(0.62)`, opacity: 0 },
        { transform: `${dotBaseTransform} scale(0.92)`, opacity: 0.55, offset: 0.28 },
        { transform: `${dotBaseTransform} scale(1.04)`, opacity: 0.85, offset: 0.58 },
        { transform: `${dotBaseTransform} scale(1)`, opacity: 1 }
      ],
      { duration: 500, easing: EASING_REVERSE, fill: 'forwards' }
    );
    aPill = pill.animate(
      [
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scaleX(0.66)', opacity: 1, offset: 0.32 },
        { transform: 'translate(-50%,-50%) scaleX(0.001)', opacity: 0 }
      ],
      { duration: 500, easing: EASING_REVERSE, fill: 'forwards' }
    );
    aPct = pct.animate(
      [
        { transform: pctEnterTransform, offset: 0.35 },
        { transform: pctBaseTransform, offset: 0.8 }
      ],
      { duration: 500, easing: EASING_REVERSE, fill: 'forwards' }
    );
    aNext = next.animate(
      [
        { transform: 'translateY(0)', letterSpacing: '0px', offset: 0 },
        { transform: 'translateY(6px)', letterSpacing: '0.4px', offset: 0.3 }
      ],
      { duration: 500, easing: EASING_REVERSE, fill: 'forwards' }
    );
  }

  function clearCenteringFallback() {
    if (centeringFallbackId !== null) {
      clearTimeout(centeringFallbackId);
      centeringFallbackId = null;
    }
  }

  function finalizeAfterCentering() {
    if (doneState) return;
    centeringInProgress = false;
    clearCenteringFallback();
    doneState = true;
    setVisualState(true);
    root.classList.remove('is-centering');
    root.classList.add('is-done');
    root.setAttribute('aria-disabled', 'false');
    root.setAttribute('aria-label', 'Кнопка: Далее');
    playForward();
    requestLayoutMetricsUpdate({ elementChanged: true });
  }

  function startDoneAnimation(progressValue) {
    if (doneState) {
      root.setAttribute('aria-disabled', 'false');
      root.setAttribute('aria-label', 'Кнопка: Далее');
      return;
    }

    if (isMobileMode()) {
      // MOBILE: сначала переезд в центр, потом морфинг
      if (centeringInProgress) {
        return;
      }
      centeringInProgress = true;
      root.classList.add('is-centering');
      root.classList.remove('is-done');
      root.setAttribute('aria-disabled', 'true');
      root.setAttribute('aria-label', 'Прогресс чтения: ' + progressValue + '%');
      requestLayoutMetricsUpdate({ elementChanged: true });
      clearCenteringFallback();
      const plannedMs = prefersReduced ? 0 : (getMaxTransitionMs(root) ?? 500);
      if (plannedMs === 0) {
        requestAnimationFrame(() => finalizeAfterCentering());
      } else {
        centeringFallbackId = window.setTimeout(() => {
          if (centeringInProgress) {
            finalizeAfterCentering();
          }
        }, Math.max(0, Math.round(plannedMs + 40)));
      }
      return;
    }

    // DESKTOP/TABLET: сразу морфим в кнопку без переезда
    doneState = true;
    setVisualState(true);
    root.classList.remove('is-centering');
    root.classList.add('is-done');
    root.setAttribute('aria-disabled', 'false');
    root.setAttribute('aria-label', 'Кнопка: Далее');
    playForward();
    requestLayoutMetricsUpdate({ elementChanged: true });
  }

  function resetProgressState(progressValue) {
    if (!doneState && !centeringInProgress && !root.classList.contains('is-centering')) {
      root.setAttribute('aria-disabled', 'true');
      root.setAttribute('aria-label', 'Прогресс чтения: ' + progressValue + '%');
      return;
    }

    const hadButtonState = doneState || centeringInProgress || root.classList.contains('is-centering');

    centeringInProgress = false;
    clearCenteringFallback();
    doneState = false;
    setVisualState(false);
    root.classList.remove('is-done', 'is-centering');
    root.setAttribute('aria-disabled', 'true');
    root.setAttribute('aria-label', 'Прогресс чтения: ' + progressValue + '%');

    if (hadButtonState) {
      playReverse();
      requestLayoutMetricsUpdate({ elementChanged: true });
    }
  }

  // Как только элемент доезжает до центра (mobile),
  // запускаем морфинг в кнопку без паузы
  trackEvent(root, 'transitionend', (event) => {
    if (!centeringInProgress) return;
    if (event.target !== root) return;
    if (event.propertyName !== 'left' && event.propertyName !== 'transform') return;

    finalizeAfterCentering();
  }, undefined, { module: 'progressWidget', target: describeTarget(root) });

  // 6. Обновление на скролл
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function update() {
    ticking = false;
    ensureMobilePositioning();

    const p = measureProgress();
    const perc = Math.round(p * 100);
    pctSpan.textContent = perc + '%';

    const shouldBeDone = perc >= DONE_TRIGGER_PERCENT;

    if (shouldBeDone) {
      startDoneAnimation(perc);
      // Check docking after animation starts
      updateDockingState();
      return;
    }

    resetProgressState(perc);
    // Ensure undocked when not done
    updateDockingState();
  }

  // 7. Клик
  trackEvent(root, 'click', async (e) => {
    if (doneState) {
      // При 100%: проверяем тип версии
      if (isFreeVersion && typeof window.openPaymentModal === 'function' && !isIntroPage) {
        // FREE версия (не intro) - открываем модальное окно покупки
        e.preventDefault();
        window.openPaymentModal();
      } else if (isIntroPage) {
        // INTRO-страница - проверяем авторизацию и перенаправляем на первую страницу курса
        e.preventDefault();
        try {
          const targetUrl = await checkAuthAndGetNextUrl();
          if (targetUrl && targetUrl !== '#') {
            saveLastPosition();
            window.location.href = targetUrl;
          } else {
            console.warn('Progress Widget: следующая страница не найдена');
          }
        } catch (err) {
          console.warn('[ProgressWidget] Auth check error, using free URL:', err);
          const fallbackUrl = document.body.dataset.nextPage || NEXT_URL;
          if (fallbackUrl && fallbackUrl !== '#') {
            window.location.href = fallbackUrl;
          }
        }
      } else {
        // PREMIUM или рекомендации - переход на следующую страницу
        const targetUrl = getSmartNextUrl();
        if (targetUrl && targetUrl !== '#') {
          // Сохраняем позицию для premium перед переходом
          saveLastPosition();
          window.location.href = targetUrl;
        } else {
          console.warn('Progress Widget: следующая страница не найдена');
        }
      }
    } else {
      // До 100%: докрутить до конца
      if (controlsWindowScroll) {
        const rect = textContainer.getBoundingClientRect();
        const endY = window.scrollY + (rect.bottom - window.innerHeight + 1);
        window.scrollTo({ top: endY, behavior: 'smooth' });
      } else {
        const target = Math.max(scrollRoot.scrollHeight - scrollRoot.clientHeight, 0);
        if (typeof scrollRoot.scrollTo === 'function') {
          scrollRoot.scrollTo({ top: target, behavior: 'smooth' });
        } else {
          scrollRoot.scrollTop = target;
        }
      }
    }
  }, { passive: false }, { module: 'progressWidget', target: describeTarget(root) });

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

  if (!controlsWindowScroll && scrollRoot && scrollRoot !== window) {
    trackEvent(scrollRoot, 'scroll', onScroll, { passive: true }, {
      module: 'progressWidget',
      target: describeTarget(scrollRoot),
    });
  }

  // 10. Инициализация
  dot.style.opacity = '1';
  pill.style.opacity = '0';
  pill.style.transform = 'translate(-50%,-50%) scaleX(0.001)';
  setVisualState(false);
  updateProgressWidgetFloatingAnchors(root);
  update();

  // Обновить layout metrics после создания виджета
  requestLayoutMetricsUpdate({ elementChanged: true });

  const releaseLifecycleCleanup = registerLifecycleDisposer(() => {
    killAnims();
    try {
      disconnectMenuObserver();
    } catch (error) {
      console.error('[ProgressWidget] Failed to disconnect menu observer', error);
    }
    root.classList.remove('is-done', 'is-menu-covered', 'is-floating', 'is-centering');
    if (root.isConnected && typeof root.remove === 'function') {
      root.remove();
    } else if (root.parentElement) {
      root.parentElement.removeChild(root);
    }
    progressWidgetRoot = null;
    if (slotCreated && slot && slot.parentElement) {
      try {
        slot.remove();
      } catch (error) {
        slot.parentElement.removeChild(slot);
      }
    }
  }, { module: 'progressWidget', kind: 'cleanup' });

  return () => {
    if (typeof releaseLifecycleCleanup === 'function') {
      try {
        releaseLifecycleCleanup();
      } catch (error) {
        console.error('[ProgressWidget] Failed to dispose via lazy cleanup', error);
      }
    }
  };
}

function activateDotsNavigationFeature() {
  if (dotsFeatureActive) {
    return () => { };
  }

  // Safari fix: Убедимся что элементы найдены перед инициализацией
  ensureElements();

  dotsFeatureActive = true;

  try {
    initDots();
    initDotsFlyout();
  } catch (error) {
    console.error('[LazyFeatures] Failed to initialize dots navigation', error);
  }

  return () => {
    dotsFeatureActive = false;
    try {
      teardownObserver();
    } catch (error) {
      console.error('[LazyFeatures] Failed to teardown section observer', error);
    }

    if (typeof flyoutSetActiveDisposer === 'function') {
      try {
        flyoutSetActiveDisposer();
      } catch (error) {
        console.error('[LazyFeatures] Failed to dispose flyout listener', error);
      }
    }
    flyoutSetActiveDisposer = null;

    detachFlyoutListeners();
    if (dotFlyout) {
      clearElement(dotFlyout);
      dotFlyout.setAttribute('hidden', '');
      dotFlyout.classList.add('is-hidden');
    }
    if (dotsRail) {
      clearElement(dotsRail);
      dotsRail.hidden = true;
    }
    releaseSetActiveSectionBridge('dotsFlyout.lazy-cleanup');
  };
}

function activateStackCarouselFeature() {
  if (typeof stackCarouselCleanup === 'function') {
    return () => { };
  }

  let cleanup = null;
  try {
    cleanup = initStackCarousel();
  } catch (error) {
    console.error('[LazyFeatures] Failed to initialize stack carousel', error);
    cleanup = null;
  }

  if (typeof cleanup === 'function') {
    stackCarouselCleanup = cleanup;
    return () => {
      if (typeof stackCarouselCleanup === 'function') {
        try {
          stackCarouselCleanup();
        } catch (error) {
          console.error('[LazyFeatures] Failed to cleanup stack carousel', error);
        }
      }
      stackCarouselCleanup = null;
    };
  }

  stackCarouselCleanup = null;
  return () => { };
}

function activateProgressWidgetFeature() {
  if (typeof progressWidgetCleanup === 'function') {
    return () => { };
  }

  // Не показывать виджет на страницах с paywall - там статичная кнопка
  const article = document.querySelector('article[data-page-type]');
  const pageType = article?.dataset.pageType || 'unknown';
  const hasPaywallTeaser = Boolean(document.querySelector('[data-paywall-root]')) || Boolean(document.querySelector('.premium-teaser'));
  const isPaywallPage = pageType === 'free' || pageType === 'paywall' || hasPaywallTeaser;
  if (isPaywallPage) {
    return () => { };
  }

  // Safari fix: Убедимся что элементы найдены перед инициализацией
  ensureElements();

  let release = null;
  try {
    release = initProgressWidget();
  } catch (error) {
    console.error('[LazyFeatures] Failed to initialize progress widget', error);
    release = null;
  }

  if (typeof release === 'function') {
    progressWidgetCleanup = release;
    return () => {
      if (typeof progressWidgetCleanup === 'function') {
        try {
          progressWidgetCleanup();
        } catch (error) {
          console.error('[LazyFeatures] Failed to cleanup progress widget', error);
        }
      }
      progressWidgetCleanup = null;
    };
  }

  progressWidgetCleanup = null;
  return () => { };
}

lazyFeatures.register('dots-nav', {
  onEnter: () => activateDotsNavigationFeature(),
});

// NOTE: stack-carousel removed - replaced by bubble-carousel.js

lazyFeatures.register('progress-widget', {
  sticky: true,
  onEnter: () => activateProgressWidgetFeature(),
});

/**
 * Safari fix: Инициализация элементов DOM
 * Вызывается в начале init() чтобы гарантировать что все элементы найдены
 */
function ensureElements() {
  if (!menuRail) menuRail = document.querySelector('.menu-rail');
  if (!header) header = document.querySelector('.header');
  if (!menuHandle) menuHandle = document.querySelector('.menu-handle');
  if (!siteMenu) siteMenu = document.querySelector('.site-menu');
  if (!backdrop) backdrop = document.querySelector('.backdrop');
  if (!dockHandle) dockHandle = document.querySelector('.dock-handle');
  if (!panel) panel = document.querySelector('.panel');
  if (!main) main = document.querySelector('.main');
  if (!dotsRail) dotsRail = document.querySelector('.dots-rail');
  if (!dotFlyout) dotFlyout = document.querySelector('.dot-flyout');
  if (!menuCap) menuCap = document.querySelector('.menu-rail__cap');
  if (!progressWidgetRoot) progressWidgetRoot = document.getElementById('pw-root');
  if (sections.length === 0) {
    refreshSectionsFromLabels();
  }
}

function init() {
  // Safari fix: Убедимся что все элементы DOM найдены
  ensureElements();

  // Feature detection
  detectBackdropFilter();
  applyHasSelectorFallback();

  const modeState = updateMode();

  initMenuInteractions();
  attachEdgeGesture(); // Attach only if tablet mode
  attachMenuSwipes(); // Swipe support for touch devices
  attachScrollHideHeader(); // Auto-hide header/dock on scroll
  initMenuLinks();

  lazyFeatures.observeAll();

  requestLayoutMetricsUpdate({
    force: !layoutMetricsInitialized,
    modeChanged: modeState?.modeChanged,
  });

  // Функции, зависящие от габаритов visual viewport:
  // - handleModeUpdate() → updateMode() → data-mode/data-input
  // - scheduleLayoutMetricsUpdate() → updateLayoutMetrics()
  // Они должны реагировать на любые изменения визуального viewport
  // (клавиатура, pinch-zoom, scroll внутри визуального viewport).

  // Более быстрая обработка resize через RAF вместо debounce
  const handleResize = () => {
    recordViewportGeometry(window.visualViewport);
    handleModeUpdate();
  };

  trackEvent(window, 'resize', handleResize, undefined, {
    module: 'layout.mode',
    target: 'window',
  });

  const bindVisualViewportListeners = () => {
    if (visualViewportListenersBound) {
      if (window.DEBUG_MODE_DETECTION) {
        console.log('[layout.mode] visualViewport listeners already bound, skipping duplicate subscription');
      }
      return true;
    }

    const viewport = window.visualViewport;

    if (!viewport || typeof viewport.addEventListener !== 'function') {
      if (window.DEBUG_MODE_DETECTION) {
        console.log('[layout.mode] visualViewport unsupported, relying on window resize/orientation listeners');
      }
      return false;
    }

    visualViewportListenersBound = true;
    recordViewportGeometry(viewport);

    const handleViewportGeometry = () => {
      if (!recordViewportGeometry(viewport)) {
        return;
      }
      handleModeUpdate();
    };

    trackEvent(viewport, 'resize', handleViewportGeometry, undefined, {
      module: 'layout.mode',
      target: 'visualViewport',
    });

    if (window.DEBUG_MODE_DETECTION) {
      console.log('[layout.mode] visualViewport listeners attached');
    }

    return true;
  };

  bindVisualViewportListeners();

  // Orientationchange
  const handleOrientationChange = () => {
    // Даем браузеру время обновить размеры перед проверкой
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        recordViewportGeometry(window.visualViewport);
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
        recordViewportGeometry(window.visualViewport);
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
    menuState.setOpen(false, { silent: true });
    body.classList.remove('is-slid');
    body.removeAttribute('data-scroll');
    delete body.dataset.lock;
    delete root.dataset.lock;
    menuState.refreshHandles();
  }, { module: 'menu.lifecycle', kind: 'state-reset' });

  registerLifecycleDisposer(() => {
    if (layoutMetricsRaf !== null) {
      cancelAnimationFrame(layoutMetricsRaf);
      layoutMetricsRaf = null;
    }
    if (modeUpdateRaf !== null) {
      cancelAnimationFrame(modeUpdateRaf);
      modeUpdateRaf = null;
    }
    lastVisualViewportWidth = null;
    lastVisualViewportHeight = null;
    visualViewportListenersBound = false;
    viewportGeometryDirty = false;
    layoutMetricsInitialized = false;
  }, { module: 'layout.metrics', kind: 'raf' });

  return (reason) => {
    lazyFeatures.disconnect();
    detachEdgeGesture();
    detachMenuSwipes();
    detachTrap();
    detachFlyoutListeners();
    if (modeUpdateRaf !== null) {
      cancelAnimationFrame(modeUpdateRaf);
      modeUpdateRaf = null;
    }
    lastVisualViewportWidth = null;
    lastVisualViewportHeight = null;
    visualViewportListenersBound = false;
    viewportGeometryDirty = false;
    layoutMetricsInitialized = false;
    if (typeof stackCarouselCleanup === 'function') {
      try {
        stackCarouselCleanup();
      } catch (error) {
        console.error('[Lifecycle] Failed to cleanup stack carousel', { error, reason });
      }
    }
    stackCarouselCleanup = null;
    if (typeof progressWidgetCleanup === 'function') {
      try {
        progressWidgetCleanup();
      } catch (error) {
        console.error('[Lifecycle] Failed to cleanup progress widget', { error, reason });
      }
    }
    progressWidgetCleanup = null;
    dotsFeatureActive = false;
    teardownObserver();
    scrollHideControls.detach();
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
        pauseApp({ reason: 'visibilitychange' });
      } else if (document.visibilityState === 'visible') {
        resumeApp({ reason: 'visibilitychange' });
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

let lifecycle = null;
let initCleanup = null;
let disposeLoadListener = () => { };
let removePageHooks = () => { };
let disposed = false;
let paused = true;

function mountInteractive(context = {}) {
  lifecycle = createLifecycleRegistry('toosmart:init');
  setActiveLifecycle(lifecycle);

  try {
    initCleanup = init();
  } catch (error) {
    console.error('[Lifecycle] init() failed', { error, context });
    initCleanup = null;
  }

  const handleWindowLoad = () => {
    requestLayoutMetricsUpdate({ elementChanged: true });
  };

  disposeLoadListener = trackEvent(window, 'load', handleWindowLoad, undefined, {
    module: 'layout.metrics',
    target: 'window',
  });

  requestLayoutMetricsUpdate({ force: !layoutMetricsInitialized });
}

function unmountInteractive(payload = {}) {
  const cleanupReason = payload && typeof payload === 'object' ? payload : { reason: String(payload) };

  try {
    if (typeof initCleanup === 'function') {
      initCleanup(cleanupReason);
    }
  } catch (error) {
    console.error('[Lifecycle] init cleanup failed', { error, cleanupReason });
  }
  initCleanup = null;

  try {
    if (typeof disposeLoadListener === 'function') {
      disposeLoadListener();
    }
  } catch (error) {
    console.error('[Lifecycle] Failed to remove load listener', error);
  }
  disposeLoadListener = () => { };

  if (lifecycle) {
    try {
      lifecycle.disposeAll();
    } catch (error) {
      console.error('[Lifecycle] disposeAll failed', { error, cleanupReason });
    }
  }
  lifecycle = null;
  setActiveLifecycle(null);
}

function logLifecycleEvent(stage, payload) {
  const snapshot = resourceDiagnostics.snapshot();
  console.info(`[Lifecycle] ${stage}`, {
    payload,
    activeResources: snapshot.total,
    byKind: snapshot.byKind,
  });
  return snapshot;
}

function pauseApp(payload = {}) {
  if (disposed) return;
  if (paused) return;

  logLifecycleEvent('pause:start', payload);
  paused = true;
  unmountInteractive(payload);
  logLifecycleEvent('pause:complete', payload);
}

function resumeApp(payload = {}) {
  if (disposed) return;
  if (!paused && lifecycle) {
    return;
  }

  logLifecycleEvent('resume:start', payload);
  paused = false;
  mountInteractive(payload);
  logLifecycleEvent('resume:complete', payload);
}

function disposeApp(payload = {}) {
  if (disposed) return;
  logLifecycleEvent('dispose:start', payload);
  disposed = true;
  paused = true;

  removePageHooks();
  removePageHooks = () => { };

  unmountInteractive(payload);
  logLifecycleEvent('dispose:complete', payload);
}

removePageHooks = bindPageLifecycle(disposeApp);

const metricsOverlay = createMetricsOverlay(resourceDiagnostics);

if (window.DEBUG_METRICS_OVERLAY) {
  metricsOverlay.start();
}

if (document.visibilityState !== 'hidden') {
  resumeApp({ reason: 'init' });
}

initCta();

const appApi = {
  dispose: disposeApp,
  pause: pauseApp,
  resume: resumeApp,
  teardown() {
    removePageHooks();
    removePageHooks = () => { };
  },
  getResources() {
    return lifecycle ? lifecycle.report() : [];
  },
  getResourceDiagnostics() {
    return resourceDiagnostics.snapshot();
  },
  logResourceDiagnostics(label) {
    return resourceDiagnostics.logSnapshot(label);
  },
  getFlyoutDiagnostics() {
    return {
      initTimeline: [...flyoutInitTimeline],
      setActiveSectionTimeline: [...setActiveSectionTimeline],
      bridge: describeSetActiveSectionBridge(),
    };
  },
  destroy(reason = 'destroy') {
    try {
      this.teardown();
    } catch (error) {
      console.error('[Lifecycle] Failed to teardown before destroy', error);
    }
    disposeApp({ reason });
    if (window[APP_GLOBAL_KEY] === this) {
      try {
        delete window[APP_GLOBAL_KEY];
      } catch (error) {
        window[APP_GLOBAL_KEY] = undefined;
      }
    }
  },
  audit: '2024-12-20',
};

window[APP_GLOBAL_KEY] = appApi;

const globalResourceDiagnostics = window.__TOOSMART_RESOURCES__ || {};
globalResourceDiagnostics.summary = () => resourceDiagnostics.snapshot();
globalResourceDiagnostics.log = (label) => resourceDiagnostics.logSnapshot(label);
globalResourceDiagnostics.overlay = {
  toggle: () => metricsOverlay.toggle(),
  show: () => metricsOverlay.start(),
  hide: () => metricsOverlay.stop(),
  isActive: () => metricsOverlay.isActive(),
};

window.__TOOSMART_RESOURCES__ = globalResourceDiagnostics;

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
