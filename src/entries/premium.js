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
import { initCookieBanner } from '../js/cookie-banner.js';
import '../legal-modals.js';

// Флаг для dev-бейпаса логина (в проде всегда false)
window.__DEV_LOGIN_BYPASS__ = import.meta.env.DEV;

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'premium';

// Инициализируем CTA модальное окно
initCta();
initModalsLogic();
// Инициализируем куки баннер
initCookieBanner();

console.log('[App] Premium version initialized');
