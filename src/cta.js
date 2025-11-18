/**
 * CTA (Call-to-Action) функциональность
 *
 * Управляет модальным окном оплаты и интеграцией с Robokassa
 */

(function() {
  'use strict';

  // Ждём загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Навешиваем обработчики на все CTA кнопки
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(button => {
      button.addEventListener('click', openCTAModal);
    });

    // Обработчики для модального окна
    const modal = document.getElementById('cta-payment-modal');
    if (modal) {
      const closeBtn = modal.querySelector('.modal-close');
      const overlay = modal.querySelector('.modal-overlay');
      const form = modal.querySelector('#payment-form');

      if (closeBtn) closeBtn.addEventListener('click', closeCTAModal);
      if (overlay) overlay.addEventListener('click', closeCTAModal);
      if (form) form.addEventListener('submit', handlePayment);

      // Закрытие по Escape
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
          closeCTAModal();
        }
      });
    }
  }

  /**
   * Открывает модальное окно CTA
   */
  function openCTAModal(event) {
    event.preventDefault();

    const modal = document.getElementById('cta-payment-modal');
    if (!modal) {
      console.error('CTA modal not found');
      return;
    }

    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';

    // Фокус на поле email
    const emailInput = modal.querySelector('input[name="email"]');
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 100);
    }

    // Отправляем событие аналитики
    if (window.analytics && typeof window.analytics.track === 'function') {
      const slug = window.location.pathname.split('/').filter(Boolean).pop() || 'home';
      window.analytics.track('cta_click', { slug });
    } else {
      console.log('Analytics: CTA clicked');
    }
  }

  /**
   * Закрывает модальное окно CTA
   */
  function closeCTAModal() {
    const modal = document.getElementById('cta-payment-modal');
    if (!modal) return;

    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';

    // Очищаем сообщения об ошибках
    const errorDiv = document.getElementById('payment-error');
    if (errorDiv) {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }
  }

  /**
   * Обработка отправки формы оплаты
   */
  async function handlePayment(event) {
    event.preventDefault();

    const form = event.target;
    const email = form.email.value.trim();
    const acceptOffer = form.accept_offer.checked;
    const submitButton = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('payment-error');

    // Валидация
    if (!email) {
      showError(errorDiv, 'Пожалуйста, укажите email');
      return;
    }

    if (!acceptOffer) {
      showError(errorDiv, 'Необходимо согласие с условиями оферты');
      return;
    }

    // Простая валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError(errorDiv, 'Неверный формат email');
      return;
    }

    // Показываем загрузку
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Создание счёта...';
    errorDiv.style.display = 'none';

    try {
      // Отправляем запрос на создание invoice
      const response = await fetch('/server/create-invoice.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (data.success && data.robokassa_url) {
        // Отправляем событие аналитики
        if (window.analytics && typeof window.analytics.track === 'function') {
          window.analytics.track('payment_initiated', {
            invoice_id: data.invoice_id,
            amount: data.amount
          });
        } else {
          console.log('Analytics: Payment initiated', data.invoice_id);
        }

        // Редирект на Robokassa
        window.location.href = data.robokassa_url;
      } else {
        throw new Error(data.error || 'Не удалось создать счёт');
      }
    } catch (error) {
      console.error('Payment error:', error);
      showError(errorDiv, error.message || 'Произошла ошибка. Попробуйте ещё раз.');
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

})();
