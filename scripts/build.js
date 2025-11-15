/**
 * BUILD SCRIPT - Генерация Free и Premium версий сайта
 *
 * Использование:
 *   npm run build              - собрать обе версии
 *   npm run build:free         - только free версия
 *   npm run build:premium      - только premium версия
 *
 * Структура:
 *   content/course/     → разделы курса
 *   content/articles/   → статьи "Рекомендации"
 *   src/                → шаблоны UI
 *   server/             → PHP скрипты
 *
 * Результат:
 *   dist/free/          → бесплатная версия
 *   dist/premium/       → платная версия (с PHP защитой)
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// ========================================
// КОНФИГУРАЦИЯ
// ========================================

const PATHS = {
  src: {
    template: './src/template.html',
    script: './src/script.js',
    styles: './src/styles.css',
    modeUtils: './src/mode-utils.js',
    assets: './src/assets'
  },
  content: {
    course: './content/course',
    articles: './content/articles',
    config: './content/config.json',
    images: './content/images'
  },
  server: {
    root: './server',
    files: [
      'index.php',
      'auth.php',
      'check-auth.php',
      'logout.php',
      'robokassa-callback.php',
      'success.php',
      '.htaccess',
      'users.json.example'
    ]
  },
  dist: {
    free: './dist/free',
    premium: './dist/premium'
  }
};

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figure', 'figcaption',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'mark', 'ol', 'p', 'pre',
    's', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
    'th', 'thead', 'tr', 'u', 'ul'
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel', 'alt', 'src', 'loading', 'width', 'height', 'id',
    'class', 'name', 'role', 'aria-label', 'aria-hidden', 'aria-describedby', 'aria-live',
    'lang', 'dir', 'data-section', 'data-next-page', 'data-lazy'
  ]
};

// Инициализация DOMPurify
let DOMPurify = null;
try {
  const { window } = new JSDOM('');
  DOMPurify = createDOMPurify(window);
} catch (error) {
  console.warn('⚠️  DOMPurify недоступен');
  console.warn(error);
}

// ========================================
// ГЛАВНАЯ ФУНКЦИЯ
// ========================================

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1];

  console.log('🚀 Начинаем сборку...\n');

  if (!target || target === 'free' || args.includes('--all')) {
    await buildFreeVersion();
  }

  if (!target || target === 'premium' || args.includes('--all')) {
    await buildPremiumVersion();
  }

  console.log('\n✅ Сборка завершена!');
}

// ========================================
// FREE ВЕРСИЯ
// ========================================

async function buildFreeVersion() {
  console.log('📦 Сборка FREE версии...');
  const output = PATHS.dist.free;

  // 1. Очистить и создать папки
  cleanDir(output);
  ensureDir(output);
  ensureDir(path.join(output, 'articles'));
  ensureDir(path.join(output, 'assets'));
  ensureDir(path.join(output, 'images'));

  // 2. Копировать ресурсы
  copyFile(PATHS.src.script, path.join(output, 'script.js'));
  copyFile(PATHS.src.styles, path.join(output, 'styles.css'));
  copyFile(PATHS.src.modeUtils, path.join(output, 'mode-utils.js'));
  copyDir(PATHS.src.assets, path.join(output, 'assets'));

  // Копировать images если существует
  if (fs.existsSync(PATHS.content.images)) {
    copyDir(PATHS.content.images, path.join(output, 'images'));
  }

  // 3. Загрузить конфигурацию
  const config = loadConfig();

  // 4. Генерировать разделы курса (с paywall)
  console.log('   Генерация разделов курса (с paywall)...');
  for (const section of config.course.sections) {
    const mdPath = path.join(PATHS.content.course, section.markdown);
    if (!fs.existsSync(mdPath)) {
      console.warn(`   ⚠️  Файл не найден: ${section.markdown}`);
      continue;
    }

    const markdown = fs.readFileSync(mdPath, 'utf8');
    const intro = extractFirstParagraph(markdown);
    const fullHTML = parseMarkdown(markdown);
    const sections = extractH2Headers(markdown);

    const html = generateFreePage({
      template: PATHS.src.template,
      title: section.title,
      intro,
      fullContent: fullHTML,
      sections,
      sectionId: section.id
    });

    fs.writeFileSync(path.join(output, `${section.id}.html`), html);
  }

  // 5. Генерировать статьи "Рекомендации" (полные)
  if (config.articles && config.articles.list.length > 0) {
    console.log('   Генерация статей "Рекомендации"...');
    for (const article of config.articles.list) {
      const mdPath = path.join(PATHS.content.articles, article.markdown);
      if (!fs.existsSync(mdPath)) {
        console.warn(`   ⚠️  Файл не найден: ${article.markdown}`);
        continue;
      }

      const markdown = fs.readFileSync(mdPath, 'utf8');
      const content = parseMarkdown(markdown);

      const html = generateArticlePage({
        template: PATHS.src.template,
        title: article.title,
        content
      });

      fs.writeFileSync(path.join(output, 'articles', `${article.id}.html`), html);
    }
  }

  console.log('   ✅ Free версия собрана → dist/free/');
}

// ========================================
// PREMIUM ВЕРСИЯ
// ========================================

async function buildPremiumVersion() {
  console.log('📦 Сборка PREMIUM версии...');
  const output = PATHS.dist.premium;

  // 1. Очистить и создать папки
  cleanDir(output);
  ensureDir(output);
  ensureDir(path.join(output, 'assets'));
  ensureDir(path.join(output, 'images'));

  // 2. Копировать ресурсы
  copyFile(PATHS.src.script, path.join(output, 'script.js'));
  copyFile(PATHS.src.styles, path.join(output, 'styles.css'));
  copyFile(PATHS.src.modeUtils, path.join(output, 'mode-utils.js'));
  copyDir(PATHS.src.assets, path.join(output, 'assets'));

  // Копировать images если существует
  if (fs.existsSync(PATHS.content.images)) {
    copyDir(PATHS.content.images, path.join(output, 'images'));
  }

  // 3. Копировать PHP файлы
  console.log('   Копирование PHP файлов...');
  for (const file of PATHS.server.files) {
    const src = path.join(PATHS.server.root, file);
    const dest = path.join(output, file);
    if (fs.existsSync(src)) {
      copyFile(src, dest);
    }
  }

  // 4. Загрузить конфигурацию
  const config = loadConfig();

  // 5. Генерировать разделы курса (полные)
  console.log('   Генерация разделов курса (полный контент)...');

  // Создать home.html как первый раздел
  if (config.course.sections.length > 0) {
    const firstSection = config.course.sections[0];
    const mdPath = path.join(PATHS.content.course, firstSection.markdown);
    if (fs.existsSync(mdPath)) {
      const markdown = fs.readFileSync(mdPath, 'utf8');
      const content = parseMarkdown(markdown);
      const sections = extractH2Headers(markdown);

      const html = generatePremiumPage({
        template: PATHS.src.template,
        title: firstSection.title,
        content,
        sections,
        nextPage: firstSection.next
      });

      fs.writeFileSync(path.join(output, 'home.html'), html);
    }
  }

  // Генерировать остальные разделы
  for (const section of config.course.sections) {
    const mdPath = path.join(PATHS.content.course, section.markdown);
    if (!fs.existsSync(mdPath)) {
      console.warn(`   ⚠️  Файл не найден: ${section.markdown}`);
      continue;
    }

    const markdown = fs.readFileSync(mdPath, 'utf8');
    const content = parseMarkdown(markdown);
    const sections = extractH2Headers(markdown);

    const html = generatePremiumPage({
      template: PATHS.src.template,
      title: section.title,
      content,
      sections,
      nextPage: section.next
    });

    fs.writeFileSync(path.join(output, `${section.id}.html`), html);
  }

  console.log('   ✅ Premium версия собрана → dist/premium/');
}

// ========================================
// ГЕНЕРАЦИЯ СТРАНИЦ
// ========================================

function generateFreePage({ template, title, intro, fullContent, sections, sectionId }) {
  let html = fs.readFileSync(template, 'utf8');

  // Заменить title
  html = html.replace(/<title>.*?<\/title>/, `<title>${title} - Clean</title>`);

  // Создать контент с paywall
  const paywallContent = `
    <section id="${sectionId}" class="text-section" data-section="${title}">
      <h1>${title}</h1>
      ${intro}

      <div class="premium-teaser">
        <div class="blurred-content">
          ${fullContent}
        </div>
        <div class="unlock-overlay">
          <button class="btn-unlock" onclick="openPaymentModal()">
            🔒 Получить полную версию
          </button>
        </div>
      </div>
    </section>
  `;

  // Вставить контент
  html = html.replace(
    /<div id="article-content">[\s\S]*?<\/div>/,
    `<div id="article-content">\n${paywallContent}\n</div>`
  );

  // Добавить модальное окно оплаты
  html = html.replace(
    '</body>',
    `${generatePaymentModal()}\n</body>`
  );

  return html;
}

function generatePremiumPage({ template, title, content, sections, nextPage }) {
  let html = fs.readFileSync(template, 'utf8');

  // Заменить title
  html = html.replace(/<title>.*?<\/title>/, `<title>${title} - Clean</title>`);

  // Создать контент с разделами
  const sectionsHTML = generateSectionsHTML(content, sections);

  // Вставить контент
  html = html.replace(
    /<div id="article-content">[\s\S]*?<\/div>/,
    `<div id="article-content">\n${sectionsHTML}\n</div>`
  );

  // Обновить кнопку "Далее"
  if (nextPage) {
    html = html.replace(
      'data-next-page=""',
      `data-next-page="${nextPage}.html"`
    );
  } else {
    // Если это последний раздел, убрать кнопку "Далее"
    html = html.replace(
      /<button class="btn-next"[^>]*>.*?<\/button>/s,
      ''
    );
  }

  return html;
}

function generateArticlePage({ template, title, content }) {
  let html = fs.readFileSync(template, 'utf8');

  // Заменить title
  html = html.replace(/<title>.*?<\/title>/, `<title>${title} - Clean</title>`);

  // Вставить контент + CTA
  const articleContent = `
    <article class="text-box">
      <h1>${title}</h1>
      ${content}

      <div class="article-cta">
        <h3>Хотите узнать больше?</h3>
        <p>Изучите полный курс «Clean - Теория правильной уборки» с 10 разделами по химии уборки</p>
        <a href="/free/index.html" class="btn-course">
          Перейти к полному курсу →
        </a>
      </div>
    </article>
  `;

  html = html.replace(
    /<div id="article-content">[\s\S]*?<\/div>/,
    `<div id="article-content">\n${articleContent}\n</div>`
  );

  return html;
}

function generateSectionsHTML(content, sections) {
  if (sections.length === 0) {
    return `<div class="text-section">${content}</div>`;
  }

  // Разбить по H2 заголовкам
  const parts = content.split(/(<h2[^>]*>.*?<\/h2>)/);
  let result = '';
  let sectionIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith('<h2')) {
      // Начало новой секции
      if (sectionIndex > 0) {
        result += '</section>'; // закрыть предыдущую
      }

      const section = sections[sectionIndex];
      result += `
        <section id="${section.id}" class="text-section" data-section="${section.title}">
          ${part}
      `;
      sectionIndex++;
    } else if (part.trim()) {
      result += part;
    }
  }

  // Закрыть последнюю секцию
  if (sectionIndex > 0) {
    result += '</section>';
  }

  return result;
}

function generatePaymentModal() {
  return `
<div class="modal" id="payment-modal" hidden>
  <div class="modal-overlay" onclick="closePaymentModal()"></div>
  <div class="modal-content">
    <button class="modal-close" onclick="closePaymentModal()">×</button>

    <h2>Получите полный доступ к курсу</h2>

    <ul class="benefits">
      <li>✅ 10 полных разделов с подробными объяснениями</li>
      <li>✅ Практические рецепты и таблицы совместимости</li>
      <li>✅ Пожизненный доступ к материалам</li>
      <li>✅ Обновления курса бесплатно</li>
    </ul>

    <p class="price">
      <span class="price-old">1990 ₽</span>
      <span class="price-current">990 ₽</span>
    </p>

    <form action="https://auth.robokassa.ru/Merchant/Index.aspx" method="GET">
      <input type="email" name="Shp_email" placeholder="Ваш email" required>
      <input type="hidden" name="MerchantLogin" value="YOUR_LOGIN">
      <input type="hidden" name="OutSum" value="990">
      <input type="hidden" name="Description" value="Доступ к курсу Clean">
      <button type="submit" class="btn-pay">Оплатить 990 ₽</button>
    </form>

    <p class="security-note">🔒 Безопасная оплата через Robokassa</p>
  </div>
</div>

<script>
function openPaymentModal() {
  document.getElementById('payment-modal').removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function closePaymentModal() {
  document.getElementById('payment-modal').setAttribute('hidden', '');
  document.body.style.overflow = '';
}
</script>

<style>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 16px;
  padding: 40px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  z-index: 1;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 32px;
  cursor: pointer;
  color: #666;
  line-height: 1;
}

.benefits {
  list-style: none;
  padding: 0;
  margin: 24px 0;
}

.benefits li {
  padding: 8px 0;
  font-size: 16px;
}

.price {
  text-align: center;
  margin: 24px 0;
}

.price-old {
  text-decoration: line-through;
  color: #999;
  font-size: 20px;
  margin-right: 12px;
}

.price-current {
  font-size: 32px;
  font-weight: 700;
  color: #667eea;
}

.modal-content form {
  margin-top: 16px;
}

.modal-content input[type="email"] {
  width: 100%;
  padding: 14px;
  margin-bottom: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  box-sizing: border-box;
}

.btn-pay {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
}

.security-note {
  text-align: center;
  color: #666;
  font-size: 14px;
  margin-top: 16px;
}

.premium-teaser {
  position: relative;
  margin-top: 24px;
}

.blurred-content {
  filter: blur(8px);
  pointer-events: none;
  user-select: none;
  max-height: 400px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}

.unlock-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
}

.btn-unlock {
  padding: 16px 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-unlock:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5);
}

.article-cta {
  background: linear-gradient(135deg, #e8f4f8 0%, #d4e9f2 100%);
  border: 2px solid #667eea;
  border-radius: 12px;
  padding: 32px;
  margin-top: 48px;
  text-align: center;
}

.btn-course {
  display: inline-block;
  padding: 14px 32px;
  background: #667eea;
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  margin-top: 16px;
  transition: transform 0.2s;
}

.btn-course:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}
</style>
`;
}

// ========================================
// УТИЛИТЫ ПАРСИНГА
// ========================================

function parseMarkdown(markdown) {
  const renderer = new marked.Renderer();

  // Переопределяем рендеринг изображений
  renderer.image = (href, title, text) => {
    let imagePath = href;

    if (href.startsWith('./')) {
      imagePath = href.replace('./', '/images/');
    } else if (!href.startsWith('/') && !href.startsWith('http')) {
      imagePath = `/images/${href}`;
    }

    return `
      <figure class="article-image">
        <img
          src="${imagePath}"
          alt="${text}"
          ${title ? `title="${title}"` : ''}
          loading="lazy"
        >
        ${title ? `<figcaption>${title}</figcaption>` : ''}
      </figure>
    `.trim();
  };

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: true,
    headerIds: true,
    mangle: false
  });

  const html = marked.parse(markdown);
  return sanitizeContent(html);
}

function sanitizeContent(html) {
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
    try {
      return DOMPurify.sanitize(html, SANITIZE_CONFIG);
    } catch (error) {
      console.warn('⚠️  DOMPurify ошибка, используется fallback');
    }
  }

  // Простой fallback
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function extractFirstParagraph(markdown) {
  // Взять всё до первого H2 или H3
  const match = markdown.match(/^([\s\S]*?)(?=\n##\s|\n###\s|$)/);
  const intro = match ? match[1].trim() : markdown;

  // Парсить только введение
  return parseMarkdown(intro);
}

function extractH2Headers(markdown) {
  const regex = /^##\s+(.+)$/gm;
  const headers = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const title = match[1].trim();
    const id = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
    headers.push({ id, title });
  }

  return headers;
}

// ========================================
// КОНФИГУРАЦИЯ
// ========================================

function loadConfig() {
  if (!fs.existsSync(PATHS.content.config)) {
    console.error('❌ Файл config.json не найден!');
    process.exit(1);
  }

  const configData = fs.readFileSync(PATHS.content.config, 'utf8');
  return JSON.parse(configData);
}

// ========================================
// ФАЙЛОВЫЕ УТИЛИТЫ
// ========================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ========================================
// ЗАПУСК
// ========================================

main().catch(err => {
  console.error('❌ Ошибка сборки:', err);
  process.exit(1);
});
