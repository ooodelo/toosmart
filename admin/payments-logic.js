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
    .replace(/\{\{reply_to\}\}/g, 'support@toosmart.ru');

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
    <div style="padding: 28px 20px 24px; text-align: center;">
      ${introHooks.map(hook => `<p style="font-size: 16px; font-weight: 500; margin: 6px 0; color: #1a1a1a;">${hook}</p>`).join('')}
    </div>
    <div style="padding: 0 20px 24px;">
      <div style="background: #f8f9fa; padding: 16px; border-radius: 14px; margin-bottom: 16px;">
        <p style="font-size: 13px; font-weight: 600; margin-bottom: 12px; text-align: center;">${credentialsLabel}</p>
        <div style="margin: 10px 0;">
          <span style="display: block; font-size: 10px; color: #666; margin-bottom: 3px; text-transform: uppercase; font-weight: 600;">Email:</span>
          <code style="display: block; font-size: 13px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0;">test@example.com</code>
        </div>
        <div style="margin: 10px 0;">
          <span style="display: block; font-size: 10px; color: #666; margin-bottom: 3px; text-transform: uppercase; font-weight: 600;">Пароль:</span>
          <code style="display: block; font-size: 13px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0;">DemoPass123</code>
        </div>
      </div>
      <div style="text-align: center; margin-bottom: 20px;">
        ${outroHooks.map(hook => `<p style="font-size: 12px; color: #666; margin: 4px 0;">${hook}</p>`).join('')}
      </div>
      <button style="width: 100%; padding: 14px; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600;">${buttonText}</button>
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
