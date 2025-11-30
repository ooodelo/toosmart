/**
 * Form Validation Localization
 * 
 * Заменяет стандартные английские сообщения HTML5 валидации на русские
 */

/**
 * Применяет русификацию валидационных сообщений к форме
 * @param {HTMLFormElement} form - Форма для локализации
 */
export function localizeValidation(form) {
    if (!form) {
        console.warn('Form validation: form element is null');
        return;
    }

    const inputs = form.querySelectorAll('input[required], input[type="email"], input[minlength]');

    inputs.forEach(input => {
        // Обработчик события invalid - заменяет сообщение при валидации
        input.addEventListener('invalid', function (e) {
            e.preventDefault();
            this.classList.add('invalid');

            if (this.validity.valueMissing) {
                // Поле обязательно, но пустое
                if (this.type === 'email') {
                    this.setCustomValidity('Пожалуйста, введите email');
                } else if (this.type === 'password') {
                    this.setCustomValidity('Пожалуйста, введите пароль');
                } else if (this.type === 'checkbox') {
                    this.setCustomValidity('Необходимо поставить галочку');
                } else {
                    this.setCustomValidity('Пожалуйста, заполните это поле');
                }
            } else if (this.validity.typeMismatch && this.type === 'email') {
                // Неправильный формат email
                this.setCustomValidity('Некорректный формат email');
            } else if (this.validity.tooShort) {
                // Слишком короткое значение
                this.setCustomValidity(`Минимум ${this.minLength} символов`);
            } else if (this.validity.tooLong) {
                // Слишком длинное значение
                this.setCustomValidity(`Максимум ${this.maxLength} символов`);
            } else {
                // Сбрасываем сообщение, если ошибок нет
                this.setCustomValidity('');
                this.classList.remove('invalid');
            }
        });

        // Сбрасываем кастомное сообщение при вводе
        input.addEventListener('input', function () {
            this.setCustomValidity('');
            this.classList.remove('invalid');
        });

        // Сбрасываем кастомное сообщение при изменении (для checkbox, radio)
        input.addEventListener('change', function () {
            this.setCustomValidity('');
            this.classList.remove('invalid');
        });
    });
}

/**
 * Автоматическая инициализация для всех форм на странице
 * Использовать только если форма не имеет специальной обработки
 */
export function initAllForms() {
    document.querySelectorAll('form').forEach(form => {
        localizeValidation(form);
    });
}
