const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { minify: minifyJS } = require('terser');
const csso = require('csso');

const PATHS = {
  content: path.resolve(__dirname, '../../content'),
  dist: {
    root: path.resolve(__dirname, '../../dist'),
    free: path.resolve(__dirname, '../../dist/free'),
    premium: path.resolve(__dirname, '../../dist/premium'),
    premiumAssets: path.resolve(__dirname, '../../dist/premium/assets'),
    recommendations: path.resolve(__dirname, '../../dist/recommendations'),
    shared: path.resolve(__dirname, '../../dist/shared'),
    assets: path.resolve(__dirname, '../../dist/assets')
  },
  assets: {
    freeScript: path.resolve(__dirname, '../../src/script.js'),
    premiumScript: path.resolve(__dirname, '../../src/script.js'),
    cta: path.resolve(__dirname, '../../src/cta.js'),
    styles: path.resolve(__dirname, '../../src/styles.css'),
    modeUtils: path.resolve(__dirname, '../../src/mode-utils.js'),
    assetsDir: path.resolve(__dirname, '../../src/assets'),
    premiumAssetsDir: path.resolve(__dirname, '../../src/premium/assets')
  },
  templates: {
    free: path.resolve(__dirname, '../../src/template.html'),
    premium: path.resolve(__dirname, '../../src/template-paywall.html')
  },
  config: {
    site: path.resolve(__dirname, '../../config/site.json')
  },
  server: {
    root: path.resolve(__dirname, '../../server'),
    files: [
      'index.php',
      'auth.php',
      'check-auth.php',
      'logout.php',
      'robokassa-callback.php',
      'success.php',
      'create-invoice.php',
      '.htaccess',
      'users.json.example'
    ]
  },
  viteManifest: path.resolve(__dirname, '../../dist/assets/.vite/manifest.json')
};

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

/**
 * Получает пути к ассетам из Vite manifest
 */
function getViteAssets(manifest, mode) {
  if (!manifest) {
    // Fallback если manifest не найден
    return {
      css: '/assets/styles.css',
      js: `/assets/${mode}.js`
    };
  }

  const entryKey = `entries/${mode}.js`;
  const stylesKey = 'styles.css';

  const entry = manifest[entryKey];
  const styles = manifest[stylesKey];

  return {
    css: styles ? `/assets/${styles.file}` : '/assets/styles.css',
    js: entry ? `/assets/${entry.file}` : `/assets/${mode}.js`
  };
}

