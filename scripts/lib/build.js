const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const DEFAULT_BRANCHES = [
  { name: 'intro', label: 'Введение', visibility: { free: 'public', premium: 'public' } },
  { name: 'course', label: 'Курс', visibility: { free: 'preview', premium: 'public' } },
  { name: 'appendix', label: 'Приложения', visibility: { free: 'hidden', premium: 'public' } },
  { name: 'recommendations', label: 'Рекомендации', visibility: { free: 'public', premium: 'public' } },
  { name: 'legal', label: 'Юр. раздел', visibility: { free: 'public', premium: 'public' } }
];

const PATHS = {
  templates: {
    free: path.resolve(__dirname, '../../src/template.html'),
    premium: path.resolve(__dirname, '../../src/template.html')
  },
  assets: {
    script: path.resolve(__dirname, '../../src/script.js'),
    styles: path.resolve(__dirname, '../../src/styles.css'),
    modeUtils: path.resolve(__dirname, '../../src/mode-utils.js'),
    assetsDir: path.resolve(__dirname, '../../src/assets')
  },
  content: path.resolve(__dirname, '../../content'),
  images: path.resolve(__dirname, '../../content/images'),
  articles: path.resolve(__dirname, '../../content/articles'),
  server: {
    root: path.resolve(__dirname, '../../server'),
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
    free: path.resolve(__dirname, '../../dist/free'),
    premium: path.resolve(__dirname, '../../dist/premium')
  }
};

const DEFAULT_CONFIG = {
  pricing: {
    currency: 'RUB',
    amount: 990,
    originalAmount: null,
    cta: 'Получить полный доступ'
  },
  payment: {
    merchant: 'ООО «Пример»',
    inn: '0000000000',
    bank: 'ПАО Банк',
    account: '40702810000000000000',
    agreement: 'Договор оферты'
  }
};

const sanitize = (() => {
  try {
    const { window } = new JSDOM('');
    return createDOMPurify(window);
  } catch (error) {
    console.warn('⚠️  DOMPurify недоступен, HTML не будет санитизирован');
    return null;
  }
})();

async function build({ target } = {}) {
  const branches = DEFAULT_BRANCHES;
  const config = await loadBuildConfig();
  const sections = await loadContentBranches(branches);

  if (sections.length === 0) {
    throw new Error('Не найдено ни одного markdown файла в ветках контента');
  }

  const tasks = [];

  if (!target || target === 'free') {
    tasks.push(buildVersion({ mode: 'free', sections, config }));
  }
  if (!target || target === 'premium') {
    tasks.push(buildVersion({ mode: 'premium', sections, config }));
  }

  await Promise.all(tasks);
}

async function buildVersion({ mode, sections, config }) {
  const distRoot = PATHS.dist[mode];
  await cleanDir(distRoot);
  await ensureDir(distRoot);

  await Promise.all([
    copyIfExists(PATHS.assets.assetsDir, path.join(distRoot, 'assets')),
    copyIfExists(PATHS.images, path.join(distRoot, 'images')),
    copyIfExists(PATHS.articles, path.join(distRoot, 'articles')),
    copyFile(PATHS.assets.script, path.join(distRoot, 'script.js')),
    copyFile(PATHS.assets.styles, path.join(distRoot, 'styles.css')),
    copyFile(PATHS.assets.modeUtils, path.join(distRoot, 'mode-utils.js'))
  ]);

  if (mode === 'premium') {
    await copyServerFiles(distRoot);
  }

  const filtered = applyVisibility(sections, mode);
  const menu = buildMenu(filtered);
  const templatePath = PATHS.templates[mode];
  const template = await fsp.readFile(templatePath, 'utf8');

  await writePages({
    mode,
    distRoot,
    menu,
    template,
    config,
    sections: filtered
  });
}

