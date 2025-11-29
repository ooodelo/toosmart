const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { minify: minifyJS } = require('terser');
const csso = require('csso');
const { buildPaywallSegments } = require('./paywall');

let cachedHeadScriptsPartial = null;

const PATHS = {
  content: path.resolve(__dirname, '../../content'),
  partials: {
    headScripts: path.resolve(__dirname, '../../src/partials/head-scripts.html')
  },
  dist: {
    root: path.resolve(__dirname, '../../dist'),
    premium: path.resolve(__dirname, '../../dist/premium'),
    premiumAssets: path.resolve(__dirname, '../../dist/premium/assets'),
    recommendations: path.resolve(__dirname, '../../dist/recommendations'),
    shared: path.resolve(__dirname, '../../dist/shared'),
    sharedLegal: path.resolve(__dirname, '../../dist/shared/legal'),
    modeUtils: path.resolve(__dirname, '../../src/js/mode-utils.js'),
    assets: path.resolve(__dirname, '../../dist/assets'),
    contentAssets: path.resolve(__dirname, '../../dist/assets/content'),
    // Новая логичная структура - free контент в корне
    course: path.resolve(__dirname, '../../dist/course'),
    legal: path.resolve(__dirname, '../../dist/legal')
  },
  config: {
    site: path.resolve(__dirname, '../../config/site.json'),
    seo: path.resolve(__dirname, '../../config/seo-data.json'),
    favicon: path.resolve(__dirname, '../../config/favicon.json'),
    paywall: path.resolve(__dirname, '../../config/paywall.json')
  },
  srcAssets: path.resolve(__dirname, '../../src/assets'),
  server: {
    root: path.resolve(__dirname, '../../server'),
    files: [
      'index.php',
      'auth.php',
      'check-auth.php',
      'logout.php',
      'success.php',
      'fail.php',
      '.htaccess',
      'users.json.example',
      'health.php'
    ],
    // Новая модульная структура
    directories: [
      'api',
      'src',
      'robokassa',
      'sql',
      'storage',
      'assets'
    ],
    // Старые файлы для обратной совместимости (deprecated)
    legacyFiles: [
      'robokassa-callback.php',
      'create-invoice.php',
      'Database.php',
      'config.php',
      'security.php'
    ]
  },
  viteManifest: path.resolve(__dirname, '../../dist/assets/.vite/manifest.json')
};

// Кэш SEO данных
let cachedSeoData = null;

// Кэш favicon конфига
let cachedFaviconConfig = null;
let cachedPaywallConfig = null;
const REQUIRED_FAVICON_FILES = [
  'favicon.svg',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png'
];
const DEFAULT_MANIFEST = {
  name: 'Site',
  short_name: 'Site',
  start_url: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/assets/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
  ]
};

/**
 * Получает favicon конфиг с дефолтами
 */
function loadFaviconConfig() {
  if (cachedFaviconConfig !== null) {
    return cachedFaviconConfig;
  }

  try {
    if (fs.existsSync(PATHS.config.favicon)) {
      const parsed = JSON.parse(fs.readFileSync(PATHS.config.favicon, 'utf8'));
      cachedFaviconConfig = {
        filename: parsed.filename || parsed.primary || 'favicon.svg',
        files: parsed.files || {},
        originalNames: parsed.originalNames || {},
        manifest: Object.assign({}, DEFAULT_MANIFEST, parsed.manifest || {})
      };
      return cachedFaviconConfig;
    }
  } catch (e) {
    console.warn('⚠️  Ошибка чтения favicon.json, используется дефолт:', e.message);
  }

  cachedFaviconConfig = {
    filename: 'favicon.svg',
    files: {},
    originalNames: {},
    manifest: { ...DEFAULT_MANIFEST }
  };
  return cachedFaviconConfig;
}

/**
 * Получает текущий файл favicon из конфига
 */
function getFaviconFilename() {
  const config = loadFaviconConfig();
  return config.filename || 'favicon.svg';
}

function getFaviconManifest() {
  const config = loadFaviconConfig();
  return Object.assign({}, DEFAULT_MANIFEST, config.manifest || {});
}

