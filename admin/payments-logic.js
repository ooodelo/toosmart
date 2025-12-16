// =====================================================
// PAYMENTS TAB LOGIC
// =====================================================

// Состояние для таба Платежи
const paymentsState = {
  product: null,
  emailTemplate: null,
  modalTexts: null
};

// Загрузка данных для таба Платежи
async function loadPaymentsData() {
  try {
    const [product, email, modal] = await Promise.all([
      apiCall('/admin/api/get-product.php'),
      apiCall('/admin/api/get-email-template.php'),
      apiCall('/admin/api/get-success-modal.php')
    ]);

    if (product.success) {
      paymentsState.product = product.product;
      document.getElementById('productName').value = product.product.name;
      document.getElementById('productPrice').value = product.product.price;
    }

    if (email.success) {
      paymentsState.emailTemplate = email.template;
      document.getElementById('emailSubject').value = email.template.subject;
      document.getElementById('emailBody').value = email.template.body;
      updateEmailPreview();
    }

    if (modal.success) {
      paymentsState.modalTexts = modal.texts;
      renderModalEditor(modal.texts);
      updateModalPreview();
    }
  } catch (error) {
    console.error('Error loading payments data:', error);
  }
}

// Сохранение продукта
async function saveProduct() {
  const name = document.getElementById('productName').value.trim();
  const price = parseFloat(document.getElementById('productPrice').value);

  if (!name || !price || price <= 0) {
    showFieldError('productName');
    showFieldError('productPrice');
    return;
  }

  const saveBtn = document.getElementById('saveProduct');
  saveBtn.disabled = true;

  try {
    const result = await apiCall('/admin/api/update-product.php', {
      method: 'POST',
      body: JSON.stringify({ name, price })
    });

    if (result.success) {
      showFieldSuccess('productName');
      showFieldSuccess('productPrice');
      setTimeout(() => {
        resetFieldStyle('productName');
        resetFieldStyle('productPrice');
      }, 2000);
    } else {
      showFieldError('productName');
      showFieldError('productPrice');
    }
  } catch (error) {
    showFieldError('productName');
    showFieldError('productPrice');
  } finally {
    saveBtn.disabled = false;
  }
}

// Сохранение email шаблона
async function saveEmailTemplate() {
  const subject = document.getElementById('emailSubject').value.trim();
  const body = document.getElementById('emailBody').value;

  if (!subject || !body) {
    showFieldError('emailSubject');
    showFieldError('emailBody');
    return;
  }

  if (!body.includes('{{email}}') || !body.includes('{{password}}')) {
    showFieldError('emailBody');
    return;
  }

  const saveBtn = document.getElementById('saveEmail');
  saveBtn.disabled = true;

  try {
    const result = await apiCall('/admin/api/update-email-template.php', {
      method: 'POST',
      body: JSON.stringify({ subject, body })
    });

    if (result.success) {
      showFieldSuccess('emailSubject');
      showFieldSuccess('emailBody');
      setTimeout(() => {
        resetFieldStyle('emailSubject');
        resetFieldStyle('emailBody');
      }, 2000);
    } else {
      showFieldError('emailSubject');
      showFieldError('emailBody');
    }
  } catch (error) {
    showFieldError('emailSubject');
    showFieldError('emailBody');
  } finally {
    saveBtn.disabled = false;
  }
}

// Сохранение модального окна
async function saveSuccessModal() {
  const introHooks = Array.from(document.querySelectorAll('#introHooksContainer input'))
    .map(inp => inp.value.trim())
    .filter(Boolean);

  const credentialsLabel = document.getElementById('credentialsLabel').value.trim();

  const outroHooks = Array.from(document.querySelectorAll('#outroHooksContainer input'))
    .map(inp => inp.value.trim())
    .filter(Boolean);

  const buttonText = document.getElementById('buttonText').value.trim();

  if (introHooks.length === 0 || !credentialsLabel || outroHooks.length === 0 || !buttonText) {
    return;
  }

  const saveBtn = document.getElementById('saveModal');
  saveBtn.disabled = true;

  try {
    const result = await apiCall('/admin/api/update-success-modal.php', {
      method: 'POST',
      body: JSON.stringify({
        intro_hooks: introHooks,
        credentials_label: credentialsLabel,
        outro_hooks: outroHooks,
        button_text: buttonText
      })
    });

    if (result.success) {
      showFieldSuccess('credentialsLabel');
      showFieldSuccess('buttonText');
      setTimeout(() => {
        resetFieldStyle('credentialsLabel');
        resetFieldStyle('buttonText');
      }, 2000);
    }
  } finally {
    saveBtn.disabled = false;
  }
}

