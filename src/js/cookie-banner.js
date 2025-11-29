/**
 * Cookie Banner Logic
 * Устойчивый продакшен-обработчик показа и кликов по баннеру согласия.
 */

const CONSENT_KEY = 'cookieConsent';
const memoryStorage = {};
let initialized = false;

function safeGet(key) {
  try {
    return window.localStorage ? window.localStorage.getItem(key) : memoryStorage[key];
  } catch (error) {
    return memoryStorage[key];
  }
}

function safeSet(key, value) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch (error) {
    // fall back to memory storage
  }
  memoryStorage[key] = value;
}

export function initCookieBanner() {
  if (typeof window !== 'undefined' && window.COOKIE_BANNER_DISABLED) {
    return;
  }

  if (initialized) return;
  initialized = true;

  const onReady = () => attachBannerHandlers();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
}

function attachBannerHandlers() {
  // Экспортируем функции заранее, чтобы inline-обработчики не падали
  window.closeCookieBanner = closeCookieBanner;
  window.acceptCookies = acceptCookies;
  window.declineCookies = declineCookies;
  window.openCookieBanner = openCookieBanner;

  const banner = document.getElementById('cookie-banner');
  if (!banner) return;

  const consent = safeGet(CONSENT_KEY);
  if (!consent) {
    openCookieBanner();
  }

  const acceptBtn = banner.querySelector('.cookie-btn-accept');
  const declineBtn = banner.querySelector('.cookie-btn-decline');
  const closeBtn = banner.querySelector('.cookie-close');

  if (acceptBtn && !acceptBtn.dataset.bound) {
    acceptBtn.dataset.bound = 'true';
    acceptBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      acceptCookies();
    });
  }

  if (declineBtn && !declineBtn.dataset.bound) {
    declineBtn.dataset.bound = 'true';
    declineBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      declineCookies();
    });
  }

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = 'true';
    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeCookieBanner();
    });
  }

  if (!banner.dataset.bound) {
    banner.dataset.bound = 'true';
    banner.addEventListener('click', delegateCookieActions);
  }

  // Глобальный делегат — подстраховка, если кнопки рендерятся иначе или обработчики не навесились
  if (!document.__cookieDelegateBound) {
    document.__cookieDelegateBound = true;
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-cookie-action]');
      if (!target) return;
      const action = target.getAttribute('data-cookie-action');
      event.preventDefault();
      event.stopPropagation();
      runCookieAction(action);
    });
  }
}

function openCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.removeAttribute('hidden');
  }
}

function closeCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.setAttribute('hidden', '');
  }
}

function acceptCookies() {
  safeSet(CONSENT_KEY, 'accepted');
  closeCookieBanner();
  // Здесь можно вызвать загрузку аналитики при необходимости
}

function declineCookies() {
  safeSet(CONSENT_KEY, 'declined');
  closeCookieBanner();
}

function delegateCookieActions(event) {
  const actionTarget = event.target.closest('[data-cookie-action]');
  if (!actionTarget) return;

  const action = actionTarget.getAttribute('data-cookie-action');
  runCookieAction(action);
}

function runCookieAction(action) {
  switch (action) {
  case 'accept':
    acceptCookies();
    break;
  case 'decline':
    declineCookies();
    break;
  case 'close':
    closeCookieBanner();
    break;
  default:
    break;
  }
}

// Запускаем автоматически, но экспорт оставляем для совместимости
// Инициализация вызывается из entry-скриптов (free/premium), чтобы сохранить порядок инициализации модалок.
