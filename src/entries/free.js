/**
 * Entry point для FREE версии
 * Включает CTA функциональность для модального окна оплаты
 */

// Импортируем основной скрипт
import '../script.js';

// Импортируем и инициализируем CTA для free версии
import { initCta } from '../cta.js';

// Устанавливаем флаг версии
window.__APP_VERSION__ = 'free';

// Инициализируем CTA
initCta();

console.log('[App] Free version initialized');