// Live Preview для Email
function updateEmailPreview() {
  const subject = document.getElementById('emailSubject').value;
  const body = document.getElementById('emailBody').value;

  document.getElementById('emailPreviewSubject').textContent = subject;

  const previewBody = body
    .replace(/\{\{email\}\}/g, 'test@example.com')
    .replace(/\{\{password\}\}/g, 'DemoPassword123')
    .replace(/\{\{site_url\}\}/g, 'https://toosmart.ru')
    .replace(/\{\{reply_to\}\}/g, 'reply@toosmart.ru');

  document.getElementById('emailPreviewBody').textContent = previewBody;
}

// Render модального редактора
function renderModalEditor(texts) {
  // Вводные хуки
  const introContainer = document.getElementById('introHooksContainer');
  introContainer.innerHTML = '';
  texts.intro_hooks.forEach((hook, index) => {
    introContainer.innerHTML += `
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <input type="text" value="${hook}" style="flex: 1; padding: 8px 10px; border: 1.5px solid var(--border-light); border-radius: 6px; font-size: 13px;" onblur="updateModalPreview()">
        <button onclick="removeHook('intro', ${index})" style="padding: 8px 12px; background: var(--danger-soft); color: var(--danger); border: none; border-radius: 6px; cursor: pointer;">×</button>
      </div>
    `;
  });

  // Финальные хуки
  const outroContainer = document.getElementById('outroHooksContainer');
  outroContainer.innerHTML = '';
  texts.outro_hooks.forEach((hook, index) => {
    outroContainer.innerHTML += `
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <input type="text" value="${hook}" style="flex: 1; padding: 8px 10px; border: 1.5px solid var(--border-light); border-radius: 6px; font-size: 13px;" onblur="updateModalPreview()">
        <button onclick="removeHook('outro', ${index})" style="padding: 8px 12px; background: var(--danger-soft); color: var(--danger); border: none; border-radius: 6px; cursor: pointer;">×</button>
      </div>
    `;
  });

  document.getElementById('credentialsLabel').value = texts.credentials_label;
  document.getElementById('buttonText').value = texts.button_text;
}

// Добавить хук
function addIntroHook() {
  const container = document.getElementById('introHooksContainer');
  const index = container.children.length;
  container.innerHTML += `
    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <input type="text" placeholder="Новый хук" style="flex: 1; padding: 8px 10px; border: 1.5px solid var(--border-light); border-radius: 6px; font-size: 13px;" onblur="updateModalPreview()">
      <button onclick="removeHook('intro', ${index})" style="padding: 8px 12px; background: var(--danger-soft); color: var(--danger); border: none; border-radius: 6px; cursor: pointer;">×</button>
    </div>
  `;
}

function addOutroHook() {
  const container = document.getElementById('outroHooksContainer');
  const index = container.children.length;
  container.innerHTML += `
    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <input type="text" placeholder="Новый хук" style="flex: 1; padding: 8px 10px; border: 1.5px solid var(--border-light); border-radius: 6px; font-size: 13px;" onblur="updateModalPreview()">
      <button onclick="removeHook('outro', ${index})" style="padding: 8px 12px; background: var(--danger-soft); color: var(--danger); border: none; border-radius: 6px; cursor: pointer;">×</button>
    </div>
  `;
}

function removeHook(type, index) {
  const containerId = type === 'intro' ? 'introHooksContainer' : 'outroHooksContainer';
  const container = document.getElementById(containerId);
  container.children[index].remove();
  updateModalPreview();
}

