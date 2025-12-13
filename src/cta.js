/**
 * CTA (Call-to-Action) функциональность
 *
 * Управляет модальным окном оплаты и интеграцией с Robokassa
 */

import { localizeValidation } from './js/form-validation.js';

export function initCta() {
  // Ждём загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

function init() {
  // Навешиваем обработчики на все CTA кнопки
  // Ищем кнопки по классу .cta-button И по инлайн onclick
  const ctaButtons = document.querySelectorAll('.cta-button, button[onclick*="openCTAModal"]');
  ctaButtons.forEach(button => {
    // Удаляем inline onclick если есть
    button.removeAttribute('onclick');
    button.addEventListener('click', openCTAModal);
  });

  // Обработчики для модального окна
  const modal = document.getElementById('cta-payment-modal');
  if (modal) {
    // На всякий случай скрываем, если оно попало в DOM без hidden
    if (!modal.hasAttribute('hidden')) {
      modal.setAttribute('hidden', '');
    }

    const closeBtn = modal.querySelector('.modal-close');
    const overlay = modal.querySelector('.modal-overlay');
    const form = modal.querySelector('#payment-form');

    if (closeBtn) closeBtn.addEventListener('click', closeCTAModal);
    if (overlay) overlay.addEventListener('click', closeCTAModal);
    if (form) {
      form.addEventListener('submit', handlePayment);
      setupInlineValidation(form);
      localizeValidation(form);
    }
    const promoBtn = modal.querySelector('#promo-apply-btn');
    if (promoBtn) {
      promoBtn.addEventListener('click', applyPromo);
    }

    // Закрытие по Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        closeCTAModal();
      }
    });
  }
}

let previousActiveElement = null;
let appliedPromo = null;

/**
 * Открывает модальное окно CTA
 */
function openCTAModal(event) {
  if (event) event.preventDefault();

  const modal = document.getElementById('cta-payment-modal');
  if (!modal) {
    console.error('CTA modal not found');
    return;
  }

  previousActiveElement = document.activeElement;

  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  // Фокус на поле email
  const emailInput = modal.querySelector('input[name="email"]');
  if (emailInput) {
    setTimeout(() => emailInput.focus(), 100);
  }

  setupFocusTrap(modal);

  // Отправляем событие аналитики
  if (window.analytics && typeof window.analytics.track === 'function') {
    const slug = window.location.pathname.split('/').filter(Boolean).pop() || 'home';
    window.analytics.track('cta_click', { slug });
  } else {
    console.log('Analytics: CTA clicked');
  }
}

// Экспортируем функцию глобально для совместимости с inline onclick
// Делаем это в топлевеле модуля, чтобы было доступно глобально сразу при загрузке
if (typeof window !== 'undefined') {
  window.openCTAModal = openCTAModal;
  window.closeCTAModal = closeCTAModal;
}

/**
 * Закрывает модальное окно CTA
 */
function closeCTAModal() {
  const modal = document.getElementById('cta-payment-modal');
  if (!modal) return;

  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';

  if (previousActiveElement) {
    previousActiveElement.focus();
    previousActiveElement = null;
  }

  // Удаляем обработчик focus trap
  document.removeEventListener('keydown', handleFocusTrap);

  // Очищаем сообщения об ошибках
  const errorDiv = document.getElementById('payment-error');
  if (errorDiv) {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
  }

  // Сброс промокода
  appliedPromo = null;
  const promoStatus = document.getElementById('promo-status');
  const promoInput = document.getElementById('promo-code-input');
  const priceCurrent = document.querySelector('#cta-payment-modal .price-current');
  if (promoStatus) promoStatus.style.display = 'none';
  if (promoInput) promoInput.value = '';
  if (priceCurrent && priceCurrent.dataset.basePrice) {
    priceCurrent.textContent = priceCurrent.dataset.basePrice;
  }
}

/**
 * Логика Focus Trap
 */
function setupFocusTrap(modal) {
  document.addEventListener('keydown', handleFocusTrap);
}

function handleFocusTrap(e) {
  const modal = document.getElementById('cta-payment-modal');
  if (!modal || modal.hasAttribute('hidden')) return;

  if (e.key === 'Tab') {
    const focusableElements = modal.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="email"], input[type="radio"], input[type="checkbox"], select'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  }
}

async function applyPromo() {
  const modal = document.getElementById('cta-payment-modal');
  if (!modal) return;
  const promoInput = modal.querySelector('#promo-code-input');
  const emailInput = modal.querySelector('input[name="email"]');
  const statusEl = modal.querySelector('#promo-status');
  const priceCurrent = modal.querySelector('.price-current');
  if (!promoInput || !statusEl || !priceCurrent) return;

  const code = promoInput.value.trim().toUpperCase();
  if (!code) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#d32f2f';
    statusEl.textContent = 'Введите промокод';
    return;
  }

  if (!priceCurrent.dataset.basePrice) {
    priceCurrent.dataset.basePrice = priceCurrent.textContent;
  }

  const email = emailInput ? emailInput.value.trim() : 'guest@example.com';

  statusEl.style.display = 'block';
  statusEl.style.color = '#666';
  statusEl.textContent = 'Проверяем промокод...';

  try {
    const res = await fetch('/server/api/promo/validate.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        email,
        product_code: 'premium_course'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Промокод не принят');
    }
    appliedPromo = { code: data.code, amount: data.amount, base: data.base_amount };
    priceCurrent.textContent = formatCurrency(data.amount);
    statusEl.style.display = 'block';
    statusEl.style.color = '#2e7d32';
    statusEl.textContent = `Промокод применён. Итог: ${formatCurrency(data.amount)}`;
  } catch (error) {
    appliedPromo = null;
    priceCurrent.textContent = priceCurrent.dataset.basePrice || priceCurrent.textContent;
    statusEl.style.display = 'block';
    statusEl.style.color = '#d32f2f';
    statusEl.textContent = error.message || 'Промокод не принят';
  }
}

