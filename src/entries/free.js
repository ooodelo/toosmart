/**
 * Entry point для FREE версии
 * Включает CTA функциональность для модального окна оплаты
 */

// Импортируем и инициализируем CTA для free версии
import { initCta } from '../cta.js';
import { initModalsLogic } from '../js/modals-logic.js';
import { initDynamicPaywall } from '../js/paywall-dynamic.js';
import '../legal-modals.js';

// Флаг для dev-бейпаса логина (в проде всегда false)
window.__DEV_LOGIN_BYPASS__ = import.meta.env.DEV;

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'free';

// Ненавязчивая подгрузка базового бандла (меню/прочие фичи) после основного контента
function scheduleBaseScript() {
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    import('../script.js').catch((err) => {
      console.error('[App] Base script failed to load', err);
    });
  };

  const ric = window.requestIdleCallback || null;
  if (typeof ric === 'function') {
    ric(load, { timeout: 1200 });
  } else {
    // Старые iOS/Safari: короткая задержка, чтобы не конкурировать с рендером
    setTimeout(load, 500);
  }
}

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
// Инициализируем новый paywall (после готовности DOM)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initDynamicPaywall());
} else {
  initDynamicPaywall();
}

// Подгружаем базовый бандл без блокировки рендера
scheduleBaseScript();

console.log('[App] Free version initialized');
