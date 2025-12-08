/**
 * Entry point для PREMIUM версии
 * Полный контент без CTA модального окна
 */

// Импортируем основной скрипт, но не блокируем CTA/модалки, если он упадет в dev
import('../script.js').catch((err) => {
  console.error('[App] Base script failed to load', err);
});

// Импортируем CTA функциональность (для free страниц и paywall)
import { initCta } from '../cta.js';
import { initModalsLogic } from '../js/modals-logic.js';
import '../legal-modals.js';

// Флаг для dev-бейпаса логина (в проде всегда false)
window.__DEV_LOGIN_BYPASS__ = import.meta.env.DEV;

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'premium';

// Инициализируем CTA модальное окно
initCta();
initModalsLogic();
// Инициализируем куки баннер (alias без слова cookie в пути)
import('../js/consent-banner.js')
  .then(({ initCookieBanner }) => {
    if (typeof initCookieBanner === 'function') {
      initCookieBanner();
    }
  })
  .catch((err) => {
    console.warn('[App] Consent banner failed/blocked, continuing without it', err);
  });

console.log('[App] Premium version initialized');