const DEFAULT_SITE_CONFIG = {
  domain: 'example.com',
  pricing: {
    originalAmount: 1490,
    currentAmount: 990,
    currency: 'RUB'
  },
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
  legal: {},
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

  let config, content, template;

  try {
    config = await loadSiteConfig();
  } catch (error) {
    throw new Error(`Ошибка загрузки конфигурации: ${error.message}`);
  }

  try {
    content = await loadContent(config.build.wordsPerMinute);
  } catch (error) {
    throw new Error(`Ошибка загрузки контента: ${error.message}`);
  }

  try {
    template = await readTemplate('free');
  } catch (error) {
    throw new Error(`Ошибка загрузки шаблона: ${error.message}`);
  }

  // Загружаем Vite manifest для получения путей к ассетам
  const manifest = loadViteManifest();
  const viteAssets = getViteAssets(manifest, 'free');

  try {
    await ensureDir(PATHS.dist.root);
    await cleanDir(PATHS.dist.free);
    await ensureDir(PATHS.dist.free);
  } catch (error) {
    throw new Error(`Ошибка подготовки директории dist/free: ${error.message}`);
  }

  try {
    await copyStaticAssets('free');
  } catch (error) {
    console.warn(`⚠️ Ошибка копирования статических файлов: ${error.message}`);
  }

  const menuItems = buildMenuItems(content, 'free');

  for (const intro of content.intro) {
    // Определяем URL первой страницы курса для навигации с intro
    const firstCourse = content.course[0];
    const nextUrl = firstCourse ? `/free/course/${firstCourse.slug}.html` : '';
    const page = buildIntroPage(intro, menuItems, config, template, 'free', nextUrl, viteAssets);
    const targetPath = path.join(PATHS.dist.root, 'index.html');
    await fsp.writeFile(targetPath, page, 'utf8');
    break;
  }

  for (const course of content.course) {
    const page = buildFreeCoursePage(course, menuItems, config, template, viteAssets);
    const targetPath = path.join(PATHS.dist.free, 'course', `${course.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  for (const legal of content.legal) {
    const page = buildLegalPage(legal, menuItems, config, template, 'free', viteAssets);
    const targetPath = path.join(PATHS.dist.free, 'legal', `${legal.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  // Генерация SEO файлов
  await generateRobotsTxt(PATHS.dist.root, config);
  await generateSitemap(content, PATHS.dist.root, config);
}

/**
 * Собирает premium версию курса
 *
 * Порядок согласно ARCHITECTURE_v1.1:277:
 * intro → course[1..N] → appendix[1..M]
 *
 * Каждая страница имеет ссылки "Назад/Далее" по линейной цепочке
 */
async function buildPremium() {
  const config = await loadSiteConfig();
  const content = await loadContent(config.build.wordsPerMinute);
  const template = await readTemplate('premium');

  // Загружаем Vite manifest для получения путей к ассетам
  const manifest = loadViteManifest();
  const viteAssets = getViteAssets(manifest, 'premium');

  await cleanDir(PATHS.dist.premium);
  await ensureDir(PATHS.dist.premium);
  await copyStaticAssets('premium');
  await copyServerFiles(PATHS.dist.premium);

  const menuItems = buildMenuItems(content, 'premium');

  // Цепочка навигации: intro → course → appendix
  const navigationChain = [...content.intro, ...content.course, ...content.appendix];

  // Генерируем страницы с навигацией
  for (let index = 0; index < navigationChain.length; index++) {
    const item = navigationChain[index];
    const prevItem = navigationChain[index - 1];
    const nextItem = navigationChain[index + 1];

    const prevUrl = prevItem ? getPremiumUrlForItem(prevItem) : null;
    const nextUrl = nextItem ? getPremiumUrlForItem(nextItem) : null;

    const page = buildPremiumContentPage(item, menuItems, config, template, { prevUrl, nextUrl }, viteAssets);
    const targetPath = getPremiumPathForItem(item, PATHS.dist.premium);

    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }
}

/**
 * Генерирует URL для элемента в premium версии
 * @param {Object} item - элемент контента (intro/course/appendix)
 * @returns {string} - URL
 */
function getPremiumUrlForItem(item) {
  if (item.branch === 'intro') {
    return '/premium/';
  } else if (item.branch === 'appendix') {
    return `/premium/appendix/${item.slug}.html`;
  } else {
    return `/premium/course/${item.slug}.html`;
  }
}

/**
 * Генерирует путь к файлу для элемента в premium версии
 * @param {Object} item - элемент контента
 * @param {string} root - корневая директория
 * @returns {string} - путь к файлу
 */
function getPremiumPathForItem(item, root) {
  if (item.branch === 'intro') {
    return path.join(root, 'index.html');
  } else if (item.branch === 'appendix') {
    return path.join(root, 'appendix', `${item.slug}.html`);
  } else {
    return path.join(root, 'course', `${item.slug}.html`);
  }
}

/**
 * Генерирует страницу контента для premium (универсальная для intro/course/appendix)
 * @param {Object} item - элемент контента
 * @param {Array} menuItems - меню
 * @param {Object} config - конфигурация
 * @param {string} template - шаблон
 * @param {Object} navigation - объект с prevUrl и nextUrl
 * @returns {string} - HTML страницы
 */
function buildPremiumContentPage(item, menuItems, config, template, { prevUrl, nextUrl }, viteAssets = null) {
  return buildPremiumPage(item, menuItems, config, template, { prevUrl, nextUrl }, viteAssets);
}

async function buildRecommendations() {
  const config = await loadSiteConfig();
  const content = await loadContent(config.build.wordsPerMinute);
  const template = await readTemplate('free');
  const menuItems = buildMenuItems(content, 'free');

  await copyStaticAssets('free');

  await ensureDir(PATHS.dist.shared);
  await cleanDir(PATHS.dist.recommendations);
  await ensureDir(PATHS.dist.recommendations);

  const recommendations = content.recommendations.map(rec => ({
    slug: rec.slug,
    title: rec.title,
    excerpt: rec.excerpt,
    readingTimeMinutes: rec.readingTimeMinutes,
    url: `/recommendations/${rec.slug}.html`
  }));

  await fsp.writeFile(
    path.join(PATHS.dist.shared, 'recommendations.json'),
    JSON.stringify(recommendations, null, 2),
    'utf8'
  );

  for (const rec of content.recommendations) {
    const page = buildRecommendationPage(rec, menuItems, config, template, 'free');
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

async function readTemplate(mode) {
  const templatePath = PATHS.templates[mode];
  const fallback = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>{{title}}</title></head><body>{{body}}</body></html>';
  if (!templatePath || !fs.existsSync(templatePath)) return fallback;
  try {
    return await fsp.readFile(templatePath, 'utf8');
  } catch (error) {
    console.warn('⚠️  Не удалось прочитать шаблон, используется дефолтный HTML:', error.message);
    return fallback;
  }
}

async function loadContent(wordsPerMinute) {
  const intro = await loadMarkdownBranch(path.join(PATHS.content, 'intro'), 'intro', wordsPerMinute);
  const course = await loadMarkdownBranch(path.join(PATHS.content, 'course'), 'course', wordsPerMinute);
  const appendix = await loadMarkdownBranch(path.join(PATHS.content, 'appendix'), 'appendix', wordsPerMinute);
  const recommendations = await loadMarkdownBranch(path.join(PATHS.content, 'recommendations'), 'recommendations', wordsPerMinute);
  const legal = await loadMarkdownBranch(path.join(PATHS.content, 'legal'), 'legal', wordsPerMinute);

  return { intro, course, appendix, recommendations, legal };
}

async function loadMarkdownBranch(dirPath, branch, wordsPerMinute = DEFAULT_SITE_CONFIG.build.wordsPerMinute) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = await fsp.readdir(dirPath);
  const files = entries.filter(name => name.endsWith('.md')).sort();

  const items = [];
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const rawMarkdown = await fsp.readFile(fullPath, 'utf8');
    const { data, body } = parseFrontMatter(rawMarkdown);
    const slug = data.slug || slugify(file.replace(/^(\d+[-_]?)/, '').replace(/\.md$/, ''));
    const title = data.title || extractH1(body) || slug;
    const readingTimeMinutes = calculateReadingTime(body, wordsPerMinute);
    const { introMd, restMd } = extractLogicalIntro(body);
    const introHtml = renderMarkdown(introMd);
    const restHtml = renderMarkdown(restMd);
    const fullHtml = renderMarkdown(body);
    const teaserHtml = buildTeaser(restHtml);
    const excerpt = data.excerpt || teaserHtml.replace(/<[^>]+>/g, '').trim();
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
      frontMatter: data,
      branch
    });
  }

  return items.sort((a, b) => a.order - b.order);
}

/**
 * Формирует элементы меню курса согласно ARCHITECTURE_v1.1
 *
 * Free: intro → course (БЕЗ recommendations и legal)
 * Premium: intro → course → appendix
 *
 * Recommendations и legal НИКОГДА не входят в меню курса (только в карусель и прямые URL)
 *
 * @param {Object} content - загруженный контент
 * @param {string} mode - режим ('free' или 'premium')
 * @returns {Array<MenuItem>} - отсортированный массив элементов меню
 */
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

  // Разделы курса
  for (const course of content.course) {
    menu.push({
      type: 'course',
      title: course.title,
      url: mode === 'premium' ? `/premium/course/${course.slug}.html` : `/free/course/${course.slug}.html`,
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

  // НЕ добавляем recommendations и legal в меню курса!
  // Они доступны только по прямым URL и через карусель рекомендаций

  return menu.sort((a, b) => a.order - b.order);
}

function buildIntroPage(item, menuItems, config, template, mode, nextUrl = '', viteAssets = null) {
  // Задача 3: Intro - особая публичная страница без paywall
  // Навигация всегда только вперед - на первую страницу курса
  const buttonText = mode === 'premium' ? config.ctaTexts.next : config.ctaTexts.enterFull;
  const pageType = mode === 'premium' ? 'intro-premium' : 'intro-free';

  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article data-page-type="${pageType}" data-button-text="${buttonText}" data-next-page="${nextUrl}">${item.fullHtml}</article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, mode)}
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    meta: generateMetaTags(item, config, mode, 'intro'),
    schema: generateSchemaOrg(item, config, 'intro'),
    viteAssets
  });
}