function loadPaywallConfig() {
  if (cachedPaywallConfig !== null) {
    return cachedPaywallConfig;
  }

  try {
    if (fs.existsSync(PATHS.config.paywall)) {
      cachedPaywallConfig = JSON.parse(fs.readFileSync(PATHS.config.paywall, 'utf8')) || {};
    } else {
      cachedPaywallConfig = {};
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения paywall.json, используется автосплит:', error.message);
    cachedPaywallConfig = {};
  }

  return cachedPaywallConfig;
}

function getPaywallEntry(config, branch, slug) {
  if (!config) return null;
  const key = `${branch}/${slug}`;
  const entry = config[key] || (config.entries && config.entries[key]);
  if (!entry || typeof entry !== 'object') return null;

  const result = {};
  if (Number.isFinite(entry.openBlocks)) result.openBlocks = Number(entry.openBlocks);
  if (Number.isFinite(entry.teaserBlocks)) result.teaserBlocks = Number(entry.teaserBlocks);
  return Object.keys(result).length ? result : null;
}

/**
 * Загружает Vite manifest для получения путей к собранным ассетам
 */
function loadViteManifest() {
  const manifestPath = PATHS.viteManifest;
  if (!fs.existsSync(manifestPath)) {
    console.warn('⚠️  Vite manifest не найден. Запустите npm run build:assets');
    return null;
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('❌ Ошибка чтения Vite manifest:', error.message);
    return null;
  }
}

const DEFAULT_SITE_CONFIG = {
  domain: 'example.com',
  pricing: {
    originalAmount: 1490,
    currentAmount: 990,
    currency: 'RUB'
  },
  recommendationCards: [],
  ctaTexts: {
    enterFull: 'Войти в полную версию',
    next: 'Далее',
    goToCourse: 'Перейти к курсу',
    openCourse: 'Открыть курс'
  },
  footer: {
    companyName: 'ООО "Название компании"',
    inn: '0000000000',
    year: new Date().getFullYear()
  },
  legal: {
    "terms": "01-legal-terms.md",
    "privacy": "02-privacy-policy.md",
    "offer": "03-public-offer.md"
  },
  robokassa: {
    merchantLogin: '',
    password1: '',
    password2: '',
    isTest: true,
    invoicePrefix: 'CLEAN',
    successUrl: '/success.php',
    failUrl: '/fail.php',
    resultUrl: '/robokassa-callback.php'
  },
  build: {
    wordsPerMinute: 150 // Вдумчивое чтение учебного материала
  },
  features: {
    cookiesBannerEnabled: true
  }
};

const sanitize = (() => {
  const { window } = new JSDOM('');
  return createDOMPurify(window);
})();

async function build({ target } = {}) {
  if (!target) {
    await buildAll();
    return;
  }

  switch (target) {
    case 'free':
      await buildFree();
      break;
    case 'premium':
      await buildPremium();
      break;
    case 'recommendations':
      await buildRecommendations();
      break;
    case 'all':
      await buildAll();
      break;
    default:
      throw new Error(`Неизвестный target: ${target}`);
  }
}

async function buildAll() {
  await buildFree();
  await buildPremium();
  await buildRecommendations();
}

async function buildFree() {
  console.log('\n🔨 Сборка FREE версии...\n');

  let config, content, template, introTemplate;
  const contentAssets = new Map();

  try {
    config = await loadSiteConfig();
  } catch (error) {
    throw new Error(`Ошибка загрузки конфигурации: ${error.message}`);
  }

  try {
    content = await loadContent(config.build.wordsPerMinute, contentAssets);
  } catch (error) {
    throw new Error(`Ошибка загрузки контента: ${error.message}`);
  }
  const legalMap = buildLegalSlugMap(content, config);

  // Загружаем Vite manifest
  const manifest = loadViteManifest();

  try {
    // Читаем шаблон из dist (уже обработанный Vite)
    template = await readTemplate('free', manifest);
    introTemplate = await readTemplate('intro', manifest);
  } catch (error) {
    throw new Error(`Ошибка загрузки шаблона: ${error.message}`);
  }

  try {
    await ensureDir(PATHS.dist.root);
    // Очищаем только course и shared/legal директории, не весь dist
    await cleanDir(PATHS.dist.course);
    await cleanDir(PATHS.dist.sharedLegal);
    await ensureDir(PATHS.dist.course);
    await ensureDir(PATHS.dist.sharedLegal);
  } catch (error) {
    throw new Error(`Ошибка подготовки директорий: ${error.message}`);
  }

  try {
    await copyContentAssets(contentAssets);
  } catch (error) {
    console.warn(`⚠️ Ошибка копирования ассетов контента: ${error.message}`);
  }

  const menuItems = buildMenuItems(content, 'free');
  const menuHtml = generateMenuItemsHtml(menuItems);

  for (const intro of content.intro) {
    // Определяем URL первой страницы курса для навигации с intro
    const firstCourse = content.course[0];
    const nextUrl = firstCourse ? `/course/${firstCourse.slug}.html` : '';
    const page = buildIntroPage(intro, menuHtml, config, introTemplate, 'free', nextUrl, legalMap);
    const targetPath = path.join(PATHS.dist.root, 'index.html');
    await fsp.writeFile(targetPath, page, 'utf8');
    break;
  }

  for (const course of content.course) {
    const page = buildFreeCoursePage(course, menuHtml, config, template, legalMap);
    const targetPath = path.join(PATHS.dist.course, `${course.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  for (const legal of content.legal) {
    // Генерируем полную страницу (для прямых ссылок)
    const page = buildLegalPage(legal, menuHtml, config, template, 'free', legalMap);
    const targetPath = path.join(PATHS.dist.sharedLegal, `${legal.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');

    // Генерируем только контент для модалки (без шаблона)
    const contentOnly = buildLegalContentFragment(legal);
    const fragmentPath = path.join(PATHS.dist.sharedLegal, `${legal.slug}-content.html`);
    await fsp.writeFile(fragmentPath, contentOnly, 'utf8');
  }

  // Генерация SEO файлов
  await generateRobotsTxt(PATHS.dist.root, config);
  await generateSitemap(content, PATHS.dist.root, config);
}

async function buildPremium() {
  const config = await loadSiteConfig();
  const contentAssets = new Map();
  const content = await loadContent(config.build.wordsPerMinute, contentAssets);
  const legalMap = buildLegalSlugMap(content, config);

  const manifest = loadViteManifest();
  const template = await readTemplate('premium', manifest);

  await cleanDir(PATHS.dist.premium);
  await ensureDir(PATHS.dist.premium);
  await copyContentAssets(contentAssets);
  await copyServerFiles(PATHS.dist.premium);

  const menuItems = buildMenuItems(content, 'premium');
  const menuHtml = generateMenuItemsHtml(menuItems);

  // Цепочка навигации: intro → course → appendix
  const navigationChain = [...content.intro, ...content.course, ...content.appendix];

  // Генерируем страницы с навигацией
  for (let index = 0; index < navigationChain.length; index++) {
    const item = navigationChain[index];
    const prevItem = navigationChain[index - 1];
    const nextItem = navigationChain[index + 1];

    const prevUrl = prevItem ? getPremiumUrlForItem(prevItem) : null;
    const nextUrl = nextItem ? getPremiumUrlForItem(nextItem) : null;

    const page = buildPremiumContentPage(item, menuHtml, config, template, { prevUrl, nextUrl }, legalMap);
    const targetPath = getPremiumPathForItem(item, PATHS.dist.premium);

    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }
}

function getPremiumUrlForItem(item) {
  if (item.branch === 'intro') {
    return '/premium/';
  } else if (item.branch === 'appendix') {
    return `/premium/appendix/${item.slug}.html`;
  } else {
    return `/premium/course/${item.slug}.html`;
  }
}

function getPremiumPathForItem(item, root) {
  if (item.branch === 'intro') {
    return path.join(root, 'index.html');
  } else if (item.branch === 'appendix') {
    return path.join(root, 'appendix', `${item.slug}.html`);
  } else {
    return path.join(root, 'course', `${item.slug}.html`);
  }
}

function buildPremiumContentPage(item, menuHtml, config, template, { prevUrl, nextUrl }, legalMap = {}) {
  return buildPremiumPage(item, menuHtml, config, template, { prevUrl, nextUrl }, legalMap);
}

async function buildRecommendations() {
  const config = await loadSiteConfig();
  const contentAssets = new Map();
  const content = await loadContent(config.build.wordsPerMinute, contentAssets);
  const legalMap = buildLegalSlugMap(content, config);
  const recommendationCards = Array.isArray(config.recommendationCards) ? config.recommendationCards : [];

  const manifest = loadViteManifest();
  const template = await readTemplate('recommendations', manifest);

  const menuItems = buildMenuItems(content, 'free');
  const menuHtml = generateMenuItemsHtml(menuItems);

  await copyContentAssets(contentAssets);

  await ensureDir(PATHS.dist.shared);
  await cleanDir(PATHS.dist.recommendations);
  await ensureDir(PATHS.dist.recommendations);

  const recommendations = content.recommendations.map(rec => {
    const override = recommendationCards.find(card => card.slug === rec.slug);
    const title = (override?.title || rec.title || '').trim();
    const description = (override?.description || rec.excerpt || '').trim();
    const cover = normalizeCoverValue(override?.cover) || normalizeCoverValue(rec.frontMatter?.image);

    return {
      slug: rec.slug,
      title: title || rec.slug,
      excerpt: description || rec.excerpt || '',
      cover: cover || undefined,
      readingTimeMinutes: rec.readingTimeMinutes,
      url: `/recommendations/${rec.slug}.html`
    };
  });

  await fsp.writeFile(
    path.join(PATHS.dist.shared, 'recommendations.json'),
    JSON.stringify(recommendations, null, 2),
    'utf8'
  );

  for (const rec of content.recommendations) {
    const page = buildRecommendationPage(rec, menuHtml, config, template, 'free', legalMap);
    const targetPath = path.join(PATHS.dist.recommendations, `${rec.slug}.html`);
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  // optional shared config passthrough for GUI
  await fsp.writeFile(
    path.join(PATHS.dist.shared, 'site.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );
}

async function loadSiteConfig() {
  if (!fs.existsSync(PATHS.config.site)) {
    return DEFAULT_SITE_CONFIG;
  }
  try {
    const raw = await fsp.readFile(PATHS.config.site, 'utf8');
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_SITE_CONFIG, parsed);
  } catch (error) {
    console.warn('⚠️  Ошибка чтения site.json, используется конфиг по умолчанию:', error.message);
    return DEFAULT_SITE_CONFIG;
  }
}

async function readTemplate(mode, manifest) {
  // Имя файла в dist/assets, который уже собран Vite (HTML с подставленными ассетами)
  let entryName, directName;

  switch (mode) {
    case 'premium':
      entryName = 'template';
      directName = 'template.html';
      break;
    case 'free':
      entryName = 'templatePaywall';
      directName = 'template-paywall.html';
      break;
    case 'intro':
      entryName = 'templateIndex';
      directName = 'template-index.html';
      break;
    case 'recommendations':
      entryName = 'templateRecommendations';
      directName = 'template-recommendations.html';
      break;
    default:
      throw new Error(`Unknown template mode: ${mode}`);
  }

  const directPath = path.join(PATHS.dist.assets, directName);

  // 1) Приоритет - готовый HTML в dist/assets
  if (fs.existsSync(directPath)) {
    try {
      const raw = await fsp.readFile(directPath, 'utf8');
      return sanitizeTemplateForBuild(raw);
    } catch (error) {
      throw new Error(`Failed to read template file at ${directPath}: ${error.message}`);
    }
  }

  // 2) Fallback: пытаемся найти HTML в манифесте (если вдруг Vite захэшировал имя)
  let templateFile = null;
  if (manifest) {
    const manifestEntry =
      manifest[directName] ||
      manifest[`src/${directName}`] ||
      manifest[`${entryName}.html`] ||
      manifest[`src/${entryName}.html`];

    if (manifestEntry?.file && path.extname(manifestEntry.file) === '.html') {
      templateFile = manifestEntry.file;
    } else if (manifestEntry?.file) {
      console.warn(`⚠️ Manifest entry for ${directName} points to ${manifestEntry.file}. Expected an HTML file.`);
    }
  }

  if (!templateFile) {
    const manifestKeys = manifest ? Object.keys(manifest) : [];
    throw new Error(`Template not found for mode: ${mode}. Run "npm run build:assets" to generate dist/assets HTML. Manifest keys: ${manifestKeys.join(', ') || 'none'}`);
  }

  const templatePath = path.join(PATHS.dist.assets, templateFile);

  try {
    const raw = await fsp.readFile(templatePath, 'utf8');
    return sanitizeTemplateForBuild(raw);
  } catch (error) {
    throw new Error(`Failed to read template file at ${templatePath}: ${error.message}`);
  }
}

function sanitizeTemplateForBuild(templateHtml) {
  const dom = new JSDOM(templateHtml);
  const { document } = dom.window;

  ensureInlineModeUtils(document);
  rewriteAssetUrls(document);

  // Позволяем помечать тестовые блоки атрибутом data-demo-only (не влияет на dev-сценарий)
  document.querySelectorAll('[data-demo-only]').forEach(node => node.remove());

  // Ensure all modals and cookie banners are hidden
  // This allows source partials to be visible for editing
  document.querySelectorAll('.modal, .cookie-banner').forEach(el => {
    if (!el.hasAttribute('hidden')) {
      el.setAttribute('hidden', '');
    }
  });

  // Подготовка слота для контента
  const bodySlot = document.querySelector('[data-build-slot="body"]');
  if (bodySlot) {
    // Вместо замены слота, мы будем заменять его содержимое
    // Но для простоты replace, заменим его на уникальный маркер
    // Или лучше: очистим его и пометим как {{body}}
    // Но {{body}} - это строка.
    // Давайте заменим ВЕСЬ элемент на маркер {{body}}, но тогда потеряем классы.
    // Нет, мы хотим вставить ВНУТРЬ.

    // Вариант 1: Заменить innerHTML на {{body}}
    bodySlot.innerHTML = '{{body}}';
  } else {
    // Fallback для старых шаблонов
    const articleContent = document.querySelector('#article-content');
    if (articleContent) {
      articleContent.innerHTML = '{{body}}';
    }
  }

  // Подготовка слота для меню
  const menuSlot = document.querySelector('[data-build-slot="menu"]');
  if (menuSlot) {
    menuSlot.innerHTML = '{{menu}}';
  }

  return dom.serialize();
}

function rewriteAssetUrls(document) {
  const prefix = '/assets/';
  const shouldRewrite = (url) => {
    if (!url) return false;
    if (url.startsWith(prefix)) return false;
    if (/^(https?:)?\/\//i.test(url)) return false;
    if (/^(mailto:|data:|tel:)/i.test(url)) return false;
    return url.startsWith('/');
  };

  const applyPrefix = (url) => shouldRewrite(url) ? prefix + url.replace(/^\/+/, '') : url;

  document.querySelectorAll('script[src]').forEach((el) => {
    const next = applyPrefix(el.getAttribute('src'));
    el.setAttribute('src', next);
  });

  document.querySelectorAll('link[rel="modulepreload"][href], link[rel="stylesheet"][href]').forEach((el) => {
    const next = applyPrefix(el.getAttribute('href'));
    el.setAttribute('href', next);
  });

  document.querySelectorAll('img[src], source[src], source[srcset]').forEach((el) => {
    if (el.hasAttribute('src')) {
      el.setAttribute('src', applyPrefix(el.getAttribute('src')));
    }
    if (el.hasAttribute('srcset')) {
      const srcset = el.getAttribute('srcset')
        .split(',')
        .map(part => part.trim())
        .map(part => {
          const [url, descriptor] = part.split(/\s+/, 2);
          const rewritten = applyPrefix(url);
          return descriptor ? `${rewritten} ${descriptor}` : rewritten;
        })
        .join(', ');
      el.setAttribute('srcset', srcset);
    }
  });
}

function ensureInlineModeUtils(document) {
  const head = document.querySelector('head');
  if (!head) {
    return;
  }

  const hasModeUtilsInline = typeof head.textContent === 'string' && head.textContent.includes('ModeUtils');
  if (hasModeUtilsInline) {
    return;
  }

  if (!cachedHeadScriptsPartial) {
    try {
      cachedHeadScriptsPartial = fs.readFileSync(PATHS.partials.headScripts, 'utf8');
    } catch (error) {
      console.warn(`⚠️  Не удалось прочитать head-scripts partial: ${error.message}`);
      return;
    }
  }

  try {
    const fragment = JSDOM.fragment(cachedHeadScriptsPartial);
    head.insertBefore(fragment, head.firstChild);
  } catch (error) {
    console.warn(`⚠️  Не удалось встроить head-scripts partial: ${error.message}`);
  }

  for (const node of Array.from(head.childNodes)) {
    if (node.nodeType === 3 && /\{\{\s*>?\s*head-scripts\s*\}\}/.test(node.textContent)) {
      node.remove();
    }
  }
}

function currencySymbol(code) {
  const upper = (code || '').toUpperCase();
  switch (upper) {
    case 'RUB':
    case 'RUR':
      return '₽';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    default:
      return upper || '';
  }
}

function formatPrice(amount, currencyCode = 'RUB') {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '';

  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0
    }).format(num);
  } catch (error) {
    const symbol = currencySymbol(currencyCode);
    return `${num.toLocaleString('ru-RU')} ${symbol}`.trim();
  }
}

function replacePlaceholder(html, token, value) {
  if (!html || !token) return html;
  const replacement = value == null ? '' : String(value);
  return html.split(token).join(replacement);
}

function injectTextBoxAttributes(html, { buttonText, nextPage }) {
  const marker = 'class="text-box"';
  if (!html.includes(marker)) return html;

  const hasButton = /data-button-text=/.test(html);
  const hasNext = /data-next-page=/.test(html);
  const attrs = [];

  if (buttonText && !hasButton) {
    attrs.push(`data-button-text="${escapeAttr(buttonText)}"`);
  }
  if (nextPage && !hasNext) {
    attrs.push(`data-next-page="${escapeAttr(nextPage)}"`);
  }

  if (attrs.length === 0) {
    return html;
  }

  return html.replace(marker, `${marker} ${attrs.join(' ')}`);
}

function applyTemplate(template, { title, body, menu, meta = '', schema = '', seoTitle = '', features = {}, config = {}, legalMap = {}, buttonText = '', nextPage = '' }) {
  // Используем SEO title если задан, иначе обычный title
  const finalTitle = seoTitle || title;

  let result = template
    .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(finalTitle)}</title>`)
    .replace('{{body}}', body)
    .replace('{{menu}}', menu || '');

  result = injectFaviconMeta(result);

  // Вставляем мета-теги перед закрывающим </head>
  if (meta) {
    result = result.replace('</head>', `${meta}\n  </head>`);
  }

  // Отключение баннера cookies по флагу
  if (features && features.cookiesBannerEnabled === false) {
    result = result.replace('</head>', `  <style>#cookie-banner{display:none !important;}</style>\n  <script>window.COOKIE_BANNER_DISABLED=true;</script>\n  </head>`);
  }

  // Вставляем Schema.org перед закрывающим </body>
  if (schema) {
    result = result.replace('</body>', `  ${schema}\n  </body>`);
  }

  // Текст кнопки/nextPage для прогресс-виджета
  result = injectTextBoxAttributes(result, { buttonText, nextPage });
  if (nextPage && !/data-next-page=/.test(result)) {
    result = result.replace('<body', `<body data-next-page="${escapeAttr(nextPage)}"`);
  }

  // Подстановка цен и футера из конфига
  const pricing = config.pricing || {};
  const footer = config.footer || {};

  const priceOriginal = formatPrice(pricing.originalAmount, pricing.currency);
  const priceCurrent = formatPrice(pricing.currentAmount, pricing.currency);
  const footerCompany = footer.companyName || DEFAULT_SITE_CONFIG.footer.companyName;
  const footerInn = footer.inn || DEFAULT_SITE_CONFIG.footer.inn;
  const footerYear = footer.year || new Date().getFullYear();

  result = replacePlaceholder(result, '__PRICE_ORIGINAL__', escapeAttr(priceOriginal));
  result = replacePlaceholder(result, '__PRICE_CURRENT__', escapeAttr(priceCurrent));
  result = replacePlaceholder(result, '__FOOTER_COMPANY__', escapeAttr(footerCompany));
  result = replacePlaceholder(result, '__FOOTER_INN__', escapeAttr(footerInn));
  result = replacePlaceholder(result, '__FOOTER_YEAR__', escapeAttr(footerYear));

  // Прокидываем карту slug'ов для legal модалок
  if (legalMap && Object.keys(legalMap).length > 0) {
    const legalMapJson = JSON.stringify(legalMap);
    result = result.replace('</head>', `  <script>window.LEGAL_SLUG_MAP = ${legalMapJson};</script>\n  </head>`);
  }

  // Vite assets уже там, так как мы берем шаблон из dist

  return result;
}

function collectFaviconFilesStatus() {
  const config = loadFaviconConfig();
  const files = {};

  for (const name of REQUIRED_FAVICON_FILES) {
    const exists = fs.existsSync(path.join(PATHS.srcAssets, name));
    files[name] = { exists, path: `/assets/${name}` };
  }

  return {
    primary: config.filename || 'favicon.svg',
    manifest: getFaviconManifest(),
    files
  };
}

function buildFaviconHtmlSnippetForTemplate(status) {
  const { primary, manifest, files } = status;
  const lines = [];
  const ext = path.extname(primary).toLowerCase();
  const type = ext === '.svg' ? 'image/svg+xml' : ext === '.ico' ? 'image/x-icon' : 'image/png';

  lines.push(`<link rel="icon" type="${type}" href="/assets/${primary}">`);

  if (files['favicon-32x32.png']?.exists) {
    lines.push('<link rel="alternate icon" href="/assets/favicon-32x32.png" sizes="32x32">');
  }
  if (files['favicon-16x16.png']?.exists) {
    lines.push('<link rel="alternate icon" href="/assets/favicon-16x16.png" sizes="16x16">');
  }
  if (files['apple-touch-icon.png']?.exists) {
    lines.push('<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">');
  }

  if (manifest) {
    lines.push('<link rel="manifest" href="/assets/site.webmanifest">');
    if (manifest.theme_color) {
      lines.push(`<meta name="theme-color" content="${manifest.theme_color}">`);
    }
  }

  return lines;
}

function injectFaviconMeta(html) {
  const status = collectFaviconFilesStatus();
  const snippetLines = [];

  const hasIcon = /rel=["']icon["']/i.test(html);
  const hasApple = /apple-touch-icon/i.test(html);
  const hasManifest = /rel=["']manifest["']/i.test(html);
  const hasTheme = /name=["']theme-color["']/i.test(html);
  const hasAlt32 = /favicon-32x32\.png/i.test(html);
  const hasAlt16 = /favicon-16x16\.png/i.test(html);

  for (const line of buildFaviconHtmlSnippetForTemplate(status)) {
    if (line.includes('rel="icon"') && hasIcon) continue;
    if (line.includes('alternate icon') && line.includes('32x32') && hasAlt32) continue;
    if (line.includes('alternate icon') && line.includes('16x16') && hasAlt16) continue;
    if (line.includes('apple-touch-icon') && hasApple) continue;
    if (line.includes('rel="manifest"') && hasManifest) continue;
    if (line.includes('theme-color') && hasTheme) continue;
    snippetLines.push(line);
  }

  if (snippetLines.length === 0) {
    return html;
  }

  return html.replace('</head>', `${snippetLines.join('\n')}\n  </head>`);
}

async function loadContent(wordsPerMinute, assetRegistry = new Map()) {
  const paywallConfig = loadPaywallConfig();
  const intro = await loadMarkdownBranch(path.join(PATHS.content, 'intro'), 'intro', wordsPerMinute, assetRegistry, paywallConfig);
  const course = await loadMarkdownBranch(path.join(PATHS.content, 'course'), 'course', wordsPerMinute, assetRegistry, paywallConfig);
  const appendix = await loadMarkdownBranch(path.join(PATHS.content, 'appendix'), 'appendix', wordsPerMinute, assetRegistry, paywallConfig);
  const recommendations = await loadMarkdownBranch(path.join(PATHS.content, 'recommendations'), 'recommendations', wordsPerMinute, assetRegistry, paywallConfig);
  const legal = await loadMarkdownBranch(path.join(PATHS.content, 'legal'), 'legal', wordsPerMinute, assetRegistry, paywallConfig);

  return { intro, course, appendix, recommendations, legal };
}

function buildLegalSlugMap(content, config) {
  const legalItems = Array.isArray(content?.legal) ? content.legal : [];
  const configLegal = config?.legal || {};
  const defaults = {
    terms: 'legal-terms',
    privacy: 'privacy-policy',
    offer: 'public-offer',
    contacts: 'contacts',
    refund: 'refund-policy',
    requisites: 'contacts',
    cookies: 'privacy-policy'
  };

  const findByFile = (filename) => legalItems.find(item => item.file === filename);
  const findBySlug = (slug) => legalItems.find(item => item.slug === slug);

  const map = {};
  const firstSlug = legalItems[0]?.slug;

  function assign(key, filename, fallbackSlug) {
    const matched = filename ? findByFile(filename) : null;
    const bySlug = fallbackSlug ? findBySlug(fallbackSlug) : null;
    const byDefaultSlug = defaults[key] ? findBySlug(defaults[key]) : null;
    map[key] = (matched || bySlug || byDefaultSlug || { slug: fallbackSlug || defaults[key] || firstSlug })?.slug || firstSlug;
  }

  assign('terms', configLegal.terms, defaults.terms);
  assign('privacy', configLegal.privacy, defaults.privacy);
  assign('offer', configLegal.offer, defaults.offer);
  assign('contacts', configLegal.contacts, defaults.contacts);
  assign('refund', configLegal.refund, defaults.refund);
  assign('requisites', configLegal.requisites, defaults.requisites);
  assign('cookies', configLegal.cookies, defaults.cookies || defaults.privacy);

  if (firstSlug) {
    map.default = firstSlug;
  }

  return map;
}

async function loadMarkdownBranch(dirPath, branch, wordsPerMinute = DEFAULT_SITE_CONFIG.build.wordsPerMinute, assetRegistry = new Map(), paywallConfig = {}) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = await fsp.readdir(dirPath);
  const files = entries.filter(name => name.endsWith('.md')).sort();

  const items = [];
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const rawMarkdown = await fsp.readFile(fullPath, 'utf8');
    const { data, body } = parseFrontMatter(rawMarkdown);
    const normalizedFrontMatter = normalizeFrontMatterMedia(data, dirPath, assetRegistry);
    const slug = data.slug || slugify(file.replace(/^(\d+[-_]?)/, '').replace(/\.md$/, ''));
    const title = normalizedFrontMatter.title || extractH1(body) || slug;
    const readingTimeMinutes = calculateReadingTime(body, wordsPerMinute);
    const { introMd, restMd } = extractLogicalIntro(body);

    // Preprocess markdown to convert absolute image paths before rendering
    const processedIntroMd = preprocessMarkdownMedia(introMd, dirPath, assetRegistry);
    const processedRestMd = preprocessMarkdownMedia(restMd, dirPath, assetRegistry);
    const processedBody = preprocessMarkdownMedia(body, dirPath, assetRegistry);

    const introHtml = rewriteContentMedia(renderMarkdown(processedIntroMd), dirPath, assetRegistry);
    const restHtml = rewriteContentMedia(renderMarkdown(processedRestMd), dirPath, assetRegistry);
    const fullHtml = rewriteContentMedia(renderMarkdown(processedBody), dirPath, assetRegistry);
    const teaserHtml = buildTeaser(restHtml);
    const excerpt = normalizedFrontMatter.excerpt || teaserHtml.replace(/<[^>]+>/g, '').trim();
    const paywall = buildPaywallSegments(processedBody, getPaywallEntry(paywallConfig, branch, slug));
    items.push({
      file,
      slug,
      title,
      order: parseOrder(file),
      markdown: body,
      introMd,
      restMd,
      introHtml,
      restHtml,
      fullHtml,
      teaserHtml,
      excerpt,
      readingTimeMinutes,
      frontMatter: normalizedFrontMatter,
      branch,
      paywallOpenHtml: paywall.openHtml,
      paywallTeaserHtml: paywall.teaserHtml
    });
  }

  return items.sort((a, b) => a.order - b.order);
}

function buildMenuItems(content, mode) {
  const menu = [];

  // Intro всегда первый (order должен быть 0)
  for (const intro of content.intro) {
    menu.push({
      type: 'intro',
      title: intro.title,
      url: mode === 'premium' ? '/premium/' : '/',
      order: 0, // Явно устанавливаем order=0 для intro
      readingTimeMinutes: intro.readingTimeMinutes
    });
  }

  // Разделы курса - новая логичная структура
  for (const course of content.course) {
    menu.push({
      type: 'course',
      title: course.title,
      url: mode === 'premium' ? `/premium/course/${course.slug}.html` : `/course/${course.slug}.html`,
      order: course.order,
      readingTimeMinutes: course.readingTimeMinutes
    });
  }

  // Приложения только в premium
  if (mode === 'premium') {
    for (const appendix of content.appendix) {
      menu.push({
        type: 'appendix',
        title: appendix.title,
        url: `/premium/appendix/${appendix.slug}.html`,
        order: appendix.order,
        readingTimeMinutes: appendix.readingTimeMinutes
      });
    }
  }

  // Добавляем кнопку выхода в меню для Premium версии
  if (mode === 'premium') {
    menu.push({
      type: 'logout',
      title: 'Выйти',
      url: '/server/logout.php',
      order: 9999,
      readingTimeMinutes: 0
    });
  }

  return menu.sort((a, b) => a.order - b.order);
}

function generateMenuItemsHtml(items) {
  return items
    .map(item => `<li>
      <a href="${item.url}">
        ${item.title}
      </a>
    </li>`)
    .join('\n');
}

function buildIntroPage(item, menuHtml, config, template, mode, nextUrl = '', legalMap = {}) {
  const buttonText = mode === 'premium' ? config.ctaTexts.next : config.ctaTexts.enterFull;
  const pageType = mode === 'premium' ? 'intro-premium' : 'intro-free';
  const seo = getSeoForItem(item);

  const body = wrapAsSection(item.fullHtml);

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    seoTitle: seo?.title || '',
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, mode, 'intro'),
    schema: generateSchemaOrg(item, config, 'intro'),
    // Доп параметры для атрибутов
    pageType,
    buttonText,
    nextPage: nextUrl,
    features: config.features,
    config,
    legalMap
  });
}

