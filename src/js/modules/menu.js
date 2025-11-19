/**
 * Menu State Controller
 * Manages the state of the side menu and its handles.
 */
export function createMenuStateController({ body, handles = [] } = {}) {
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
      apply();
    }
    return open;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
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
