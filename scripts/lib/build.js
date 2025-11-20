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
    modeUtils: path.resolve(__dirname, '../../src/public/mode-utils.js'),
    assets: path.resolve(__dirname, '../../dist/assets'),
    contentAssets: path.resolve(__dirname, '../../dist/assets/content')
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

  // Загружаем Vite manifest
  const manifest = loadViteManifest();

  try {
    // Читаем шаблон из dist (уже обработанный Vite)
    template = await readTemplate('free', manifest);
  } catch (error) {
    throw new Error(`Ошибка загрузки шаблона: ${error.message}`);
  }

  try {
    await ensureDir(PATHS.dist.root);
    await cleanDir(PATHS.dist.free);
    await ensureDir(PATHS.dist.free);
  } catch (error) {
    throw new Error(`Ошибка подготовки директории dist/free: ${error.message}`);
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
    const nextUrl = firstCourse ? `/free/course/${firstCourse.slug}.html` : '';
    const page = buildIntroPage(intro, menuHtml, config, template, 'free', nextUrl);
    const targetPath = path.join(PATHS.dist.root, 'index.html');
    await fsp.writeFile(targetPath, page, 'utf8');
    break;
  }

  for (const course of content.course) {
    const page = buildFreeCoursePage(course, menuHtml, config, template);
    const targetPath = path.join(PATHS.dist.free, 'course', `${course.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  for (const legal of content.legal) {
    const page = buildLegalPage(legal, menuHtml, config, template, 'free');
    const targetPath = path.join(PATHS.dist.free, 'legal', `${legal.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  // Генерация SEO файлов
  await generateRobotsTxt(PATHS.dist.root, config);
  await generateSitemap(content, PATHS.dist.root, config);
}

async function buildPremium() {
  const config = await loadSiteConfig();
  const contentAssets = new Map();
  const content = await loadContent(config.build.wordsPerMinute, contentAssets);

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

    const page = buildPremiumContentPage(item, menuHtml, config, template, { prevUrl, nextUrl });
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

function buildPremiumContentPage(item, menuHtml, config, template, { prevUrl, nextUrl }) {
  return buildPremiumPage(item, menuHtml, config, template, { prevUrl, nextUrl });
}

async function buildRecommendations() {
  const config = await loadSiteConfig();
  const contentAssets = new Map();
  const content = await loadContent(config.build.wordsPerMinute, contentAssets);

  const manifest = loadViteManifest();
  const template = await readTemplate('free', manifest);

  const menuItems = buildMenuItems(content, 'free');
  const menuHtml = generateMenuItemsHtml(menuItems);

  await copyContentAssets(contentAssets);

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
    const page = buildRecommendationPage(rec, menuHtml, config, template, 'free');
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
  // Имя файла в src/entries (или как оно определено в vite.config.js input)
  // Имя файла в src/entries (или как оно определено в vite.config.js input)
  // User requested swap: template-paywall.html is for Free (with paywall), template.html is for Premium (full)
  const entryName = mode === 'premium' ? 'template' : 'templatePaywall';
  const srcPath = mode === 'premium' ? 'src/template.html' : 'src/template-paywall.html';

  let templateFile = null;

  if (manifest) {
    // Попробуем найти по пути к исходнику
    if (manifest[srcPath]) {
      templateFile = manifest[srcPath].file;
    } else if (manifest[entryName + '.html']) {
      templateFile = manifest[entryName + '.html'].file;
    }
  }

  // Fallback: если в манифесте нет, проверяем прямые имена (Vite может не хешировать HTML entry points)
  if (!templateFile) {
    const directName = mode === 'premium' ? 'template.html' : 'template-paywall.html';
    const directPath = path.join(PATHS.dist.assets, directName);
    if (fs.existsSync(directPath)) {
      templateFile = directName;
    }
  }

  if (!templateFile) {
    console.warn(`⚠️ Не найден шаблон для ${mode}. Доступные ключи манифеста:`, manifest ? Object.keys(manifest) : 'нет манифеста');
    throw new Error(`Template not found for mode: ${mode}`);
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

  // Позволяем помечать тестовые блоки атрибутом data-demo-only (не влияет на dev-сценарий)
  document.querySelectorAll('[data-demo-only]').forEach(node => node.remove());

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

function applyTemplate(template, { title, body, menu, meta = '', schema = '' }) {
  let result = template
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace('{{body}}', body)
    .replace('{{menu}}', menu || '');

  // Вставляем мета-теги перед закрывающим </head>
  if (meta) {
    result = result.replace('</head>', `${meta}\n  </head>`);
  }

  // Вставляем Schema.org перед закрывающим </body>
  if (schema) {
    result = result.replace('</body>', `  ${schema}\n  </body>`);
  }

  // Vite assets уже там, так как мы берем шаблон из dist

  return result;
}

async function loadContent(wordsPerMinute, assetRegistry = new Map()) {
  const intro = await loadMarkdownBranch(path.join(PATHS.content, 'intro'), 'intro', wordsPerMinute, assetRegistry);
  const course = await loadMarkdownBranch(path.join(PATHS.content, 'course'), 'course', wordsPerMinute, assetRegistry);
  const appendix = await loadMarkdownBranch(path.join(PATHS.content, 'appendix'), 'appendix', wordsPerMinute, assetRegistry);
  const recommendations = await loadMarkdownBranch(path.join(PATHS.content, 'recommendations'), 'recommendations', wordsPerMinute, assetRegistry);
  const legal = await loadMarkdownBranch(path.join(PATHS.content, 'legal'), 'legal', wordsPerMinute, assetRegistry);

  return { intro, course, appendix, recommendations, legal };
}

async function loadMarkdownBranch(dirPath, branch, wordsPerMinute = DEFAULT_SITE_CONFIG.build.wordsPerMinute, assetRegistry = new Map()) {
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
    const introHtml = rewriteContentMedia(renderMarkdown(introMd), dirPath, assetRegistry);
    const restHtml = rewriteContentMedia(renderMarkdown(restMd), dirPath, assetRegistry);
    const fullHtml = rewriteContentMedia(renderMarkdown(body), dirPath, assetRegistry);
    const teaserHtml = buildTeaser(restHtml);
    const excerpt = normalizedFrontMatter.excerpt || teaserHtml.replace(/<[^>]+>/g, '').trim();
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
      branch
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

function buildIntroPage(item, menuHtml, config, template, mode, nextUrl = '') {
  const buttonText = mode === 'premium' ? config.ctaTexts.next : config.ctaTexts.enterFull;
  const pageType = mode === 'premium' ? 'intro-premium' : 'intro-free';

  // Мы теперь вставляем только внутренности .text-box
  // Но стоп, в шаблоне у нас есть .text-box с data-build-slot="body"
  // И внутри него есть header, #article-content.
  // Если мы заменяем содержимое data-build-slot="body" на {{body}},
  // то мы должны сформировать HTML, который соответствует внутренней структуре .text-box

  // Структура в шаблоне:
  /*
      <article class="text-box" aria-label="Основной материал" data-build-slot="body">
        <div class="text-box__intro">
          <header>
            <h1>Заголовок статьи</h1>
            <p class="meta">~5 минут чтения</p>
          </header>
        </div>
        <div id="article-content">
          <p>Здесь будет контент статьи...</p>
        </div>
      </article>
  */

  // Значит, {{body}} должен содержать .text-box__intro и #article-content.

  const body = `
        <div class="text-box__intro">
          <header>
            <h1>${item.title}</h1>
            <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
          </header>
          ${item.introHtml || ''}
        </div>

        <div id="article-content">
          ${item.restHtml || item.fullHtml}
        </div>
  `;

  // Также нужно обновить атрибуты у .text-box (data-page-type, data-button-text, data-next-page)
  // Но applyTemplate работает со строками.
  // Мы можем сделать это через DOM манипуляции в sanitizeTemplateForBuild? Нет, это для каждого файла разное.
  // Значит, нам нужно в applyTemplate уметь заменять атрибуты?
  // Или проще: в шаблоне не ставить эти атрибуты жестко, а использовать плейсхолдеры?
  // <article ... data-page-type="{{pageType}}" ...>
  // Это хороший вариант.

  // Но пока давайте просто заменим {{body}}. Атрибуты data-* используются JS-ом на клиенте (progress widget).
  // Если они важны, их надо прокинуть.
  // Давайте добавим плейсхолдеры атрибутов в шаблон?
  // Это потребует правки шаблона.

  // Альтернатива: Вставлять скрипт, который устанавливает эти атрибуты? Нет, плохо.

  // Давайте пока оставим атрибуты как есть (статичные или пустые) в шаблоне,
  // и посмотрим, критично ли это.
  // data-page-type="premium" - важно для логики.
  // data-next-page - важно для кнопки "Далее".

  // Решение: Я обновлю шаблоны, добавив {{pageType}}, {{buttonText}}, {{nextPage}} в атрибуты.
  // И обновлю applyTemplate, чтобы он их заменял.

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, mode, 'intro'),
    schema: generateSchemaOrg(item, config, 'intro'),
    // Доп параметры для атрибутов
    pageType,
    buttonText,
    nextPage: nextUrl
  });
}

function buildFreeCoursePage(item, menuHtml, config, template) {
  const body = `
        <div class="text-box__intro">
          <header>
            <h1>${item.title}</h1>
            <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
          </header>
          ${item.introHtml}
        </div>

        <div id="article-content">
          <div class="premium-teaser">
            <div class="premium-teaser__blurred" data-nosnippet><!--noindex-->${item.teaserHtml}<!--/noindex--></div>
            <div class="premium-teaser__overlay">
              <button class="cta-button" data-analytics="cta-premium">${config.ctaTexts.enterFull}</button>
            </div>
          </div>
        </div>
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, 'free', 'course'),
    schema: generateSchemaOrg(item, config, 'course'),
    pageType: 'free',
    buttonText: config.ctaTexts.enterFull,
    nextPage: ''
  });
}

function buildPremiumPage(item, menuHtml, config, template, { prevUrl, nextUrl }) {
  const body = `
        <div class="text-box__intro">
          <header>
            <h1>${item.title}</h1>
            <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
          </header>
          ${item.introHtml || ''}
        </div>

        <div id="article-content">
          ${item.restHtml || item.fullHtml}
        </div>
  `;

  const pageType = item.branch === 'intro' ? 'intro' : (item.branch === 'appendix' ? 'appendix' : 'course');

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, 'premium', pageType),
    schema: generateSchemaOrg(item, config, pageType),
    pageType: 'premium',
    buttonText: config.ctaTexts.next,
    nextPage: nextUrl || ''
  });
}

function buildRecommendationPage(item, menuHtml, config, template, mode) {
  const introUrl = mode === 'premium' ? '/premium/' : '/';

  const body = `
        <div class="text-box__intro">
          <header>
            <h1>${item.title}</h1>
            <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
          </header>
          ${item.introHtml || ''}
        </div>

        <div id="article-content">
          ${item.restHtml || item.fullHtml}
        </div>
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, mode, 'recommendation'),
    schema: generateSchemaOrg(item, config, 'recommendation'),
    pageType: 'recommendation',
    buttonText: config.ctaTexts.openCourse,
    nextPage: introUrl
  });
}