function buildFreeCoursePage(item, menuItems, config, template, viteAssets = null) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article data-page-type="free" data-button-text="${config.ctaTexts.enterFull}">
      ${item.introHtml}
      <div class="premium-teaser">
        <div class="premium-teaser__blurred" data-nosnippet><!--noindex-->${item.teaserHtml}<!--/noindex--></div>
        <div class="premium-teaser__overlay">
          <button class="cta-button" data-analytics="cta-premium">${config.ctaTexts.enterFull}</button>
        </div>
      </div>
    </article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, 'free')}
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    meta: generateMetaTags(item, config, 'free', 'course'),
    schema: generateSchemaOrg(item, config, 'course'),
    viteAssets
  });
}

function buildPremiumPage(item, menuItems, config, template, { prevUrl, nextUrl }, viteAssets = null) {
  // Задача 1: Упрощение навигации - только однонаправленная (кнопка "Назад" убрана)
  // Возврат происходит через боковое меню или браузерную кнопку "Назад"

  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article data-page-type="premium" data-button-text="${config.ctaTexts.next}" data-next-page="${nextUrl || ''}">${item.fullHtml}</article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, 'premium')}
  `;

  const pageType = item.branch === 'intro' ? 'intro' : (item.branch === 'appendix' ? 'appendix' : 'course');

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    meta: generateMetaTags(item, config, 'premium', pageType),
    schema: generateSchemaOrg(item, config, pageType),
    viteAssets
  });
}

function buildRecommendationPage(item, menuItems, config, template, mode) {
  // Задача 2: Для рекомендаций кнопка "Открыть курс" ведет на intro или последнюю позицию
  const introUrl = mode === 'premium' ? '/premium/' : '/';

  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article data-page-type="recommendation" data-button-text="${config.ctaTexts.openCourse}" data-next-page="${introUrl}">${item.fullHtml}</article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, mode)}
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    meta: generateMetaTags(item, config, mode, 'recommendation'),
    schema: generateSchemaOrg(item, config, 'recommendation')
  });
}

function buildLegalPage(item, menuItems, config, template, mode, viteAssets = null) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
    </header>
    <article>${item.fullHtml}</article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, mode)}
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    meta: generateMetaTags(item, config, mode, 'legal'),
    schema: '',
    viteAssets
  });
}

function renderMenu(items) {
  const links = items
    .map(item => `<li class="menu-item menu-item--${item.type}"><a href="${item.url}">${item.title}</a><span class="menu-item__time">${pluralizeMinutes(item.readingTimeMinutes)}</span></li>`)
    .join('\n');
  return `<nav class="menu"><ul>${links}</ul></nav>`;
}

function renderFooter(config, mode) {
  return `
  <footer class="footer footer--${mode}">
    <div class="footer__company">${config.footer.companyName} · ИНН ${config.footer.inn} · © ${config.footer.year}</div>
  </footer>`;
}

function applyTemplate(template, { title, body, meta = '', schema = '', viteAssets = null }) {
  let result = template
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<div id="article-content">[\s\S]*?<\/div>/, `<div id="article-content">${body}</div>`)
    .replace('{{title}}', title)
    .replace('{{body}}', body);

  // Вставляем мета-теги перед закрывающим </head>
  if (meta) {
    result = result.replace('</head>', `${meta}\n  </head>`);
  }

  // Вставляем Schema.org перед закрывающим </body>
  if (schema) {
    result = result.replace('</body>', `  ${schema}\n  </body>`);
  }

  // Заменяем Vite плейсхолдеры
  if (viteAssets) {
    result = result.replace(
      '<!-- VITE_CSS_PLACEHOLDER -->',
      `<link rel="stylesheet" href="${viteAssets.css}">`
    );
    result = result.replace(
      '<!-- VITE_JS_PLACEHOLDER -->',
      `<script type="module" src="${viteAssets.js}"></script>`
    );
  }

  return result;
}

/**
 * Извлекает логическое введение из markdown согласно ARCHITECTURE_v1.1
 *
 * Алгоритм:
 * - Ветка A: после H1 идут параграфы — берем до 3-х параграфов
 * - Ветка B: после H1 идет HR, затем H2 — анализируем H2 на наличие "введение"
 * - Ветка C: после H1 сразу идет H2 — анализируем H2 на наличие "введение"
 *
 * @param {string} markdown - исходный markdown текст
 * @returns {{introMd: string, restMd: string}} - разделенный текст
 */
function extractLogicalIntro(markdown) {
  const tokens = marked.lexer(markdown, { mangle: false, headerIds: true });
  const h1Index = tokens.findIndex(token => token.type === 'heading' && token.depth === 1);

  // Если H1 не найден, весь текст — это введение
  if (h1Index === -1) {
    return { introMd: markdown, restMd: '' };
  }

  let introEndIndex = h1Index + 1;
  const MAX_INTRO_PARAGRAPHS = 3;

  // Пропускаем пробельные токены после H1
  let nextTokenIndex = h1Index + 1;
  while (nextTokenIndex < tokens.length && tokens[nextTokenIndex].type === 'space') {
    nextTokenIndex++;
  }

  if (nextTokenIndex >= tokens.length) {
    return { introMd: tokensToMarkdown(tokens.slice(0, h1Index + 1)), restMd: '' };
  }

  const firstSignificantToken = tokens[nextTokenIndex];
  const secondSignificantToken = tokens[nextTokenIndex + 1];

  // === Ветка A: после H1 сразу идут параграфы ===
  if (firstSignificantToken.type === 'paragraph') {
    introEndIndex = collectParagraphs(tokens, nextTokenIndex, MAX_INTRO_PARAGRAPHS);
  }
  // === Ветка B: после H1 идет HR, затем H2 ===
  else if (firstSignificantToken.type === 'hr') {
    const h2Index = findNextHeading(tokens, nextTokenIndex + 1, 2);
    if (h2Index !== -1) {
      const h2Token = tokens[h2Index];
      // Если H2 содержит "введение", берем до 3 параграфов, иначе только 1-2
      const paragraphCount = hasIntroductionKeyword(h2Token.text)
        ? MAX_INTRO_PARAGRAPHS
        : 2;
      introEndIndex = collectParagraphs(tokens, h2Index + 1, paragraphCount);
    } else {
      introEndIndex = nextTokenIndex + 1; // Только H1 + HR
    }
  }
  // === Ветка C: после H1 сразу идет H2 ===
  else if (firstSignificantToken.type === 'heading' && firstSignificantToken.depth === 2) {
    // Если H2 содержит "введение", берем до 3 параграфов, иначе только 1-2
    const paragraphCount = hasIntroductionKeyword(firstSignificantToken.text)
      ? MAX_INTRO_PARAGRAPHS
      : 2;
    introEndIndex = collectParagraphs(tokens, nextTokenIndex + 1, paragraphCount);
  }
  // === Другие случаи: только H1 ===
  else {
    introEndIndex = nextTokenIndex;
  }

  const introTokens = tokens.slice(0, introEndIndex);
  const restTokens = tokens.slice(introEndIndex);

  return {
    introMd: tokensToMarkdown(introTokens),
    restMd: tokensToMarkdown(restTokens)
  };
}

/**
 * Собирает указанное количество параграфов начиная с позиции
 * @param {Array} tokens - массив токенов
 * @param {number} startIndex - начальная позиция
 * @param {number} maxParagraphs - максимум параграфов
 * @returns {number} - индекс конца введения
 */
function collectParagraphs(tokens, startIndex, maxParagraphs) {
  let paragraphCount = 0;
  let currentIndex = startIndex;

  while (currentIndex < tokens.length && paragraphCount < maxParagraphs) {
    const token = tokens[currentIndex];

    // Параграф найден
    if (token.type === 'paragraph') {
      paragraphCount++;
      currentIndex++;
    }
    // Пробельные токены пропускаем
    else if (token.type === 'space') {
      currentIndex++;
    }
    // Остановка на H2 или HR
    else if (token.type === 'heading' && token.depth === 2) {
      break;
    }
    else if (token.type === 'hr') {
      break;
    }
    // Другие блоки (списки, код) считаем как контент и продолжаем
    else {
      currentIndex++;
    }
  }

  return currentIndex;
}

/**
 * Ищет следующий заголовок указанного уровня
 * @param {Array} tokens - массив токенов
 * @param {number} startIndex - начальная позиция
 * @param {number} depth - уровень заголовка
 * @returns {number} - индекс заголовка или -1
 */
function findNextHeading(tokens, startIndex, depth) {
  for (let i = startIndex; i < tokens.length; i++) {
    if (tokens[i].type === 'heading' && tokens[i].depth === depth) {
      return i;
    }
  }
  return -1;
}

/**
 * Проверяет наличие слова "введение" в тексте (регистронезависимо)
 * @param {string} text - текст для проверки
 * @returns {boolean} - содержит ли текст слово "введение"
 */
function hasIntroductionKeyword(text) {
  return /введение/i.test(text || '');
}

function tokensToMarkdown(tokens) {
  return tokens.map(token => token.raw || '').join('').trim();
}

function renderMarkdown(markdown) {
  const html = marked.parse(markdown, { mangle: false, headerIds: true });
  return sanitize.sanitize(html);
}

function extractH1(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function calculateReadingTime(markdown, wordsPerMinute = 180) {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / (wordsPerMinute || 180)));
}

function buildTeaser(restHtml) {
  if (!restHtml) return '';
  const paragraphs = restHtml.match(/<p[^>]*>.*?<\/p>/g) || [];
  return paragraphs.slice(0, 2).join('');
}

/**
 * Парсит YAML front matter из markdown
 * @param {string} markdown - markdown текст с front matter
 * @returns {{data: Object, body: string}} - распарсенные данные и тело
 */
function parseFrontMatter(markdown) {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { data: {}, body: markdown };

  const [, yamlBlock, body] = fmMatch;
  const data = {};

  yamlBlock.split(/\n/).forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    if (!key) return;

    // Убираем кавычки, если они окружают значение
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Преобразуем числа
    if (/^\d+$/.test(value)) {
      data[key] = parseInt(value, 10);
    } else {
      data[key] = value;
    }
  });

  return { data, body };
}

function parseOrder(file) {
  const match = file.match(/^(\d+|[A-Za-z])/);
  if (!match) return 999;
  const [value] = match;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value.toUpperCase().charCodeAt(0);
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

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = await fsp.readdir(dir);
  await Promise.all(entries.map(entry => fsp.rm(path.join(dir, entry), { recursive: true, force: true })));
}

async function copyStaticAssets(mode) {
  const isPremium = mode === 'premium';
  const targetRoot = isPremium ? PATHS.dist.premium : PATHS.dist.free;
  const targetAssets = isPremium ? PATHS.dist.premiumAssets : PATHS.dist.assets;
  const scriptSource = isPremium ? PATHS.assets.premiumScript : PATHS.assets.freeScript;

  await ensureDir(PATHS.dist.root);
  await ensureDir(targetRoot);

  // Собираем ассеты Vite один раз, если они отсутствуют
  if (!fs.existsSync(PATHS.dist.assets)) {
    console.log('📦 Запуск Vite build...');
    const { execSync } = require('child_process');
    try {
      execSync('npm run build:assets', { stdio: 'inherit', cwd: path.resolve(__dirname, '../../') });
    } catch (e) {
      console.error('❌ Ошибка Vite build:', e.message);
    }
  }

  // Копируем статические ассеты (изображения)
  await copyIfExists(PATHS.assets.assetsDir, PATHS.dist.assets);

  if (isPremium) {
    await copyIfExists(PATHS.assets.assetsDir, targetAssets);
    await copyIfExists(PATHS.assets.premiumAssetsDir, targetAssets);
  }

  // JS и CSS теперь бандлятся Vite и находятся в dist/assets
  // Отдельное копирование mode-utils.js, cta.js, script.js больше не требуется
}

async function copyIfExists(src, dest) {
  if (!src || !fs.existsSync(src)) return;
  const stats = await fsp.stat(src);
  if (stats.isDirectory()) {
    await copyDir(src, dest);
  } else {
    await ensureDir(path.dirname(dest));
    await fsp.copyFile(src, dest);
  }
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
    copyIfExists(path.join(PATHS.server.root, file), path.join(distRoot, file))
  );
  await Promise.all(tasks);
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

/**
 * Склоняет слово "минута" в зависимости от числа
 * @param {number} count - количество минут
 * @returns {string} - правильная форма слова
 *
 * @example
 * pluralizeMinutes(1) // "1 минута"
 * pluralizeMinutes(2) // "2 минуты"
 * pluralizeMinutes(5) // "5 минут"
 * pluralizeMinutes(21) // "21 минута"
 */
function pluralizeMinutes(count) {
  const cases = [2, 0, 1, 1, 1, 2];
  const titles = ['минута', 'минуты', 'минут'];
  const index = (count % 100 > 4 && count % 100 < 20)
    ? 2
    : cases[Math.min(count % 10, 5)];
  return `${count} ${titles[index]}`;
}

/**
 * Форматирует время чтения в удобочитаемый формат
 * @param {number} minutes - количество минут
 * @returns {string} - отформатированная строка
 *
 * @example
 * formatReadingTime(5) // "~5 минут"
 */
function formatReadingTime(minutes) {
  return `~${pluralizeMinutes(minutes)}`;
}

function premiumUrlFor(item, root = '') {
  const sub = item.branch === 'appendix' ? 'appendix' : 'course';
  const rel = path.join(sub, `${item.slug}.html`);
  return root ? path.join(root, rel) : `/premium/${rel}`;
}

/**
 * Генерирует robots.txt для free-версии
 */
async function generateRobotsTxt(distPath, config) {
  const domain = config.domain || 'toosmart.ru';
  const robotsTxt = `# Robots.txt для ${domain}

