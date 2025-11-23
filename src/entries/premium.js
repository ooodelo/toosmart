/**
 * Entry point для PREMIUM версии
 * Полный контент без CTA модального окна
 */

// Импортируем основной скрипт
import '../script.js';

// Импортируем CTA функциональность (для free страниц и paywall)
import { initCta } from '../cta.js';

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'premium';

// Инициализируем CTA модальное окно
initCta();

console.log('[App] Premium version initialized');
