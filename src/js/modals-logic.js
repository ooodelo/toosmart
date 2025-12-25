/**
 * Logic for handling new modals (Payment Success, Fail, Settings)
 */

export function initModalsLogic() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}


function init() {
    const isDev = isDevHost(window.location.hostname);

    if (isDev) {
        setupDevModeMocks();
    }

    ensureHiddenByDefault();
    checkUrlParams();
    setupSettingsModal();
    setupGlobalFunctions();
}

function isDevHost(hostname = '') {
    return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)
        || /^10\./.test(hostname)
        || /^192\.168\./.test(hostname)
        || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
        || /\.local$/i.test(hostname);
}

function ensureHiddenByDefault() {
    document.querySelectorAll('.modal:not([hidden]), .cookie-banner:not([hidden])')
        .forEach((el) => el.setAttribute('hidden', ''));
}

// Mock API responses in dev mode 
function setupDevModeMocks() {
    const originalFetch = window.fetch;

    window.fetch = function (url, options) {
        // Mock payment success API
        if (url.includes('/server/api/get-payment-success.php')) {
            console.log('Dev Mode: Mocking payment success API');
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    status: 'success',
                    email: 'dev@example.com',
                    password: 'DevPassword123'
                })
            });
        }

        // Mock user info API
        if (url.includes('/server/api/user-info.php')) {
            console.log('Dev Mode: Mocking user info API');
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    status: 'success',
                    email: 'dev@example.com'
                })
            });
        }

        // Mock change password API
        if (url.includes('/server/change-password.php')) {
            console.log('Dev Mode: Mocking change password API');
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    status: 'success',
                    message: 'Пароль успешно изменен (dev mode)'
                })
            });
        }

        // Pass through other requests
        return originalFetch.apply(this, arguments);
    };
}


function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        openPaymentSuccessModal();
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'fail') {
        openPaymentFailModal();
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Global functions for inline onclicks
function setupGlobalFunctions() {
    window.openPaymentSuccessModal = openPaymentSuccessModal;
    window.closePaymentSuccessModal = closePaymentSuccessModal;
    window.openPaymentFailModal = openPaymentFailModal;
    window.closePaymentFailModal = closePaymentFailModal;
    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;
    window.copySuccessPassword = copySuccessPassword;
    window.handleCabinetClick = handleCabinetClick;
}

// --- Cabinet Button Logic ---

function detectPageContext() {
    const article = document.querySelector('[data-build-slot="body"]');
    const pageType = (article?.dataset.pageType || document.body.dataset.pageType || '').toLowerCase();
    const path = (window.location && window.location.pathname) || '';
    const hasPaywallTeaser = Boolean(document.querySelector('[data-paywall-root]')) || Boolean(document.querySelector('.premium-teaser'));

    const isPaywallType = pageType === 'free' || pageType === 'paywall' || pageType === 'intro-free';
    const isPremiumType = pageType === 'premium' || pageType === 'intro-premium';

    const isPaywallPath = /template-paywall/i.test(path) || (path.includes('/course/') && !path.includes('/premium/'));
    const isPremiumPath = path.startsWith('/premium/') || /template\.html$/i.test(path);

    return {
        isPaywall: hasPaywallTeaser || isPaywallType || isPaywallPath,
        isPremium: isPremiumType || isPremiumPath
    };
}

function handleCabinetClick() {
    // Яндекс.Метрика: Клик на Войти в ЛК
    if (typeof ym !== 'undefined') {
        ym(105634847, 'reachGoal', 'login_click');
    }

    // Dev/premium/paywall behavior is decided in JS, not inline HTML
    const { isPaywall, isPremium } = detectPageContext();

    if (isPremium && !isPaywall) {
        console.log('Cabinet: premium context detected -> Opening Settings Modal');
        openSettingsModal();
        return;
    }

    console.log('Cabinet: paywall/guest context detected -> Opening Login Modal');
    if (window.openLoginModal) window.openLoginModal();
}

// --- Payment Success Modal ---

async function openPaymentSuccessModal() {
    const modal = document.getElementById('payment-success-modal');
    if (!modal) return;

    // Яндекс.Метрика: Успешная оплата
    if (typeof ym !== 'undefined') {
        ym(105634847, 'reachGoal', 'payment_success');
    }

    // Fetch password data
    try {
        const response = await fetch('/server/api/get-payment-success.php');
        const data = await response.json();

        if (data.status === 'success' && data.password) {
            const passwordField = document.getElementById('success-password-display');
            const container = document.getElementById('success-password-container');
            if (passwordField) passwordField.value = data.password;
            if (container) container.style.display = 'flex';
        } else {
            // Password expired or not found
            document.getElementById('success-password-container').style.display = 'none';
        }
    } catch (e) {
        console.error('Error fetching payment data:', e);
    }

    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
}

function closePaymentSuccessModal() {
    const modal = document.getElementById('payment-success-modal');
    if (modal) {
        modal.setAttribute('hidden', '');
        document.body.style.overflow = '';
    }
}

function copySuccessPassword() {
    const field = document.getElementById('success-password-display');
    const text = field?.value || field?.textContent || '';
    const button = document.querySelector('[onclick="copySuccessPassword()"]');

    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess(button);
        }).catch(() => {
            // Fallback to execCommand for Safari in iframe or older browsers
            fallbackCopyToClipboard(text, button);
        });
    } else {
        // Fallback for older browsers or Safari restrictions
        fallbackCopyToClipboard(text, button);
    }
}