function buildFreeCoursePage(item, menuHtml, config, template, legalMap = {}) {
  const seo = getSeoForItem(item);
  const body = `
        <div class="text-box__intro">
          <header>
            <h1>${seo?.h1 || item.title}</h1>
            <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
          </header>
          ${item.paywallOpenHtml}
        </div>

        <div id="article-content">
          <div class="premium-teaser">
            <div class="premium-teaser__blurred" data-nosnippet><!--noindex-->${item.paywallTeaserHtml}<!--/noindex--></div>
            <div class="premium-teaser__overlay">
              <button class="cta-button" data-analytics="cta-premium">${config.ctaTexts.enterFull}</button>
            </div>
          </div>
        </div>
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    seoTitle: seo?.title || '',
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, 'free', 'course'),
    schema: generateSchemaOrg(item, config, 'course'),
    pageType: 'free',
    buttonText: config.ctaTexts.enterFull,
    nextPage: '',
    features: config.features,
    config,
    legalMap
  });
}

function buildPremiumPage(item, menuHtml, config, template, { prevUrl, nextUrl }, legalMap = {}) {
  const seo = getSeoForItem(item);
  const body = wrapAsSection(item.fullHtml);

  const pageType = item.branch === 'intro' ? 'intro' : (item.branch === 'appendix' ? 'appendix' : 'course');
  const progressButtonText = item.branch === 'appendix'
    ? (config.ctaTexts.goToCourse || config.ctaTexts.next)
    : config.ctaTexts.next;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    seoTitle: seo?.title || '',
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, 'premium', pageType),
    schema: generateSchemaOrg(item, config, pageType),
    pageType: 'premium',
    buttonText: progressButtonText,
    nextPage: nextUrl || '',
    features: config.features,
    config,
    legalMap
  });
}

function buildRecommendationPage(item, menuHtml, config, template, mode, legalMap = {}) {
  const seo = getSeoForItem(item);
  const introUrl = mode === 'premium' ? '/premium/' : '/';

  const body = wrapAsSection(item.fullHtml);

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    seoTitle: seo?.title || '',
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, mode, 'recommendation'),
    schema: generateSchemaOrg(item, config, 'recommendation'),
    pageType: 'recommendation',
    buttonText: config.ctaTexts.openCourse,
    nextPage: introUrl,
    features: config.features,
    config,
    legalMap
  });
}

function buildLegalPage(item, menuHtml, config, template, mode, legalMap = {}) {
  const seo = getSeoForItem(item);
  const body = wrapAsSection(item.fullHtml);

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    seoTitle: seo?.title || '',
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, mode, 'legal'),
    schema: '',
    pageType: 'legal',
    buttonText: '',
    nextPage: '',
    features: config.features,
    config,
    legalMap
  });
}

function buildLegalContentFragment(item) {
  // Возвращает только HTML контент без обертки шаблона
  // Это для загрузки в модальные окна через JavaScript
  return item.fullHtml;
}

// --- Helper Functions (unchanged mostly) ---

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: markdown };
  }
  const frontMatter = match[1];
  const body = match[2];
  const data = {};
  frontMatter.split('\n').forEach(line => {
    const [key, ...value] = line.split(':');
    if (key && value) {
      data[key.trim()] = stripQuotes(value.join(':').trim());
    }
  });
  return { data, body };
}

function normalizeFrontMatterMedia(data, dirPath, assetRegistry) {
  const normalized = { ...data };

  if (typeof normalized.image === 'string' && normalized.image.trim()) {
    const cleaned = stripQuotes(normalized.image.trim());
    const resolvedPath = resolveFrontMatterMediaPath(cleaned, dirPath);
    if (resolvedPath && assetRegistry) {
      const filename = sanitizeFilename(path.basename(resolvedPath));
      const webPath = `/assets/content/${filename}`;

      if (!assetRegistry.has(resolvedPath)) {
        assetRegistry.set(resolvedPath, {
          source: resolvedPath,
          destination: filename,
          url: webPath
        });
      }
      normalized.image = webPath;
    } else {
      normalized.image = cleaned;
    }
  }

  return normalized;
}

function resolveFrontMatterMediaPath(mediaPath, dirPath) {
  if (!mediaPath || /^https?:\/\//i.test(mediaPath) || mediaPath.startsWith('data:')) {
    return null;
  }

  // Absolute filesystem path
  if (isAbsoluteFilesystemPath(mediaPath)) {
    return fs.existsSync(mediaPath) ? mediaPath : null;
  }

  // Root-relative to /content
  if (mediaPath.startsWith('/')) {
    const candidate = path.join(PATHS.content, mediaPath.replace(/^\/+/, ''));
    return fs.existsSync(candidate) ? candidate : null;
  }

  // Relative to current markdown directory
  const candidate = path.resolve(dirPath || PATHS.content, mediaPath);
  return fs.existsSync(candidate) ? candidate : null;
}

function extractH1(markdown) {
  const match = markdown.match(/^#\s+(.*)$/m);
  return match ? match[1] : null;
}

function calculateReadingTime(text, wordsPerMinute) {
  const words = text.replace(/[#*`]/g, '').split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

