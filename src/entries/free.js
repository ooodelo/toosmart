/**
 * Entry point для FREE версии
 * Включает CTA функциональность для модального окна оплаты
 */

// Импортируем основной скрипт, но не блокируем CTA/модалки, если он упадет в dev
import('../script.js').catch((err) => {
  console.error('[App] Base script failed to load', err);
});

// Импортируем и инициализируем CTA для free версии
import { initCta } from '../cta.js';
import { initModalsLogic } from '../js/modals-logic.js';
import { initDynamicPaywall } from '../js/paywall-dynamic.js';
import '../legal-modals.js';

// Флаг для dev-бейпаса логина (в проде всегда false)
window.__DEV_LOGIN_BYPASS__ = import.meta.env.DEV;

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'free';

// Инициализируем CTA
initCta();
// Инициализируем логику модальных окон
initModalsLogic();
// Инициализируем куки баннер (глушим контент-блокеры)
import('../js/consent-banner.js')
  .then(({ initCookieBanner }) => {
    if (typeof initCookieBanner === 'function') {
      initCookieBanner();
    }
  })
  .catch((err) => {
    console.warn('[App] Consent banner failed/blocked, continuing without it', err);
  });
// Инициализируем новый paywall
initDynamicPaywall();

console.log('[App] Free version initialized');