User-agent: *
Allow: /
Allow: /free/
Allow: /free/course/
Allow: /free/legal/
Allow: /recommendations/

Disallow: /premium/
Disallow: /server/
Disallow: /dist/premium/
Disallow: /scripts/

Host: ${domain}
Sitemap: https://${domain}/sitemap.xml
`;

  await fsp.writeFile(path.join(distPath, 'robots.txt'), robotsTxt, 'utf8');
  console.log('✅ robots.txt сгенерирован');
}

/**
 * Генерирует sitemap.xml для free-версии
 */
async function generateSitemap(content, distPath, config) {
  const domain = config.domain || 'toosmart.ru';
  const baseUrl = `https://${domain}`;
  const now = new Date().toISOString().split('T')[0];

  const urls = [];

  // Главная страница
  urls.push({
    loc: `${baseUrl}/`,
    lastmod: now,
    changefreq: 'weekly',
    priority: '1.0'
  });

  // Разделы курса
  for (const course of content.course) {
    urls.push({
      loc: `${baseUrl}/free/course/${course.slug}.html`,
      lastmod: now,
      changefreq: 'monthly',
      priority: '0.8'
    });
  }

  // Рекомендации
  for (const rec of content.recommendations) {
    urls.push({
      loc: `${baseUrl}/recommendations/${rec.slug}.html`,
      lastmod: now,
      changefreq: 'monthly',
      priority: '0.7'
    });
  }

  // Legal страницы
  for (const legal of content.legal) {
    urls.push({
      loc: `${baseUrl}/free/legal/${legal.slug}.html`,
      lastmod: now,
      changefreq: 'yearly',
      priority: '0.3'
    });
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  await fsp.writeFile(path.join(distPath, 'sitemap.xml'), sitemap, 'utf8');
  console.log(`✅ sitemap.xml сгенерирован (${urls.length} URL)`);
}