async function loadBuildConfig() {
  const local = path.resolve(__dirname, '../../config/build.local.json');
  const shared = path.resolve(__dirname, '../../config/build.json');

  const source = await findExisting([local, shared]);
  if (!source) return DEFAULT_CONFIG;

  try {
    const raw = await fsp.readFile(source, 'utf8');
    const data = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, data);
  } catch (error) {
    console.warn(`⚠️  Не удалось прочитать конфиг ${source}:`, error.message);
    return DEFAULT_CONFIG;
  }
}

async function loadContentBranches(branches) {
  const results = [];

  for (const branch of branches) {
    const branchDir = path.join(PATHS.content, branch.name);
    if (!fs.existsSync(branchDir)) {
      continue;
    }

    const manifestPath = path.join(branchDir, 'index.json');
    const manifest = await readJSON(manifestPath);
    let sections = manifest
      ? await sectionsFromManifest(branch, manifest, branchDir)
      : await scanMarkdownDir(branch, branchDir);

    sections = sections
      .map(section => ({
        ...section,
        branch: branch.name,
        branchLabel: branch.label,
        visibility: section.visibility || branch.visibility,
        order: Number.isFinite(section.order) ? section.order : 999
      }))
      .sort((a, b) => a.order - b.order);

    results.push(...sections);
  }

  return results;
}

async function sectionsFromManifest(branch, manifest, branchDir) {
  if (!Array.isArray(manifest)) return [];

  const items = [];
  for (const item of manifest) {
    if (!item.source) continue;

    // Security: Validate path to prevent traversal attacks
    try {
      const markdownPath = validatePath(branchDir, item.source);
      if (!fs.existsSync(markdownPath)) continue;

      const markdown = await fsp.readFile(markdownPath, 'utf8');
      const id = item.id || slugify(path.basename(item.source, path.extname(item.source)));
      const html = renderMarkdown(markdown, id);
      items.push({
        id,
        title: item.title || extractH1(markdown) || 'Раздел',
        order: item.order ?? 999,
        markdown,
        html,
        subsections: extractH2(markdown, id),
        teaser: item.teaser || null,
        visibility: item.visibility || branch.visibility
      });
    } catch (error) {
      console.warn(`⚠️  Skipping ${item.source}: ${error.message}`);
      continue;
    }
  }
  return items;
}

async function scanMarkdownDir(branch, dir) {
  const entries = await fsp.readdir(dir);
  const files = entries.filter(file => file.endsWith('.md'));

  const sections = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const markdown = await fsp.readFile(fullPath, 'utf8');
    const id = slugify(file.replace(/^(\d+[-_.]?)/, '').replace(/\.md$/, '')) || file.replace('.md', '');
    const html = renderMarkdown(markdown, id);
    const orderMatch = file.match(/^(\d+)/);
    sections.push({
      id,
      title: extractH1(markdown) || `Раздел ${id}`,
      order: orderMatch ? parseInt(orderMatch[1], 10) : 999,
      markdown,
      html,
      subsections: extractH2(markdown, id),
      teaser: null,
      visibility: branch.visibility
    });
  }
  return sections;
}

function applyVisibility(sections, mode) {
  const filtered = [];
  for (const section of sections) {
    const visibility = resolveVisibility(section.visibility, mode);
    if (visibility === 'hidden') continue;

    const isPreview = visibility === 'preview';
    filtered.push({ ...section, isPreview });
  }
  return filtered;
}

function resolveVisibility(visibility, mode) {
  if (!visibility) return 'public';
  if (typeof visibility === 'string') return visibility;
  return visibility[mode] || 'public';
}

