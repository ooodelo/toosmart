/**
 * BUILD SCRIPT - Автоматическая генерация Free и Premium версий
 *
 * ZERO-CONFIG подход: просто кладите MD файлы в content/course/ и запускайте build
 *
 * Использование:
 *   npm run build              - собрать обе версии
 *   npm run build:free         - только free версия
 *   npm run build:premium      - только premium версия
 *
 * Требования к MD файлам (см. docs/MARKDOWN_REQUIREMENTS.md):
 *   - Имя: 01.md, 02-basics.md, 03_chemistry.md (цифра в начале = порядок)
 *   - H1 заголовок (#) - название раздела в меню
 *   - H2 заголовки (##) - подразделы в меню
 *   - H3+ заголовки (###) - только для верстки, не попадают в меню
 *
 * Результат:
 *   dist/free/          → бесплатная версия (paywall)
 *   dist/premium/       → платная версия (PHP защита)
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
}

// ========================================
// АВТОМАТИЧЕСКОЕ СКАНИРОВАНИЕ MD ФАЙЛОВ
// ========================================

/**
 * Сканирует папку content/course/ и автоматически строит структуру курса
 * @returns {Array} массив объектов с информацией о разделах курса
 */
function scanCourseFiles() {
  if (!fs.existsSync(PATHS.content.course)) {
    console.error(`❌ Папка ${PATHS.content.course} не найдена!`);
    return [];
  }

  const files = fs.readdirSync(PATHS.content.course)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const fullPath = path.join(PATHS.content.course, file);
      const markdown = fs.readFileSync(fullPath, 'utf8');

      // Извлечь номер из имени файла (первые цифры)
      const orderMatch = file.match(/^(\d+)/);
      const order = orderMatch ? parseInt(orderMatch[1], 10) : 999;

      // Извлечь ID из имени файла (всё после номера, без расширения)
      // Примеры: 01.md → "01", 02-basics.md → "basics", 03_chemistry.md → "chemistry"
      const idMatch = file.match(/^\d+[-_.]?(.+)\.md$/);
      const id = idMatch && idMatch[1] ? idMatch[1].replace(/[-_]/g, '-') : file.replace('.md', '');

      // Извлечь H1 заголовок (название раздела)
      const h1Match = markdown.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1].trim() : `Раздел ${order}`;

      // Извлечь H2 заголовки (подразделы)
      const h2Headers = extractH2Headers(markdown);

      return {
        order,
        id,
        title,
        filename: file,
        markdown,
        subsections: h2Headers
      };
    })
    .sort((a, b) => a.order - b.order); // Сортировка по номеру

  // Добавить navigation links (next)
  files.forEach((section, index) => {
    section.next = index < files.length - 1 ? files[index + 1].id : null;
  });

  console.log(`   📚 Найдено ${files.length} разделов курса:`);
  files.forEach(f => console.log(`      ${f.order}. ${f.title} (${f.filename} → ${f.id}.html)`));

  return files;
}

/**
 * Извлекает H1 заголовок из markdown
 * @param {string} markdown
 * @returns {string}
 */
function extractH1Title(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

// ========================================
// ГЛАВНАЯ ФУНКЦИЯ
// ========================================

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1];

  console.log('🚀 Начинаем автоматическую сборку...\n');

  // Сканировать MD файлы
  const courseStructure = scanCourseFiles();

  if (courseStructure.length === 0) {
    console.error('❌ Не найдено ни одного MD файла в content/course/');
    console.error('   Добавьте файлы вида: 01.md, 02-basics.md, 03_chemistry.md');
    process.exit(1);
  }

  if (!target || target === 'free' || args.includes('--all')) {
    await buildFreeVersion(courseStructure);
  }

  if (!target || target === 'premium' || args.includes('--all')) {
    await buildPremiumVersion(courseStructure);
  }

  console.log('\n✅ Сборка завершена!');
  console.log(`   Free: dist/free/`);
  console.log(`   Premium: dist/premium/`);
}

// ========================================
// FREE ВЕРСИЯ
// ========================================