function formatReadingTime(minutes) {
  return `~${minutes} минут`;
}

function wrapAsSection(html, { id = '', dataSection = '' } = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  const dataSectionAttr = dataSection ? ` data-section="${dataSection}"` : '';
  return `<section class="text-section"${idAttr}${dataSectionAttr}>${html}</section>`;
}

function extractLogicalIntro(markdown) {
  // Split by first H2 or specific marker
  const parts = markdown.split(/(?=^##\s)/m);
  if (parts.length > 1) {
    return { introMd: parts[0], restMd: parts.slice(1).join('') };
  }
  return { introMd: '', restMd: markdown };
}


function preprocessMarkdownMedia(markdown, dirPath, assetRegistry) {
  if (!markdown || !markdown.trim()) {
    return markdown;
  }

  // Match markdown image syntax: ![alt](path)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  // Collect all replacements to avoid mutating while iterating
  const replacements = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const fullMatch = match[0];
    const matchIndex = match.index;
    const altText = match[1];
    const imagePath = match[2];

    // Skip external URLs
    if (/^(https?:)?\/\//.test(imagePath)) continue;

    // Skip data URLs
    if (imagePath.startsWith('data:')) continue;

    // Skip already processed assets paths
    if (imagePath.startsWith('/assets/content/')) continue;

    let resolvedPath = null;

    // Case 1: Absolute filesystem path (e.g., /Users/..., /home/..., C:\\...)
    if (isAbsoluteFilesystemPath(imagePath)) {
      if (fs.existsSync(imagePath)) {
        resolvedPath = imagePath;
      } else {
        console.warn(`⚠️  Image not found in markdown: ${imagePath}`);
        continue;
      }
    }
    // Case 2: Project-relative path (e.g., /content/images/...)
    else if (imagePath.startsWith('/content/')) {
      const projectRoot = path.resolve(__dirname, '../..');
      resolvedPath = path.join(projectRoot, imagePath.substring(1));
      if (!fs.existsSync(resolvedPath)) {
        console.warn(`⚠️  Image not found in markdown: ${resolvedPath}`);
        continue;
      }
    }
    // Case 3: Relative path (e.g., ../images/..., ./images/..., images/...)
    else if (!imagePath.startsWith('/')) {
      resolvedPath = path.resolve(dirPath, imagePath);
    }

    // Smart Lookup: If not found, try to find in content/images/
    if (!resolvedPath) {
      // Check if it's a path starting with /images/ (explicit alias)
      if (imagePath.startsWith('/images/')) {
        const candidate = path.join(path.resolve(__dirname, '../..'), 'content', imagePath.substring(1));
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }

      // Fallback: Check by filename in content/images/
      if (!resolvedPath) {
        const filename = path.basename(imagePath);
        const candidate = path.join(path.resolve(__dirname, '../..'), 'content/images', filename);
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }
    }

    if (!resolvedPath) {
      // If still not found, warn
      if (isAbsoluteFilesystemPath(imagePath) || imagePath.startsWith('/content/') || !imagePath.startsWith('/')) {
        console.warn(`⚠️  Image not found in markdown: ${imagePath}`);
      }
      continue;
    }

    // If we resolved a path, prepare the replacement
    if (resolvedPath) {
      const filename = sanitizeFilename(path.basename(resolvedPath));
      const webPath = `/assets/content/${filename}`;

      // Register the asset for later copying
      if (!assetRegistry.has(resolvedPath)) {
        assetRegistry.set(resolvedPath, {
          source: resolvedPath,
          destination: filename,
          url: webPath
        });
      }

      // Store the replacement
      replacements.push({
        index: matchIndex,
        length: fullMatch.length,
        newText: `![${altText}](${webPath})`
      });
    }
  }

  // Apply replacements in reverse order to maintain correct indices
  let processed = markdown;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    processed = processed.substring(0, r.index) + r.newText + processed.substring(r.index + r.length);
  }

  return processed;
}

function renderMarkdown(markdown) {
  return marked(markdown);
}

function rewriteContentMedia(html, dirPath, assetRegistry) {
  if (!html || !html.trim()) {
    return html;
  }

  const dom = new JSDOM(html);
  const { document } = dom.window;
  const images = document.querySelectorAll('img');

  images.forEach(img => {
    const src = img.getAttribute('src');
    if (!src) return;

    // Skip external URLs (http://, https://, //)
    if (/^(https?:)?\/\//.test(src)) return;

    // Skip data URLs
    if (src.startsWith('data:')) return;

    // Skip already processed assets paths
    if (src.startsWith('/assets/content/')) return;

    let resolvedPath = null;

    // Case 1: Absolute filesystem path (e.g., /Users/..., /home/..., C:\...)
    if (isAbsoluteFilesystemPath(src)) {
      if (fs.existsSync(src)) {
        resolvedPath = src;
      } else {
        console.warn(`⚠️  Image not found: ${src}`);
        return;
      }
    }
    // Case 2: Project-relative path (e.g., /content/images/...)
    else if (src.startsWith('/content/')) {
      const projectRoot = path.resolve(__dirname, '../..');
      resolvedPath = path.join(projectRoot, src.substring(1)); // Remove leading /
      if (!fs.existsSync(resolvedPath)) {
        console.warn(`⚠️  Image not found: ${resolvedPath}`);
        return;
      }
    }
    // Case 3: Relative path (e.g., ../images/..., ./images/..., images/...)
    // Case 3: Relative path (e.g., ../images/..., ./images/..., images/...)
    else if (!src.startsWith('/')) {
      resolvedPath = path.resolve(dirPath, src);
    }

    // Smart Lookup: If not found, try to find in content/images/
    if (!resolvedPath) {
      // Check if it's a path starting with /images/ (explicit alias)
      if (src.startsWith('/images/')) {
        const candidate = path.join(path.resolve(__dirname, '../..'), 'content', src.substring(1));
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }

      // Fallback: Check by filename in content/images/
      if (!resolvedPath) {
        const filename = path.basename(src);
        const candidate = path.join(path.resolve(__dirname, '../..'), 'content/images', filename);
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }
    }

    if (!resolvedPath) {
      // If still not found, warn
      if (isAbsoluteFilesystemPath(src) || src.startsWith('/content/') || !src.startsWith('/')) {
        console.warn(`⚠️  Image not found: ${src}`);
      }
      return;
    }

    // If we resolved a path, register it and rewrite the URL
    if (resolvedPath) {
      const filename = sanitizeFilename(path.basename(resolvedPath));
      const webPath = `/assets/content/${filename}`;

      // Register the asset for later copying
      if (!assetRegistry.has(resolvedPath)) {
        assetRegistry.set(resolvedPath, {
          source: resolvedPath,
          destination: filename,
          url: webPath
        });
      }

      // Update the img src attribute
      img.setAttribute('src', webPath);
    }
  });

  return dom.window.document.body.innerHTML;
}

function isAbsoluteFilesystemPath(filepath) {
  // Unix-like absolute paths: /Users/..., /home/..., /root/...
  if (filepath.startsWith('/') && !filepath.startsWith('//')) {
    // Check if it looks like a filesystem path by checking for common root directories
    const unixRoots = ['/Users/', '/home/', '/root/', '/var/', '/tmp/', '/opt/'];
    if (unixRoots.some(root => filepath.startsWith(root))) {
      return true;
    }
  }
  // Windows absolute paths: C:\..., D:\...
  if (/^[a-zA-Z]:\\/.test(filepath)) {
    return true;
  }
  return false;
}

function sanitizeFilename(filename) {
  // Replace spaces with underscores
  let sanitized = filename.replace(/\s+/g, '_');

  // Remove or replace other potentially problematic characters
  // Keep alphanumeric, dots, hyphens, and underscores
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Remove multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');

  return sanitized;
}

function buildTeaser(html) {
  // Simple teaser: first few paragraphs
  const parts = html.split('</p>');
  return parts.slice(0, 2).join('</p>') + '</p>';
}

function parseOrder(filename) {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 999;
}

/**
 * Загружает SEO данные из config/seo-data.json
 */
function loadSeoData() {
  if (cachedSeoData !== null) {
    return cachedSeoData;
  }

  try {
    if (fs.existsSync(PATHS.config.seo)) {
      const raw = fs.readFileSync(PATHS.config.seo, 'utf8');
      cachedSeoData = JSON.parse(raw);
      console.log(`✅ Загружены SEO данные (${Object.keys(cachedSeoData).length} записей)`);
    } else {
      cachedSeoData = {};
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения seo-data.json:', error.message);
    cachedSeoData = {};
  }

  return cachedSeoData;
}

/**
 * Получает SEO данные для конкретного элемента контента
 */
function getSeoForItem(item) {
  const seoData = loadSeoData();

  // Генерируем ID в том же формате, что и в админке
  const seoId = `${item.branch}/${item.file}`.replace(/[^a-zA-Z0-9]/g, '-');

  if (seoData[seoId] && seoData[seoId].values) {
    return seoData[seoId].values;
  }

  return null;
}

/**
 * Экранирует HTML атрибуты
 */
function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  const safe = String(str);
  return safe
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateMetaTags(item, config, mode, type) {
  const seo = getSeoForItem(item);
  const domain = config.domain || 'example.com';
  const baseUrl = `https://${domain}`;

  // Получаем значения из SEO данных или fallback к defaults
  const description = seo?.description || item.excerpt || '';
  const ogTitle = seo?.ogTitle || seo?.title || item.title || '';
  const ogDescription = seo?.ogDescription || description;
  const ogImage = seo?.ogImage || '';
  const robots = seo?.robots || 'index,follow';
  const canonical = seo?.canonical || '';
  const twitterCard = seo?.twitterCard || 'summary_large_image';

  let meta = [];

  // Базовые мета-теги
  meta.push(`<meta name="description" content="${escapeAttr(description)}">`);
  meta.push(`<meta name="robots" content="${escapeAttr(robots)}">`);

  // Canonical URL
  if (canonical) {
    meta.push(`<link rel="canonical" href="${escapeAttr(canonical)}">`);
  }

  // Open Graph
  meta.push(`<meta property="og:title" content="${escapeAttr(ogTitle)}">`);
  meta.push(`<meta property="og:description" content="${escapeAttr(ogDescription)}">`);
  meta.push(`<meta property="og:type" content="${seo?.ogType || 'article'}">`);
  meta.push(`<meta property="og:site_name" content="${escapeAttr(domain)}">`);

  if (ogImage) {
    const imageUrl = ogImage.startsWith('http') ? ogImage : `${baseUrl}${ogImage}`;
    meta.push(`<meta property="og:image" content="${escapeAttr(imageUrl)}">`);
  }

  // Twitter Card
  if (twitterCard && twitterCard !== 'none') {
    meta.push(`<meta name="twitter:card" content="${escapeAttr(twitterCard)}">`);
    meta.push(`<meta name="twitter:title" content="${escapeAttr(ogTitle)}">`);
    meta.push(`<meta name="twitter:description" content="${escapeAttr(ogDescription)}">`);
    if (ogImage) {
      const imageUrl = ogImage.startsWith('http') ? ogImage : `${baseUrl}${ogImage}`;
      meta.push(`<meta name="twitter:image" content="${escapeAttr(imageUrl)}">`);
    }
  }

  return meta.join('\n  ');
}

function generateSchemaOrg(item, config, type) {
  const seo = getSeoForItem(item);
  const domain = config.domain || 'example.com';
  const baseUrl = `https://${domain}`;

  // Базовая Schema.org разметка для статей
  if (type === 'course' || type === 'recommendation') {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": seo?.title || item.title,
      "description": seo?.description || item.excerpt || '',
      "author": {
        "@type": "Organization",
        "name": config.footer?.companyName || domain
      },
      "publisher": {
        "@type": "Organization",
        "name": config.footer?.companyName || domain
      }
    };

    if (seo?.ogImage) {
      schema.image = seo.ogImage.startsWith('http') ? seo.ogImage : `${baseUrl}${seo.ogImage}`;
    }

    return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  }

  return '';
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function copyStaticAssets(mode) {
  // Static assets are handled by Vite mostly now.
  // But if we have specific assets in src/assets that are not imported in JS/CSS,
  // we might need to copy them.
  // For now, assume Vite handles it.
}

async function copyFaviconAssets() {
  const config = loadFaviconConfig();
  const manifest = getFaviconManifest();

  try {
    await ensureDir(PATHS.dist.assets);
    const copied = [];
    let primaryCopied = false;

    const filesToCopy = new Set([
      ...REQUIRED_FAVICON_FILES,
      config.filename || 'favicon.svg',
      ...Object.keys(config.files || {})
    ]);

    for (const name of filesToCopy) {
      const src = path.join(PATHS.srcAssets, name);
      if (fs.existsSync(src)) {
        await fsp.copyFile(src, path.join(PATHS.dist.assets, name));
        copied.push(name);
        if (name === config.filename) {
          primaryCopied = true;
        }
      }
    }

    if (!primaryCopied) {
      const defaultFavicon = path.join(PATHS.srcAssets, 'favicon.svg');
      if (fs.existsSync(defaultFavicon)) {
        await fsp.copyFile(defaultFavicon, path.join(PATHS.dist.assets, 'favicon.svg'));
        copied.push('favicon.svg');
      }
    }

    if (copied.length > 0) {
      console.log(`✅ Favicon ассеты скопированы: ${copied.join(', ')}`);
    } else {
      console.warn('⚠️  Не найдено favicon файлов для копирования');
    }

    // Генерируем webmanifest только из существующих иконок
    const available = copied.reduce((set, name) => {
      set.add(name);
      return set;
    }, new Set());

    const manifestIcons = (manifest.icons || DEFAULT_MANIFEST.icons)
      .map(icon => {
        if (!icon || !icon.src) return null;
        const filename = icon.src.replace(/^\/assets\//, '').replace(/^\//, '');
        if (!available.has(filename)) return null;
        return {
          src: icon.src.startsWith('/') ? icon.src : `/${icon.src}`,
          sizes: icon.sizes,
          type: icon.type
        };
      })
      .filter(Boolean);

    const manifestToWrite = Object.assign({}, manifest, {
      icons: manifestIcons.length > 0 ? manifestIcons : DEFAULT_MANIFEST.icons
    });

    await fsp.writeFile(
      path.join(PATHS.dist.assets, 'site.webmanifest'),
      JSON.stringify(manifestToWrite, null, 2),
      'utf8'
    );
    console.log('✅ site.webmanifest сгенерирован');
  } catch (error) {
    console.warn('⚠️  Ошибка копирования favicon:', error.message);
  }
}

async function copyContentAssets(assets) {
  // Копируем favicon
  await copyFaviconAssets();

  if (!assets || assets.size === 0) {
    return;
  }

  // Ensure destination directory exists and is clean
  await ensureDir(PATHS.dist.contentAssets);
  // Clean directory to remove stale assets
  // We only clean files, not the directory itself to avoid race conditions if parallel
  const existingFiles = await fsp.readdir(PATHS.dist.contentAssets);
  for (const file of existingFiles) {
    if (file !== '.gitkeep') { // preserve .gitkeep if exists
      await fsp.unlink(path.join(PATHS.dist.contentAssets, file));
    }
  }

  let copiedCount = 0;
  let errorCount = 0;

  for (const [sourcePath, assetInfo] of assets.entries()) {
    try {
      const destPath = path.join(PATHS.dist.contentAssets, assetInfo.destination);

      // Check if source file exists
      if (!fs.existsSync(sourcePath)) {
        console.warn(`⚠️  Source file not found: ${sourcePath}`);
        errorCount++;
        continue;
      }

      // Copy the file
      await fsp.copyFile(sourcePath, destPath);
      copiedCount++;
    } catch (error) {
      console.error(`❌ Error copying asset ${sourcePath}:`, error.message);
      errorCount++;
    }
  }

  if (copiedCount > 0) {
    console.log(`✅ Copied ${copiedCount} content asset(s) to dist/assets/content/`);
  }
  if (errorCount > 0) {
    console.warn(`⚠️  ${errorCount} asset(s) failed to copy`);
  }
}

async function copyServerFiles(dest) {
  // Копируем отдельные файлы
  for (const file of PATHS.server.files) {
    const src = path.join(PATHS.server.root, file);
    if (fs.existsSync(src)) {
      await fsp.copyFile(src, path.join(dest, file));
    }
  }

  // Копируем директории рекурсивно (новая модульная структура)
  if (PATHS.server.directories) {
    for (const dir of PATHS.server.directories) {
      const srcDir = path.join(PATHS.server.root, dir);
      const destDir = path.join(dest, dir);
      if (fs.existsSync(srcDir)) {
        await copyDirectory(srcDir, destDir);
        console.log(`✅ Скопирована директория server/${dir}/`);
      }
    }
  }

  // Копируем legacy файлы для обратной совместимости (если есть)
  if (PATHS.server.legacyFiles) {
    for (const file of PATHS.server.legacyFiles) {
      const src = path.join(PATHS.server.root, file);
      if (fs.existsSync(src)) {
        await fsp.copyFile(src, path.join(dest, file));
      }
    }
  }
}

/**
 * Рекурсивно копирует директорию
 */
async function copyDirectory(src, dest) {
  await ensureDir(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

async function generateRobotsTxt(dest, config) {
  await fsp.writeFile(path.join(dest, 'robots.txt'), `User-agent: *\nDisallow: /premium/\n`, 'utf8');
}

async function generateSitemap(content, dest, config) {
  const domain = config.domain || 'example.com';
  const baseUrl = `https://${domain}`;
  const today = new Date().toISOString().split('T')[0];

  let urls = [];

  // 1. Intro (Главная страница)
  // Обычно intro[0] это главная
  if (content.intro && content.intro.length > 0) {
    urls.push({
      loc: `${baseUrl}/`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '1.0'
    });
  }

  // 2. Course (Курс)
  if (content.course) {
    content.course.forEach(item => {
      urls.push({
        loc: `${baseUrl}/course/${item.slug}.html`,
        lastmod: today, // В идеале брать из git или file mtime, но пока today
        changefreq: 'weekly',
        priority: '0.8'
      });
    });
  }

  // 3. Recommendations (Рекомендации)
  if (content.recommendations) {
    content.recommendations.forEach(item => {
      urls.push({
        loc: `${baseUrl}/recommendations/${item.slug}.html`,
        lastmod: today,
        changefreq: 'monthly',
        priority: '0.6'
      });
    });
  }

  // 4. Legal (Юридическая информация)
  if (content.legal) {
    content.legal.forEach(item => {
      urls.push({
        loc: `${baseUrl}/shared/legal/${item.slug}.html`,
        lastmod: today,
        changefreq: 'monthly',
        priority: '0.3'
      });
    });
  }

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  await fsp.writeFile(path.join(dest, 'sitemap.xml'), sitemapContent, 'utf8');
  console.log(`✅ Sitemap сгенерирован: ${urls.length} URL(s)`);
}

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      Object.assign(source[key], deepMerge(target[key], source[key]));
    }
  }
  Object.assign(target || {}, source);
  return target;
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-');  // Replace multiple - with single -
}

function stripQuotes(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const singleMatch = trimmed.match(/^'(.*)'$/);
  const doubleMatch = trimmed.match(/^"(.*)"$/);
  if (singleMatch) return singleMatch[1];
  if (doubleMatch) return doubleMatch[1];
  return trimmed;
}

function normalizeCoverValue(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = stripQuotes(raw);
  return trimmed ? trimmed.trim() : '';
}

module.exports = { build };