function buildMenu(sections) {
  const grouped = sections.reduce((acc, section) => {
    acc[section.branch] = acc[section.branch] || { label: section.branchLabel, items: [] };
    acc[section.branch].items.push(section);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped);
  if (groupKeys.length === 0) return '<ul class="site-menu__list"></ul>';

  const blocks = groupKeys
    .map(branch => {
      const group = grouped[branch];
      const items = group.items
        .map((section, index) => `
          <li>
            <a href="#${section.id}">${index + 1}. ${section.title}</a>
            ${renderSubsections(section.subsections)}
          </li>`)
        .join('\n');
      return `<li class="menu-branch"><div class="menu-branch__title">${group.label}</div><ul>${items}</ul></li>`;
    })
    .join('\n');

  return `<ul class="site-menu__list">${blocks}</ul>`;
}

function renderSubsections(subsections = []) {
  if (!subsections.length) return '';
  const items = subsections
    .map(sub => `<li class="menu-subsection"><a href="#${sub.anchor}">${sub.title}</a></li>`)
    .join('\n');
  return `<ul class="menu-subsections">${items}</ul>`;
}

async function writePages({ mode, distRoot, menu, template, sections, config }) {
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    const nextPage = sections[index + 1]?.id;
    const pageHtml = renderPage({
      template,
      section,
      menu,
      mode,
      nextPage,
      config
    });

    const targetPath = path.join(distRoot, `${section.id}.html`);
    await fsp.writeFile(targetPath, pageHtml, 'utf8');
  }

  if (sections[0]) {
    await fsp.copyFile(path.join(distRoot, `${sections[0].id}.html`), path.join(distRoot, 'index.html'));
  }
}

function renderPage({ template, section, menu, mode, nextPage, config }) {
  let html = template;
  html = html.replace(/<title>.*?<\/title>/, `<title>${section.title} - Clean</title>`);
  html = html.replace(/<ul class="site-menu__list">[\s\S]*?<\/ul>/, menu);

  const content = section.isPreview ? renderPreview(section, config) : renderFull(section);
  html = html.replace(/<div id="article-content">[\s\S]*?<\/div>/, `<div id="article-content">\n${content}\n</div>`);

  if (nextPage) {
    html = html.replace('data-next-page=""', `data-next-page="${nextPage}.html"`);
  } else {
    html = html.replace(/<button class="btn-next"[^>]*>.*?<\/button>/s, '');
  }

  return html;
}

function renderFull(section) {
  return `<section id="${section.id}" class="text-section" data-section="${section.title}">\n${section.html}\n</section>`;
}

function renderPreview(section, config) {
  const teaser = section.teaser || extractTeaser(section.markdown);
  const priceLabel = formatPriceLabel(config.pricing);
  return `
  <section id="${section.id}" class="text-section" data-section="${section.title}">
    <h1>${section.title}</h1>
    <div class="preview-teaser">${teaser}</div>
    <div class="premium-teaser">
      <div class="blurred-content">${section.html}</div>
      <div class="unlock-overlay">
        <button class="btn-unlock" onclick="openPaymentModal()">${config.pricing.cta}${priceLabel ? ` (${priceLabel})` : ''}</button>
      </div>
    </div>
  </section>
  ${generatePaymentModal(config)}
  `;
}

function generatePaymentModal(config) {
  const priceCurrent = formatPrice(config.pricing.amount, config.pricing.currency);
  const priceOriginal = config.pricing.originalAmount
    ? formatPrice(config.pricing.originalAmount, config.pricing.currency)
    : null;
  return `
<div class="modal" id="payment-modal" hidden>
  <div class="modal-overlay" onclick="closePaymentModal()"></div>
  <div class="modal-content">
    <button class="modal-close" onclick="closePaymentModal()">×</button>
    <h2>Получите полный доступ к курсу</h2>
    <p class="price">
      ${priceOriginal ? `<span class="price-original">${priceOriginal}</span>` : ''}
      <span class="price-current">${priceCurrent}</span>
    </p>
    <ul class="benefits">
      <li>✅ Все разделы без ограничений</li>
      <li>✅ Практические материалы и приложения</li>
      <li>✅ Обновления курса</li>
    </ul>
    <div class="payment-details">
      <div>Получатель: ${config.payment.merchant}</div>
      <div>ИНН: ${config.payment.inn}</div>
      <div>Банк: ${config.payment.bank}</div>
      <div>Счёт: ${config.payment.account}</div>
      <div>${config.payment.agreement}</div>
    </div>
    <button type="button" class="btn-pay" onclick="closePaymentModal()">Оплатить</button>
    <p class="security-note">🔒 Данные защищены</p>
  </div>
</div>
<script>
function openPaymentModal() {
  var modal = document.getElementById('payment-modal');
  if (modal) { modal.removeAttribute('hidden'); document.body.style.overflow = 'hidden'; }
}
function closePaymentModal() {
  var modal = document.getElementById('payment-modal');
  if (modal) { modal.setAttribute('hidden', ''); document.body.style.overflow = ''; }
}
</script>
`;
}