async function buildFreeVersion(courseStructure) {
  console.log('\n📦 Сборка FREE версии...');
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

  if (fs.existsSync(PATHS.content.images)) {
    copyDir(PATHS.content.images, path.join(output, 'images'));
  }

  // 3. Генерировать разделы курса (с paywall)
  console.log('   Генерация разделов с paywall...');
  for (const section of courseStructure) {
    const intro = extractFirstParagraph(section.markdown);
    const fullHTML = parseMarkdown(section.markdown);

    const html = generateFreePage({
      template: PATHS.src.template,
      title: section.title,
      intro,
      fullContent: fullHTML,
      sectionId: section.id,
      courseStructure
    });

    fs.writeFileSync(path.join(output, `${section.id}.html`), html);
  }

  console.log('   ✅ Free версия собрана → dist/free/');
}

// ========================================
// PREMIUM ВЕРСИЯ
// ========================================

async function buildPremiumVersion(courseStructure) {
  console.log('\n📦 Сборка PREMIUM версии...');
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

  // 4. Генерировать разделы курса (полные)
  console.log('   Генерация разделов (полный контент)...');

  // Создать home.html как первый раздел
  if (courseStructure.length > 0) {
    const firstSection = courseStructure[0];
    const content = parseMarkdown(firstSection.markdown);

    const html = generatePremiumPage({
      template: PATHS.src.template,
      title: firstSection.title,
      content,
      subsections: firstSection.subsections,
      nextPage: firstSection.next,
      courseStructure
    });

    fs.writeFileSync(path.join(output, 'home.html'), html);
  }

  // Генерировать остальные разделы
  for (const section of courseStructure) {
    const content = parseMarkdown(section.markdown);

    const html = generatePremiumPage({
      template: PATHS.src.template,
      title: section.title,
      content,
      subsections: section.subsections,
      nextPage: section.next,
      courseStructure
    });

    fs.writeFileSync(path.join(output, `${section.id}.html`), html);
  }

  console.log('   ✅ Premium версия собрана → dist/premium/');
}

// ========================================
// ГЕНЕРАЦИЯ МЕНЮ
// ========================================

/**
 * Генерирует HTML меню курса из автоматически построенной структуры
 * @param {Array} courseStructure - массив объектов разделов
 * @returns {string} - HTML код меню
 */
function generateMenuHTML(courseStructure) {
  if (!courseStructure || courseStructure.length === 0) {
    return '<ul class="site-menu__list"></ul>';
  }

  let menuItems = '';

  courseStructure.forEach((section, index) => {
    // Генерировать подменю из H2 заголовков
    let subsectionsList = '';
    if (section.subsections && section.subsections.length > 0) {
      subsectionsList = '<ul>\n';
      section.subsections.forEach(sub => {
        subsectionsList += `      <li><a href="#${sub.id}">${sub.title}</a></li>\n`;
      });
      subsectionsList += '    </ul>';
    }

    // Генерировать элемент меню
    menuItems += `  <li>
    <a href="#${section.id}">${index + 1}. ${section.title}</a>
    ${subsectionsList}
  </li>\n`;
  });

  return `<ul class="site-menu__list">
${menuItems}</ul>`;
}

// ========================================
// ГЕНЕРАЦИЯ СТРАНИЦ
// ========================================

function generateFreePage({ template, title, intro, fullContent, sectionId, courseStructure }) {
  let html = fs.readFileSync(template, 'utf8');

  // Заменить title
  html = html.replace(/<title>.*?<\/title>/, `<title>${title} - Clean</title>`);

  // Генерировать и вставить меню
  const menuHTML = generateMenuHTML(courseStructure);
  html = html.replace(
    /<ul class="site-menu__list">[\s\S]*?<\/ul>/,
    menuHTML
  );

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

function generatePremiumPage({ template, title, content, subsections, nextPage, courseStructure }) {
  let html = fs.readFileSync(template, 'utf8');

  // Заменить title
  html = html.replace(/<title>.*?<\/title>/, `<title>${title} - Clean</title>`);

  // Генерировать и вставить меню
  const menuHTML = generateMenuHTML(courseStructure);
  html = html.replace(
    /<ul class="site-menu__list">[\s\S]*?<\/ul>/,
    menuHTML
  );

  // Создать контент с разделами
  const sectionsHTML = generateSectionsHTML(content, subsections);

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

function generateSectionsHTML(content, subsections) {
  if (!subsections || subsections.length === 0) {
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

      const subsection = subsections[sectionIndex];
      result += `
        <section id="${subsection.id}" class="text-section" data-section="${subsection.title}">
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
      <li>✅ Все разделы с подробными объяснениями</li>
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
      .replace(/[^\wа-яё\s-]/gi, '')
      .replace(/\s+/g, '-');
    headers.push({ id, title });
  }

  return headers;
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
