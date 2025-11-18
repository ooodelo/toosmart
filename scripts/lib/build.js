const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const PATHS = {
  content: path.resolve(__dirname, '../../content'),
  dist: {
    free: path.resolve(__dirname, '../../dist/free'),
    premium: path.resolve(__dirname, '../../dist/premium'),
    shared: path.resolve(__dirname, '../../dist/shared')
  },
  assets: {
    script: path.resolve(__dirname, '../../src/script.js'),
    styles: path.resolve(__dirname, '../../src/styles.css'),
    modeUtils: path.resolve(__dirname, '../../src/mode-utils.js'),
    assetsDir: path.resolve(__dirname, '../../src/assets')
  },
  templates: {
    free: path.resolve(__dirname, '../../src/template.html'),
    premium: path.resolve(__dirname, '../../src/template.html')
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
      '.htaccess',
      'users.json.example'
    ]
  }
};

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
    goToCourse: 'Перейти к курсу'
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
    wordsPerMinute: 180
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
  const config = await loadSiteConfig();
  const content = await loadContent(config.build.wordsPerMinute);
  const template = await readTemplate('free');
  await cleanDir(PATHS.dist.free);
  await ensureDir(PATHS.dist.free);
  await copyStaticAssets(PATHS.dist.free);

  const menuItems = buildMenuItems(content, 'free');

  for (const intro of content.intro) {
    const page = buildIntroPage(intro, menuItems, config, template, 'free');
    const targetPath = path.join(PATHS.dist.free, 'index.html');
    await fsp.writeFile(targetPath, page, 'utf8');
    break;
  }

  for (const course of content.course) {
    const page = buildFreeCoursePage(course, menuItems, config, template);
    const targetPath = path.join(PATHS.dist.free, 'course', `${course.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  for (const rec of content.recommendations) {
    const page = buildRecommendationPage(rec, menuItems, config, template, 'free');
    const targetPath = path.join(PATHS.dist.free, 'recommendations', `${rec.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }

  for (const legal of content.legal) {
    const page = buildLegalPage(legal, menuItems, config, template, 'free');
    const targetPath = path.join(PATHS.dist.free, 'legal', `${legal.slug}.html`);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }
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
  await cleanDir(PATHS.dist.premium);
  await ensureDir(PATHS.dist.premium);
  await copyStaticAssets(PATHS.dist.premium);
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

    const page = buildPremiumContentPage(item, menuItems, config, template, { prevUrl, nextUrl });
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
    return `/premium/appendix/${item.slug}/`;
  } else {
    return `/premium/course/${item.slug}/`;
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
function buildPremiumContentPage(item, menuItems, config, template, { prevUrl, nextUrl }) {
  return buildPremiumPage(item, menuItems, config, template, { prevUrl, nextUrl });
}

async function buildRecommendations() {
  const config = await loadSiteConfig();
  const content = await loadContent(config.build.wordsPerMinute);
  await ensureDir(PATHS.dist.shared);

  const recommendations = content.recommendations.map(rec => ({
    slug: rec.slug,
    title: rec.title,
    excerpt: rec.excerpt,
    readingTimeMinutes: rec.readingTimeMinutes
  }));

  await fsp.writeFile(
    path.join(PATHS.dist.shared, 'recommendations.json'),
    JSON.stringify(recommendations, null, 2),
    'utf8'
  );

  for (const legal of content.legal) {
    const html = renderMarkdown(legal.markdown);
    await ensureDir(path.join(PATHS.dist.shared, 'legal'));
    await fsp.writeFile(
      path.join(PATHS.dist.shared, 'legal', `${legal.slug}.html`),
      html,
      'utf8'
    );
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
      url: mode === 'premium' ? `/premium/course/${course.slug}/` : `/course/${course.slug}/`,
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
        url: `/premium/appendix/${appendix.slug}/`,
        order: appendix.order,
        readingTimeMinutes: appendix.readingTimeMinutes
      });
    }
  }

  // НЕ добавляем recommendations и legal в меню курса!
  // Они доступны только по прямым URL и через карусель рекомендаций

  return menu.sort((a, b) => a.order - b.order);
}

function buildIntroPage(item, menuItems, config, template, mode) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article>${item.fullHtml}</article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, mode)}
  `;

  return applyTemplate(template, {
    title: item.title,
    body
  });
}

function buildFreeCoursePage(item, menuItems, config, template) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article>
      ${item.introHtml}
      <div class="premium-teaser">
        <div class="premium-teaser__blurred" data-nosnippet><!--noindex-->${item.teaserHtml}<!--/noindex--></div>
        <div class="premium-teaser__overlay">
          <p class="teaser-text">Осталось ${formatReadingTime(item.readingTimeMinutes)}</p>
          <button class="cta-button">${config.ctaTexts.enterFull}</button>
        </div>
      </div>
    </article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, 'free')}
  `;

  return applyTemplate(template, {
    title: `${item.title} — free`,
    body
  });
}

function buildPremiumPage(item, menuItems, config, template, { prevUrl, nextUrl }) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article>${item.fullHtml}</article>
    <nav class="premium-nav">
      ${prevUrl ? `<a class="nav-prev" href="${prevUrl}">${config.ctaTexts.goToCourse}</a>` : ''}
      ${nextUrl ? `<a class="nav-next" href="${nextUrl}">${config.ctaTexts.next}</a>` : ''}
    </nav>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, 'premium')}
  `;

  return applyTemplate(template, {
    title: `${item.title} — premium`,
    body
  });
}

function buildRecommendationPage(item, menuItems, config, template, mode) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">${formatReadingTime(item.readingTimeMinutes)} чтения</p>
    </header>
    <article>${item.fullHtml}</article>
  </main>
  ${renderMenu(menuItems)}
  ${renderFooter(config, mode)}
  `;

  return applyTemplate(template, {
    title: `${item.title} — recommendations`,
    body
  });
}

function buildLegalPage(item, menuItems, config, template, mode) {
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
    title: `${item.title} — legal`,
    body
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

function applyTemplate(template, { title, body }) {
  return template
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<div id="article-content">[\s\S]*?<\/div>/, `<div id="article-content">${body}</div>`)
    .replace('{{title}}', title)
    .replace('{{body}}', body);
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
      const paragraphCount = hasIntroductionKeyword(h2Token.text)
        ? MAX_INTRO_PARAGRAPHS
        : MAX_INTRO_PARAGRAPHS;
      introEndIndex = collectParagraphs(tokens, h2Index + 1, paragraphCount);
    } else {
      introEndIndex = nextTokenIndex + 1; // Только H1 + HR
    }
  }
  // === Ветка C: после H1 сразу идет H2 ===
  else if (firstSignificantToken.type === 'heading' && firstSignificantToken.depth === 2) {
    const paragraphCount = hasIntroductionKeyword(firstSignificantToken.text)
      ? MAX_INTRO_PARAGRAPHS
      : MAX_INTRO_PARAGRAPHS;
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

async function copyStaticAssets(targetRoot) {
  await Promise.all([
    copyIfExists(PATHS.assets.assetsDir, path.join(targetRoot, 'assets')),
    copyIfExists(PATHS.assets.script, path.join(targetRoot, 'script.js')),
    copyIfExists(PATHS.assets.styles, path.join(targetRoot, 'styles.css')),
    copyIfExists(PATHS.assets.modeUtils, path.join(targetRoot, 'mode-utils.js'))
  ]);
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

module.exports = { build, extractLogicalIntro };
