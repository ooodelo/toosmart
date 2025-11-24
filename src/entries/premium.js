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

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'premium';

// Инициализируем CTA модальное окно
initCta();
initModalsLogic();

console.log('[App] Premium version initialized');
