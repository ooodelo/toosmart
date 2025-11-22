import { ModeUtils as ModeUtilsModule } from './js/mode-utils.js';
import './js/auth-check.js';

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
let dotsRail = null;
let dotFlyout = null;
let sections = [];
let menuCap = null;
let progressWidgetRoot = null;

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

  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const anchorRect = anchor.getBoundingClientRect();
  const styles = window.getComputedStyle(pwRoot);

  if (viewportWidth > 0 && anchorRect.width > 0) {
    const pwWidth = Math.max(pwRoot.offsetWidth || 0, parseCssNumber(styles.width));
    const maxLeft = Math.max(0, Math.min(anchorRect.left, viewportWidth - pwWidth));
    pwRoot.style.setProperty('--pw-float-left', `${Math.round(maxLeft)}px`);
  }

  if (viewportHeight > 0) {
    const gap = 10;
    const bottom = anchorRect.top > 0
      ? Math.max(gap, Math.round(viewportHeight - anchorRect.top + gap))
      : Math.max(gap, Math.round(parseCssNumber(styles.bottom)) || gap);
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
    const shouldEnable = currentMode === 'mobile' || currentMode === 'tablet';
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
  if (!dotsRail) return;
  clearElement(dotsRail);
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
  observerDisposer = trackObserver(observer, {
    label: 'section-progress',
    target: '.text-section',
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
    scrollLockOffset = window.scrollY || root.scrollTop || 0;
    body.dataset.lock = 'scroll';
    root.dataset.lock = 'scroll';
    body.style.position = 'fixed';
    body.style.inset = '0';
    body.style.width = '100%';
    body.style.top = `-${scrollLockOffset}px`;
  } else if (!shouldLock && isLocked) {
    delete body.dataset.lock;
    delete root.dataset.lock;
    body.style.position = '';
    body.style.inset = '';
    body.style.width = '';
    body.style.top = '';
    if (typeof window.scrollTo === 'function') {
      window.scrollTo(0, scrollLockOffset);
    }
  }
}

function initDots() {
  if (!dotsFeatureActive) {
    return;
  }
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
      if (!menuRail.contains(event.target)) return;
      // Перехватываем колесо/трекпад чтобы курсор над меню не скролил основной контент
      if (siteMenu && typeof event.deltaY === 'number') {
        const maxScroll = Math.max(0, siteMenu.scrollHeight - siteMenu.clientHeight);
        if (maxScroll > 0) {
          const nextScroll = Math.min(maxScroll, Math.max(0, siteMenu.scrollTop + event.deltaY));
          siteMenu.scrollTop = nextScroll;
        }
      }
      event.preventDefault();
      event.stopPropagation();
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
  if (!stack) return;

  const carousel = stack.querySelector('.stack-carousel');
  const indicator = stack.querySelector('.stack-indicator');

  if (!carousel || !indicator) return;

  // Задача 4: Динамическая карусель рекомендаций
  // Загружаем данные из JSON и генерируем слайды программно
  const RECOMMENDATIONS_URL = '/shared/recommendations.json';
  const CARDS_PER_SLIDE = 2;

  // Функция создания карточки рекомендации
  function createCard(rec) {
    const card = document.createElement('a');
    card.className = 'stack-card';
    card.href = `/recommendations/${rec.slug}.html`;
    card.setAttribute('data-analytics', 'recommendation-card');

    const imageDiv = document.createElement('div');
    imageDiv.className = 'stack-card__image';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'stack-card__content';

    const title = document.createElement('h3');
    title.textContent = rec.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = rec.excerpt || '';

    contentDiv.appendChild(title);
    contentDiv.appendChild(excerpt);
    card.appendChild(imageDiv);
    card.appendChild(contentDiv);

    return card;
  }

  // Функция создания слайда с карточками
  function createSlide(cards, index, isActive) {
    const slide = document.createElement('div');
    slide.className = 'stack-slide';
    slide.setAttribute('data-slide', index.toString());
    slide.setAttribute('data-active', isActive ? 'true' : 'false');

    cards.forEach(card => slide.appendChild(card));
    return slide;
  }

  // Функция создания точки индикатора
  function createDot(index, isActive) {
    const dot = document.createElement('button');
    dot.className = 'stack-dot';
    dot.setAttribute('data-dot', index.toString());
    dot.setAttribute('data-active', isActive ? 'true' : 'false');
    dot.setAttribute('aria-label', `Слайд ${index + 1}`);
    return dot;
  }

  // Функция генерации карусели из данных
  function buildCarousel(recommendations) {
    // Очищаем существующий контент
    clearElement(carousel);
    clearElement(indicator);

    if (recommendations.length === 0) {
      stack.style.display = 'none';
      return { slides: [], dots: [] };
    }

    const slidesArray = [];
    const dotsArray = [];

    // Разбиваем рекомендации на слайды по CARDS_PER_SLIDE карточек
    const slideCount = Math.ceil(recommendations.length / CARDS_PER_SLIDE);

    for (let i = 0; i < slideCount; i++) {
      const startIdx = i * CARDS_PER_SLIDE;
      const endIdx = Math.min(startIdx + CARDS_PER_SLIDE, recommendations.length);
      const slideRecs = recommendations.slice(startIdx, endIdx);

      const cards = slideRecs.map(rec => createCard(rec));
      const slide = createSlide(cards, i, i === 0);
      carousel.appendChild(slide);
      slidesArray.push(slide);

      const dot = createDot(i, i === 0);
      indicator.appendChild(dot);
      dotsArray.push(dot);
    }

    return { slides: slidesArray, dots: dotsArray };
  }

  // Загружаем данные и инициализируем карусель
  let slides = [];
  let dots = [];
  let carouselInitialized = false;

  // Пробуем загрузить JSON с рекомендациями
  fetch(RECOMMENDATIONS_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(recommendations => {
      const result = buildCarousel(recommendations);
      slides = result.slides;
      dots = result.dots;

      if (slides.length > 0) {
        initCarouselInteractivity();
      }
      requestLayoutMetricsUpdate({ elementChanged: true });
    })
    .catch(error => {
      console.warn('[StackCarousel] Не удалось загрузить рекомендации:', error);
      // Используем существующие статичные слайды как fallback
      slides = Array.from(document.querySelectorAll('.stack-slide'));
      dots = Array.from(document.querySelectorAll('.stack-dot'));

      if (slides.length > 0) {
        initCarouselInteractivity();
      }
      requestLayoutMetricsUpdate({ elementChanged: true });
    });

  // Инициализация интерактивности карусели
  function initCarouselInteractivity() {
    if (carouselInitialized) return;
    carouselInitialized = true;

    if (slides.length === 0) return;

    let currentSlide = 0;
    let intervalDisposer = null;
    const pauseReasons = new Set();

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

    function isAutoplayPaused() {
      return pauseReasons.size > 0;
    }

    function scheduleAutoplay() {
      if (intervalDisposer) {
        intervalDisposer();
      }
      intervalDisposer = trackInterval(nextSlide, SLIDE_INTERVAL, {
        module: 'stackCarousel',
        detail: 'autoplay',
      });
    }

    function restartAutoplay() {
      if (isAutoplayPaused()) {
        return;
      }
      scheduleAutoplay();
    }

    function nextSlide() {
      if (isAutoplayPaused()) {
        return;
      }
      setActiveSlide(currentSlide + 1);
    }

    function stopAutoplay() {
      if (intervalDisposer) {
        intervalDisposer();
        intervalDisposer = null;
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
      if (!isAutoplayPaused()) {
        scheduleAutoplay();
      }
    }

    // Клики на точки для ручного переключения
    dots.forEach((dot, index) => {
      disposers.push(trackEvent(dot, 'click', () => {
        setActiveSlide(index);
        // Перезапускаем таймер после ручного переключения
        restartAutoplay();
      }, undefined, { module: 'stackCarousel', target: describeTarget(dot) }));
    });

    // Пауза при наведении мыши
    if (stack) {
      disposers.push(trackEvent(stack, 'mouseenter', () => {
        pauseAutoplay('hover');
      }, undefined, { module: 'stackCarousel', target: describeTarget(stack) }));

      disposers.push(trackEvent(stack, 'mouseleave', () => {
        resumeAutoplay('hover');
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
        pauseAutoplay('touch');
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
        resumeAutoplay('touch');
      }, { passive: true }, { module: 'stackCarousel', target: describeTarget(stack) }));

      disposers.push(trackEvent(stack, 'touchcancel', () => {
        isSwiping = false;
        swipeDirection = null;
        resumeAutoplay('touch');
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
        restartAutoplay();
      }
    }

    // Первоначальное обновление
    setActiveSlide(0);

    // Запускаем автопроигрывание
    restartAutoplay();

    let cleaned = false;

    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      stopAutoplay();
      pauseReasons.clear();
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
  } // Конец initCarouselInteractivity

  // Возвращаем cleanup для внешнего использования
  const mainCleanup = () => {
    carouselInitialized = false;
  };

  return mainCleanup;
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

  let slot = textContainer.querySelector('.pw-slot');
  let slotCreated = false;
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'pw-slot';
    textContainer.appendChild(slot);
    slotCreated = true;
  }

  const targetParent = document.body.contains(slot) ? slot : (document.body.contains(textContainer) ? textContainer : document.body);
  if (root.parentElement !== targetParent) {
    targetParent.appendChild(root);
  } else if (!targetParent.contains(root)) {
    targetParent.appendChild(root);
  }

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

  // Задача 2: Определяем тип страницы из data-атрибута
  const article = document.querySelector('article[data-page-type]');
  const pageType = article?.dataset.pageType || 'unknown';

  // Типы страниц: free, premium, recommendation, intro-free, intro-premium
  const isFreeVersion = pageType === 'free' || pageType === 'intro-free';
  const isRecommendation = pageType === 'recommendation';
  const isPremium = pageType === 'premium' || pageType === 'intro-premium';

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
  let centeringPending = false;
  let centeringTimerId = null;
  let ticking = false;
  const CENTERING_DELAY_MS = 720;

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

  function playForward() {
    const dotBaseTransform = 'translate(var(--pw-dot-translate-x), -50%)';
    const pctBaseTransform = 'translate(var(--pw-dot-translate-x), -50%)';
    const pctExitTransform = 'translate(var(--pw-dot-translate-x), calc(-50% + 8px))';

    if (prefersReduced) {
      dot.style.opacity = '0';
      pill.style.opacity = '1';
      pill.style.transform = 'translate(-50%,-50%) scaleX(1)';
      pct.style.opacity = '0';
      pct.style.transform = pctExitTransform;
      next.style.opacity = '1';
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
      { duration: 760, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );
    aPill = pill.animate(
      [
        { transform: 'translate(-50%,-50%) scaleX(0.001)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scaleX(0.72)', opacity: 1, offset: 0.42 },
        { transform: 'translate(-50%,-50%) scaleX(1.08)', opacity: 1, offset: 0.72 },
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 }
      ],
      { duration: 980, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );
    aPct = pct.animate(
      [
        { opacity: 1, transform: pctBaseTransform },
        { opacity: 0, transform: pctExitTransform }
      ],
      { duration: 360, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards', delay: 140 }
    );
    aNext = next.animate(
      [
        { opacity: 0, transform: 'translateY(8px)', letterSpacing: '0.4px' },
        { opacity: 1, transform: 'translateY(0)', letterSpacing: '0px' }
      ],
      { duration: 520, easing: 'cubic-bezier(0.19, 1, 0.22, 1)', fill: 'forwards', delay: 260 }
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
      { duration: 720, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );
    aPill = pill.animate(
      [
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scaleX(0.66)', opacity: 1, offset: 0.32 },
        { transform: 'translate(-50%,-50%) scaleX(0.001)', opacity: 0 }
      ],
      { duration: 820, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );
    aPct = pct.animate(
      [
        { opacity: 0, transform: pctEnterTransform },
        { opacity: 1, transform: pctBaseTransform }
      ],
      { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards', delay: 280 }
    );
    aNext = next.animate(
      [
        { opacity: 1, transform: 'translateY(0)', letterSpacing: '0px' },
        { opacity: 0, transform: 'translateY(6px)', letterSpacing: '0.4px' }
      ],
      { duration: 360, easing: 'cubic-bezier(0.55, 0.06, 0.68, 0.19)', fill: 'forwards', delay: 120 }
    );
  }

  const clearCenteringTimer = () => {
    if (centeringTimerId !== null) {
      clearTimeout(centeringTimerId);
      centeringTimerId = null;
    }
  };

  function finalizeDoneTransition() {
    if (doneState) return;
    clearCenteringTimer();
    centeringPending = false;
    doneState = true;
    root.classList.remove('is-centering');
    root.classList.add('is-done');
    root.setAttribute('aria-disabled', 'false');
    root.setAttribute('aria-label', 'Кнопка: Далее');
    playForward();
    requestLayoutMetricsUpdate({ elementChanged: true });
  }

  function startCenteringPhase(progressValue) {
    if (centeringPending || doneState) return;
    centeringPending = true;
    root.classList.add('is-centering');
    root.classList.remove('is-done');
    root.setAttribute('aria-disabled', 'true');
    root.setAttribute('aria-label', 'Прогресс чтения: ' + progressValue + '%');
    requestLayoutMetricsUpdate({ elementChanged: true });
    clearCenteringTimer();
    const delay = prefersReduced ? 0 : CENTERING_DELAY_MS;
    centeringTimerId = window.setTimeout(() => finalizeDoneTransition(), delay);
  }

  function resetProgressState(progressValue) {
    const hadButtonState = doneState || centeringPending;
    clearCenteringTimer();
    centeringPending = false;
    doneState = false;
    root.classList.remove('is-done', 'is-centering');
    root.setAttribute('aria-disabled', 'true');
    root.setAttribute('aria-label', 'Прогресс чтения: ' + progressValue + '%');
    if (hadButtonState) {
      playReverse();
      requestLayoutMetricsUpdate({ elementChanged: true });
    }
  }

  trackEvent(root, 'transitionend', (event) => {
    if (!centeringPending) return;
    if (event.target !== root) return;
    if (event.propertyName !== 'left' && event.propertyName !== 'transform') return;
    finalizeDoneTransition();
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

    const shouldBeDone = perc >= 100;

    if (shouldBeDone) {
      if (doneState) {
        root.setAttribute('aria-disabled', 'false');
        root.setAttribute('aria-label', 'Кнопка: Далее');
        return;
      }

      if (centeringPending) {
        return;
      }

      if (isMobileMode() && !isFreeVersion) {
        startCenteringPhase(perc);
      } else {
        finalizeDoneTransition();
      }
      return;
    }

    resetProgressState(perc);
  }

  // 7. Клик
  trackEvent(root, 'click', (e) => {
    if (doneState) {
      // При 100%: проверяем тип версии
      if (isFreeVersion && typeof window.openPaymentModal === 'function') {
        // FREE версия - открываем модальное окно покупки
        e.preventDefault();
        window.openPaymentModal();
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
  pct.style.opacity = '1';
  next.style.opacity = '0';
  updateProgressWidgetFloatingAnchors(root);
  update();

  // Обновить layout metrics после создания виджета
  requestLayoutMetricsUpdate({ elementChanged: true });

  const releaseLifecycleCleanup = registerLifecycleDisposer(() => {
    clearCenteringTimer();
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
  const hasPaywallTeaser = Boolean(document.querySelector('.premium-teaser'));
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

lazyFeatures.register('stack-carousel', {
  onEnter: () => activateStackCarouselFeature(),
});

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
  if (!dotsRail) dotsRail = document.querySelector('.dots-rail');
  if (!dotFlyout) dotFlyout = document.querySelector('.dot-flyout');
  if (!menuCap) menuCap = document.querySelector('.menu-rail__cap');
  if (!progressWidgetRoot) progressWidgetRoot = document.getElementById('pw-root');
  if (sections.length === 0) {
    sections.push(...Array.from(document.querySelectorAll('.text-section')));
  }
}

function init() {
  // Safari fix: Убедимся что все элементы DOM найдены
  ensureElements();

  // Feature detection
  detectBackdropFilter();

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