// Live Preview для модального окна
function updateModalPreview() {
  const introHooks = Array.from(document.querySelectorAll('#introHooksContainer input'))
    .map(inp => inp.value || inp.placeholder)
    .filter(Boolean);

  const credentialsLabel = document.getElementById('credentialsLabel').value || 'Ваши данные для входа:';

  const outroHooks = Array.from(document.querySelectorAll('#outroHooksContainer input'))
    .map(inp => inp.value || inp.placeholder)
    .filter(Boolean);

  const buttonText = document.getElementById('buttonText').value || 'Войти в курс';

  const preview = document.getElementById('modalPreview');
  preview.innerHTML = `
    <style>
      .success-preview-shell {
        background: linear-gradient(140deg, #f5f7fb, #eef1f7);
        padding: 18px;
        border-radius: 22px;
        box-shadow: 0 18px 48px rgba(0,0,0,0.12), 0 4px 18px rgba(0,0,0,0.06);
        display: flex;
        justify-content: center;
      }
      .success-card {
        background: #ffffff;
        border-radius: 30px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.08);
        width: 100%;
        max-width: 520px;
        padding: 34px 32px 0 32px;
        overflow: hidden;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        color: #0f1629;
      }
      .success-head {
        text-align: center;
        margin-bottom: 24px;
      }
      .success-head .icon {
        font-size: 32px;
        margin-bottom: 6px;
      }
      .success-head p {
        margin: 6px 0;
        line-height: 1.4;
      }
      .success-head p:first-of-type { font-size: 20px; font-weight: 700; }
      .success-head p:nth-of-type(2),
      .success-head p:nth-of-type(3) { font-size: 18px; font-weight: 600; }
      .success-creds {
        background: #f6f8fb;
        border: 1px solid #e9edf5;
        border-radius: 20px;
        padding: 18px;
        margin-bottom: 18px;
      }
      .success-creds-title {
        margin: 0 0 12px 0;
        font-size: 15px;
        font-weight: 700;
        color: #0f1f3c;
        text-align: center;
      }
      .success-field label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        color: #6a7385;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .success-field .value {
        background: #fff;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 15px;
        color: #0f1f3c;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
      }
      .success-outro {
        text-align: center;
        margin: 0 8px 18px 8px;
        color: #5c6475;
        font-size: 13px;
        line-height: 1.6;
      }
      .success-outro p { margin: 4px 0; }
      .success-cta {
        width: calc(100% + 64px);
        margin: 0 -32px -2px -32px;
        height: 60px;
        border: 1px solid #000000;
        border-radius: 0 0 30px 30px;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.01em;
        background: #000;
        color: #ffffff;
        box-shadow: none;
      }
      @media (max-width: 640px) {
        .success-card { padding: 24px 22px 0 22px; max-width: 100%; }
        .success-cta { width: calc(100% + 44px); margin: 0 -22px -2px -22px; }
      }
    </style>
    <div class="success-preview-shell">
      <div class="success-card">
        <div class="success-head">
          <div class="icon">✅</div>
          ${introHooks.map(hook => `<p>${hook}</p>`).join('')}
        </div>

        <div class="success-creds">
          <p class="success-creds-title">${credentialsLabel}</p>
          <div class="success-field">
            <label>Email:</label>
            <div class="value">test@example.com</div>
          </div>
          <div class="success-field" style="margin-top: 12px;">
            <label>Пароль:</label>
            <div class="value">DemoPass123</div>
          </div>
        </div>

        <div class="success-outro">
          ${outroHooks.map(hook => `<p>${hook}</p>`).join('')}
        </div>

        <button class="success-cta">${buttonText}</button>
      </div>
    </div>
  `;
}

// Цветовая индикация полей (без текста)
function showFieldSuccess(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.style.borderColor = '#4CAF50';
    field.style.backgroundColor = '#e8f5e9';
  }
}

function showFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.style.borderColor = '#d32f2f';
    field.style.backgroundColor = '#ffebee';
  }
}

function resetFieldStyle(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.style.borderColor = '';
    field.style.backgroundColor = '';
  }
}

// Event listeners для таба Платежи
function initPaymentsTab() {
  // Кнопки сохранения
  document.getElementById('saveProduct')?.addEventListener('click', saveProduct);
  document.getElementById('saveEmail')?.addEventListener('click', saveEmailTemplate);
  document.getElementById('saveModal')?.addEventListener('click', saveSuccessModal);

  // Live preview для email
  document.getElementById('emailSubject')?.addEventListener('input', updateEmailPreview);
  document.getElementById('emailBody')?.addEventListener('input', updateEmailPreview);

  // Live preview для модалки
  document.getElementById('credentialsLabel')?.addEventListener('input', updateModalPreview);
  document.getElementById('buttonText')?.addEventListener('input', updateModalPreview);

  // Кнопки добавления хуков
  document.getElementById('addIntroHook')?.addEventListener('click', addIntroHook);
  document.getElementById('addOutroHook')?.addEventListener('click', addOutroHook);
}

// Инициализация при переключении на таб
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab[data-section="payments"]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (!paymentsState.product) {
        loadPaymentsData();
      }
    });
  });

  initPaymentsTab();
});
