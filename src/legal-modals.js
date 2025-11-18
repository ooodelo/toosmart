/**
 * Динамическая загрузка legal модалок из dist/shared/legal/
 *
 * Согласно TZ_razrabotchika_v1.1:251-252:
 * JS по клику на data-legal подгружает dist/shared/legal/<key>.html
 * и вставляет внутрь модального окна
 */

(function () {
  'use strict';

  const LEGAL_BASE_PATH = '/shared/legal/';
  const loadedContent = new Map(); // Кэш загруженного контента

  /**
   * Открывает модальное окно с legal контентом
   * @param {string} legalType - тип legal документа (offer, privacy, etc.)
   */
  async function openLegalModal(legalType) {
    const modalId = `legal-${legalType}-modal`;
    const modal = document.getElementById(modalId);

    if (!modal) {
      console.error(`Модальное окно ${modalId} не найдено`);
      return;
    }

    // Загружаем контент, если еще не загружен
    if (!loadedContent.has(legalType)) {
      const content = await loadLegalContent(legalType);
      if (content) {
        loadedContent.set(legalType, content);
        injectContentIntoModal(modal, content);
      } else {
        console.error(`Не удалось загрузить контент для ${legalType}`);
        return;
      }
    }

    // Открываем модальное окно
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Фокусируем модальное окно для accessibility
    const closeButton = modal.querySelector('.modal-close');
    if (closeButton) {
      closeButton.focus();
    }
  }

  /**
   * Закрывает модальное окно
   * @param {string} legalType - тип legal документа
   */
  function closeLegalModal(legalType) {
    const modalId = `legal-${legalType}-modal`;
    const modal = document.getElementById(modalId);

    if (modal) {
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  /**
   * Загружает legal контент с сервера
   * @param {string} legalType - тип legal документа
   * @returns {Promise<string|null>} - HTML контент или null при ошибке
   */
  async function loadLegalContent(legalType) {
    const url = `${LEGAL_BASE_PATH}${legalType}.html`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(`Ошибка загрузки legal контента (${legalType}):`, error);
      return null;
    }
  }

  /**
   * Вставляет контент в модальное окно
   * @param {HTMLElement} modal - модальное окно
   * @param {string} content - HTML контент
   */
  function injectContentIntoModal(modal, content) {
    const contentContainer = modal.querySelector('.legal-text');

    if (contentContainer) {
      contentContainer.innerHTML = content;
    } else {
      console.error('Контейнер .legal-text не найден в модальном окне');
    }
  }

  /**
   * Обрабатывает клики по элементам с data-legal
   */
  function handleLegalLinks() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-legal]');

      if (target) {
        event.preventDefault();
        const legalType = target.getAttribute('data-legal');
        openLegalModal(legalType);
      }
    });
  }

  /**
   * Обрабатывает закрытие модалок по Escape
   */
  function handleEscapeKey() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const openModals = document.querySelectorAll('.legal-modal:not([hidden])');
        openModals.forEach((modal) => {
          const legalType = modal.id.replace('legal-', '').replace('-modal', '');
          closeLegalModal(legalType);
        });
      }
    });
  }

  /**
   * Инициализация модуля
   */
  function init() {
    // Проверяем, что DOM готов
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        handleLegalLinks();
        handleEscapeKey();
      });
    } else {
      handleLegalLinks();
      handleEscapeKey();
    }
  }

  // Экспортируем функции в глобальную область для совместимости с inline onclick
  window.openLegalModal = openLegalModal;
  window.closeLegalModal = closeLegalModal;

  // Запускаем инициализацию
  init();
})();