function buildLegalPage(item, menuHtml, config, template, mode) {
  // Legal pages are simpler, they might not fit into the .text-box structure perfectly if we enforce it.
  // But let's try to fit them.
  const body = `
    <div class="text-box__intro">
      <header>
        <h1>${item.title}</h1>
      </header>
    </div>
    <div id="article-content">
      ${item.fullHtml}
    </div>
  `;

  return applyTemplate(template, {
    title: `${item.title} — ${config.domain || 'TooSmart'}`,
    body,
    menu: menuHtml,
    meta: generateMetaTags(item, config, mode, 'legal'),
    schema: '',
    pageType: 'legal',
    buttonText: '',
    nextPage: ''
  });
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
      data[key.trim()] = value.join(':').trim();
    }
  });
  return { data, body };
}

function normalizeFrontMatterMedia(data, dirPath, assetRegistry) {
  // Logic to handle media paths in front matter if needed
  return data;
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

function extractLogicalIntro(markdown) {
  // Split by first H2 or specific marker
  const parts = markdown.split(/(?=^##\s)/m);
  if (parts.length > 1) {
    return { introMd: parts[0], restMd: parts.slice(1).join('') };
  }
  return { introMd: '', restMd: markdown };
}

function renderMarkdown(markdown) {
  return marked(markdown);
}

function rewriteContentMedia(html, dirPath, assetRegistry) {
  // Placeholder for media rewriting logic
  return html;
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

function generateMetaTags(item, config, mode, type) {
  return `<meta name="description" content="${item.excerpt || ''}">`;
}

function generateSchemaOrg(item, config, type) {
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

async function copyContentAssets(assets) {
  // Copy images referenced in markdown
}

async function copyServerFiles(dest) {
  for (const file of PATHS.server.files) {
    const src = path.join(PATHS.server.root, file);
    if (fs.existsSync(src)) {
      await fsp.copyFile(src, path.join(dest, file));
    }
  }
}

async function generateRobotsTxt(dest, config) {
  await fsp.writeFile(path.join(dest, 'robots.txt'), `User-agent: *\nDisallow: /premium/\n`, 'utf8');
}

async function generateSitemap(content, dest, config) {
  // Placeholder
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

module.exports = { build };