function formatCurrency(amount) {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
  } catch (e) {
    return `${amount} ₽`;
  }
}

/**
 * Inline валидация формы
 */
function setupInlineValidation(form) {
  const emailInput = form.querySelector('input[name="email"]');
  const checkbox = form.querySelector('input[name="accept_offer"]');
  const errorDiv = document.getElementById('payment-error');

  const validateEmail = () => {
    const email = emailInput.value.trim();
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    if (!email) {
      // Не показываем ошибку если пусто (только при сабмите или blur если было заполнено)
      return true;
    }

    if (!emailRegex.test(email)) {
      showError(errorDiv, 'Неверный формат email');
      emailInput.classList.add('invalid');
      return false;
    } else {
      if (errorDiv.textContent === 'Неверный формат email') {
        errorDiv.style.display = 'none';
      }
      emailInput.classList.remove('invalid');
      return true;
    }
  };

  if (emailInput) {
    emailInput.addEventListener('blur', validateEmail);
    emailInput.addEventListener('input', () => {
      if (emailInput.classList.contains('invalid')) {
        validateEmail();
      }
    });
  }

  if (checkbox) {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        checkbox.classList.remove('invalid');
        if (errorDiv.textContent === 'Необходимо согласие с условиями оферты') {
          errorDiv.style.display = 'none';
        }
      }
    });
  }
}

/**
 * Обработка отправки формы оплаты
 */
async function handlePayment(event) {
  event.preventDefault();

  const form = event.target;
  const errorDiv = document.getElementById('payment-error');
  const emailField = form.email;
  const acceptOfferField = form.accept_offer;
  const submitButton = form.querySelector('button[type="submit"]');
  const promoInput = form.querySelector('input[name="promo_code"]');

  // Проверка наличия обязательных полей формы
  const promoCode = promoInput ? promoInput.value.trim().toUpperCase() : '';

  if (!emailField) {
    showError(errorDiv, 'Ошибка формы: поле email не найдено');
    return;
  }

  if (!acceptOfferField) {
    showError(errorDiv, 'Ошибка формы: поле согласия не найдено');
    return;
  }

  const email = emailField.value ? emailField.value.trim() : '';
  const acceptOffer = acceptOfferField.checked;

  // Валидация email
  if (!email) {
    showError(errorDiv, 'Пожалуйста, укажите email');
    return;
  }

  if (!acceptOffer) {
    showError(errorDiv, 'Необходимо согласие с условиями оферты');
    acceptOfferField.classList.add('invalid');
    return;
  }

  // Улучшенная валидация email (более строгая проверка)
  // Проверяем: локальная часть @ домен с TLD
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(email)) {
    showError(errorDiv, 'Неверный формат email');
    return;
  }

  // Дополнительная проверка длины
  if (email.length > 254) {
    showError(errorDiv, 'Email слишком длинный');
    return;
  }

  // Показываем загрузку
  if (!submitButton) {
    showError(errorDiv, 'Ошибка формы: кнопка отправки не найдена');
    return;
  }

  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Создание счёта...';

  if (errorDiv) {
    errorDiv.style.display = 'none';
  }

  try {
    // Отправляем запрос на создание invoice через новый API
    const response = await fetch('/server/api/order/create.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        product_code: 'premium_course',
        promo_code: appliedPromo ? appliedPromo.code : (promoCode || null)
      })
    });

    const responseClone = response.clone();
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      const rawText = await responseClone.text().catch(() => '');
      console.error('Payment error: invalid JSON from /server/api/order/create.php', {
        parseError,
        rawText
      });
      throw new Error('Сервер оплат вернул некорректный ответ. Проверьте, запущен ли backend /server.');
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    if (data.endpoint && data.params) {
      // Отправляем событие аналитики
      if (window.analytics && typeof window.analytics.track === 'function') {
        window.analytics.track('payment_initiated', {
          invoice_id: data.params.InvId,
          amount: data.params.OutSum
        });
      } else {
        console.log('Analytics: Payment initiated', data.params.InvId);
      }

      // Создаем форму для POST-редиректа на Robokassa
      const paymentForm = document.createElement('form');
      paymentForm.method = 'POST';
      paymentForm.action = data.endpoint;

      // Добавляем все параметры как скрытые поля
      for (const [key, value] of Object.entries(data.params)) {
        if (value !== null && value !== undefined) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          paymentForm.appendChild(input);
        }
      }

      document.body.appendChild(paymentForm);
      paymentForm.submit();
    } else {
      throw new Error(data.error || 'Не удалось создать счёт');
    }
  } catch (error) {
    console.error('Payment error:', error);
    const friendlyMessage = error.message?.includes('Failed to fetch')
      ? 'Не удалось связаться с сервером оплаты. Проверьте подключение или запуск backend (/server).'
      : error.message || 'Произошла ошибка. Попробуйте ещё раз.';
    showError(errorDiv, friendlyMessage);
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

/**
 * Показывает сообщение об ошибке
 */
function showError(errorDiv, message) {
  if (!errorDiv) return;
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