/**
 * Генерирует мета-теги для SEO
 */
function generateMetaTags(item, config, mode, type) {
  const domain = config.domain || 'toosmart.ru';
  const baseUrl = `https://${domain}`;

  // Формируем description из введения (первые 160 символов)
  const description = sanitize.sanitize(item.excerpt || item.introHtml || item.fullHtml || '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .substring(0, 160);

  // Формируем URL
  let url = baseUrl;
  if (type === 'course') {
    url = mode === 'premium'
      ? `${baseUrl}/premium/course/${item.slug}.html`
      : `${baseUrl}/free/course/${item.slug}.html`;
  } else if (type === 'recommendation') {
    url = `${baseUrl}/recommendations/${item.slug}.html`;
  } else if (type === 'legal') {
    url = `${baseUrl}/free/legal/${item.slug}.html`;
  } else if (type === 'appendix' && mode === 'premium') {
    url = `${baseUrl}/premium/appendix/${item.slug}.html`;
  } else if (type === 'intro' && mode === 'premium') {
    url = `${baseUrl}/premium/`;
  }

  const ogType = type === 'recommendation' ? 'article' : 'website';
  const robotsContent = mode === 'premium' ? 'noindex, nofollow, noarchive' : 'index, follow';

  return `
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${robotsContent}">

    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(item.title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="TooSmart - Курс по клинингу">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(item.title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">`;
}

/**
 * Генерирует Schema.org микроразметку
 */
function generateSchemaOrg(item, config, type) {
  const domain = config.domain || 'toosmart.ru';
  const baseUrl = `https://${domain}`;

  if (type === 'intro') {
    // Главная страница - Course schema
    return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "Clean - Теория правильной уборки",
  "description": "${escapeHtml(item.excerpt || 'Профессиональный курс по клинингу')}",
  "provider": {
    "@type": "Organization",
    "name": "${escapeHtml(config.footer.companyName || 'TooSmart')}",
    "url": "${baseUrl}"
  },
  "hasCourseInstance": {
    "@type": "CourseInstance",
    "courseMode": "online",
    "courseWorkload": "PT${item.readingTimeMinutes || 60}M"
  }
}
</script>`;
  } else if (type === 'course') {
    // Раздел курса - WebPage schema
    return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "${escapeHtml(item.title)}",
  "description": "${escapeHtml(item.excerpt || '')}",
  "isPartOf": {
    "@type": "Course",
    "name": "Clean - Теория правильной уборки"
  },
  "hasPart": {
    "@type": "WebPageElement",
    "isAccessibleForFree": "False",
    "cssSelector": ".premium-teaser"
  }
}
</script>`;
  } else if (type === 'recommendation') {
    // Рекомендация - Article schema
    return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${escapeHtml(item.title)}",
  "description": "${escapeHtml(item.excerpt || '')}",
  "isAccessibleForFree": "True",
  "author": {
    "@type": "Organization",
    "name": "${escapeHtml(config.footer.companyName || 'TooSmart')}"
  },
  "publisher": {
    "@type": "Organization",
    "name": "${escapeHtml(config.footer.companyName || 'TooSmart')}"
  }
}
</script>`;
  }

  return '';
}

/**
 * Экранирование HTML для атрибутов
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Минифицирует и копирует JavaScript файл
 */
async function minifyAndCopyJS(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  JS файл не найден: ${src}`);
    return;
  }

  const code = await fsp.readFile(src, 'utf8');

  try {
    const result = await minifyJS(code, {
      compress: {
        dead_code: true,
        drop_console: true, // Убираем console.log в production
        drop_debugger: true,
        passes: 2
      },
      mangle: {
        toplevel: false
      },
      output: {
        comments: false,
        beautify: false
      }
    });

    await ensureDir(path.dirname(dest));
    await fsp.writeFile(dest, result.code, 'utf8');

    const savedPercent = Math.round((1 - result.code.length / code.length) * 100);
    console.log(`✅ JS минифицирован: ${path.basename(src)} (${code.length} → ${result.code.length} байт, -${savedPercent}%)`);
  } catch (error) {
    console.error(`❌ Ошибка минификации JS ${src}:`, error.message);
    // В случае ошибки копируем как есть
    await ensureDir(path.dirname(dest));
    await fsp.copyFile(src, dest);
  }
}

/**
 * Минифицирует и копирует CSS файл
 */
async function minifyAndCopyCSS(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  CSS файл не найден: ${src}`);
    return;
  }

  const code = await fsp.readFile(src, 'utf8');

  try {
    const result = csso.minify(code, {
      restructure: true,
      forceMediaMerge: true,
      comments: false
    });

    await ensureDir(path.dirname(dest));
    await fsp.writeFile(dest, result.css, 'utf8');

    const savedPercent = Math.round((1 - result.css.length / code.length) * 100);
    console.log(`✅ CSS минифицирован: ${path.basename(src)} (${code.length} → ${result.css.length} байт, -${savedPercent}%)`);
  } catch (error) {
    console.error(`❌ Ошибка минификации CSS ${src}:`, error.message);
    // В случае ошибки копируем как есть
    await ensureDir(path.dirname(dest));
    await fsp.copyFile(src, dest);
  }
}

module.exports = { build, extractLogicalIntro };