function extractTeaser(markdown) {
  const paragraphs = markdown.split(/\n\n+/).filter(Boolean);
  return renderMarkdown(paragraphs[0] || '');
}

function renderMarkdown(markdown, slugPrefix) {
  const slugger = createSlugger();
  const renderer = new marked.Renderer();
  renderer.heading = (text, level, raw) => {
    const slugBase = slugger(raw);
    const slug = slugPrefix ? `${slugPrefix}-${slugBase}` : slugBase;
    return `<h${level} id="${slug}">${text}</h${level}>`;
  };

  const html = marked(markdown, { renderer, mangle: false, headerIds: true });
  return sanitize ? sanitize.sanitize(html) : html;
}

function extractH1(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function extractH2(markdown, slugPrefix) {
  const matches = markdown.matchAll(/^##\s+(.+)$/gm);
  return Array.from(matches, m => {
    const title = m[1].trim();
    const slug = slugify(title);
    return { title, anchor: slugPrefix ? `${slugPrefix}-${slug}` : slug };
  });
}

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\-\s_]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Security: Path traversal protection
function validatePath(basePath, userPath) {
  const base = path.resolve(basePath);
  const full = path.resolve(basePath, userPath);

  if (!full.startsWith(base + path.sep) && full !== base) {
    throw new Error(`Path traversal detected: ${userPath}`);
  }

  return full;
}

function createSlugger() {
  const seen = new Map();
  return raw => {
    const base = slugify(raw || '');
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = await fsp.readdir(dir);
  await Promise.all(entries.map(entry => fsp.rm(path.join(dir, entry), { recursive: true, force: true })));
}

async function copyFile(src, dest) {
  if (!fs.existsSync(src)) return;
  await ensureDir(path.dirname(dest));
  await fsp.copyFile(src, dest);
}

async function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  await copyDir(src, dest);
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async entry => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fsp.copyFile(srcPath, destPath);
      }
    })
  );
}

async function copyServerFiles(distRoot) {
  const tasks = PATHS.server.files.map(file =>
    copyFile(path.join(PATHS.server.root, file), path.join(distRoot, file))
  );
  await Promise.all(tasks);
}

async function findExisting(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`⚠️  Ошибка чтения ${filePath}: ${error.message}`);
    return null;
  }
}

function deepMerge(base, next) {
  if (!next || typeof next !== 'object') return base;
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(next)) {
    const baseValue = result[key];
    const nextValue = next[key];
    if (isPlainObject(baseValue) && isPlainObject(nextValue)) {
      result[key] = deepMerge(baseValue, nextValue);
    } else {
      result[key] = nextValue;
    }
  }
  return result;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function formatPriceLabel(pricing) {
  if (!pricing || !pricing.amount) return '';
  const current = formatPrice(pricing.amount, pricing.currency);
  const original = pricing.originalAmount ? formatPrice(pricing.originalAmount, pricing.currency) : null;
  return original ? `${current} · было ${original}` : current;
}

function formatPrice(amount, currency) {
  if (amount === undefined || amount === null) return '';
  return `${amount} ${currency || ''}`.trim();
}

module.exports = { build };