function fallbackCopyToClipboard(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(button);
        } else {
            showCopyError(button);
        }
    } catch (err) {
        showCopyError(button);
    }

    document.body.removeChild(textArea);
}

function showCopySuccess(button) {
    if (button) {
        button.style.borderColor = '#4CAF50';
        button.style.backgroundColor = '#e8f5e9';
        setTimeout(() => {
            button.style.borderColor = '';
            button.style.backgroundColor = '';
        }, 1500);
    }
}

function showCopyError(button) {
    if (button) {
        button.style.borderColor = '#d32f2f';
        button.style.backgroundColor = '#ffebee';
        setTimeout(() => {
            button.style.borderColor = '';
            button.style.backgroundColor = '';
        }, 1500);
    }
}

// --- Payment Fail Modal ---

function openPaymentFailModal() {
    const modal = document.getElementById('payment-fail-modal');
    if (modal) {
        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closePaymentFailModal() {
    const modal = document.getElementById('payment-fail-modal');
    if (modal) {
        modal.setAttribute('hidden', '');
        document.body.style.overflow = '';
    }
}

// --- Settings Modal ---

async function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // Fetch user info
    try {
        const response = await fetch('/server/api/user-info.php');
        const data = await response.json();
        if (data.status === 'success') {
            document.getElementById('settings-email').textContent = data.email;
        } else {
            // Not logged in? Redirect or show error
            window.location.href = '/';
            return;
        }
    } catch (e) {
        console.error(e);
    }

    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.setAttribute('hidden', '');
        document.body.style.overflow = '';
        // Reset form and clear field colors
        const form = document.getElementById('settings-password-form');
        if (form) {
            form.reset();
            form.querySelectorAll('input').forEach(input => {
                input.style.borderColor = '';
                input.style.backgroundColor = '';
            });
        }
    }
}

function setupSettingsModal() {
    const form = document.getElementById('settings-password-form');
    if (!form) return;

    // Локализация валидационных сообщений
    const inputs = form.querySelectorAll('input[required]');
    inputs.forEach(input => {
        input.addEventListener('invalid', function (e) {
            e.preventDefault();
            this.classList.add('invalid');
            if (this.validity.valueMissing) {
                this.setCustomValidity('Пожалуйста, заполните это поле');
            } else {
                this.setCustomValidity('');
                this.classList.remove('invalid');
            }
        });
        input.addEventListener('input', function () {
            this.setCustomValidity('');
            this.classList.remove('invalid');
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const formInputs = form.querySelectorAll('input');

        // Reset all field colors
        formInputs.forEach(input => {
            input.style.borderColor = '';
            input.style.backgroundColor = '';
        });

        try {
            const response = await fetch('/server/change-password.php', {
                method: 'POST',
                body: JSON.stringify(Object.fromEntries(formData)),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            if (data.status === 'success') {
                // Success: green borders on all fields
                formInputs.forEach(input => {
                    input.style.borderColor = '#4CAF50';
                    input.style.backgroundColor = '#e8f5e9';
                });
                // Reset form after brief delay
                setTimeout(() => {
                    form.reset();
                    formInputs.forEach(input => {
                        input.style.borderColor = '';
                        input.style.backgroundColor = '';
                    });
                }, 2000);
            } else {
                // Error: red borders on all fields
                formInputs.forEach(input => {
                    input.style.borderColor = '#d32f2f';
                    input.style.backgroundColor = '#ffebee';
                });
            }
        } catch (e) {
            // Network error: red borders on all fields
            formInputs.forEach(input => {
                input.style.borderColor = '#d32f2f';
                input.style.backgroundColor = '#ffebee';
            });
        }
    });
}
