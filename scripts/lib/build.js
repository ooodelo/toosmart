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

async function buildPremium() {
  const config = await loadSiteConfig();
  const content = await loadContent(config.build.wordsPerMinute);
  const template = await readTemplate('premium');
  await cleanDir(PATHS.dist.premium);
  await ensureDir(PATHS.dist.premium);
  await copyStaticAssets(PATHS.dist.premium);
  await copyServerFiles(PATHS.dist.premium);

  const menuItems = buildMenuItems(content, 'premium');
  const premiumOrder = [...content.course, ...content.appendix];

  for (let index = 0; index < premiumOrder.length; index++) {
    const item = premiumOrder[index];
    const prevUrl = premiumOrder[index - 1]
      ? premiumUrlFor(premiumOrder[index - 1])
      : null;
    const nextUrl = premiumOrder[index + 1]
      ? premiumUrlFor(premiumOrder[index + 1])
      : null;
    const page = buildPremiumPage(item, menuItems, config, template, { prevUrl, nextUrl });
    const targetPath = premiumUrlFor(item, PATHS.dist.premium);
    await ensureDir(path.dirname(targetPath));
    await fsp.writeFile(targetPath, page, 'utf8');
  }
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

function buildMenuItems(content, mode) {
  const menu = [];

  for (const intro of content.intro) {
    menu.push({
      type: 'intro',
      title: intro.title,
      url: mode === 'premium' ? '/premium/' : '/',
      order: intro.order,
      readingTimeMinutes: intro.readingTimeMinutes
    });
  }

  for (const course of content.course) {
    menu.push({
      type: 'course',
      title: course.title,
      url: mode === 'premium' ? `/premium/course/${course.slug}/` : `/course/${course.slug}/`,
      order: course.order,
      readingTimeMinutes: course.readingTimeMinutes
    });
  }

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

  if (mode === 'free') {
    for (const rec of content.recommendations) {
      menu.push({
        type: 'recommendations',
        title: rec.title,
        url: `/recommendations/${rec.slug}/`,
        order: rec.order,
        readingTimeMinutes: rec.readingTimeMinutes
      });
    }

    for (const legal of content.legal) {
      menu.push({
        type: 'legal',
        title: legal.title,
        url: `/legal/${legal.slug}/`,
        order: legal.order,
        readingTimeMinutes: legal.readingTimeMinutes
      });
    }
  }

  return menu.sort((a, b) => a.order - b.order);
}

function buildIntroPage(item, menuItems, config, template, mode) {
  const body = `
  <main>
    <header>
      <h1>${item.title}</h1>
      <p class="meta">~${item.readingTimeMinutes} мин чтения</p>
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
      <p class="meta">~${item.readingTimeMinutes} мин чтения</p>
    </header>
    <article>
      ${item.introHtml}
      <div class="premium-teaser">
        <div class="premium-teaser__blurred" data-nosnippet><!--noindex-->${item.teaserHtml}<!--/noindex--></div>
        <div class="premium-teaser__overlay">Осталось ~${item.readingTimeMinutes} минут · ${config.ctaTexts.enterFull}</div>
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
      <p class="meta">~${item.readingTimeMinutes} мин чтения</p>
    </header>
    <article>${item.fullHtml}</article>
    <nav class="premium-nav">
      ${prevUrl ? `<a class="nav-prev" href="${prevUrl}">Назад</a>` : ''}
      ${nextUrl ? `<a class="nav-next" href="${nextUrl}">Далее</a>` : ''}
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
      <p class="meta">~${item.readingTimeMinutes} мин просмотра</p>
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
    .map(item => `<li class="menu-item menu-item--${item.type}"><a href="${item.url}">${item.title}</a><span class="menu-item__time">${item.readingTimeMinutes} мин</span></li>`)
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

function extractLogicalIntro(markdown) {
  const tokens = marked.lexer(markdown, { mangle: false, headerIds: true });
  const h1Index = tokens.findIndex(token => token.type === 'heading' && token.depth === 1);
  if (h1Index === -1) {
    return { introMd: markdown, restMd: '' };
  }

  const afterH1 = tokens[h1Index + 1];
  const afterH1Second = tokens[h1Index + 2];

  let splitIndex = h1Index + 1;
  if (afterH1 && afterH1.type === 'paragraph') {
    splitIndex = h1Index + 2;
  } else if (afterH1 && afterH1.type === 'hr' && afterH1Second && afterH1Second.type === 'heading' && afterH1Second.depth === 2) {
    splitIndex = h1Index + 3;
  } else if (afterH1 && afterH1.type === 'heading' && afterH1.depth === 2) {
    splitIndex = h1Index + 2;
  }

  const introTokens = tokens.slice(0, splitIndex);
  const restTokens = tokens.slice(splitIndex);

  return {
    introMd: tokensToMarkdown(introTokens),
    restMd: tokensToMarkdown(restTokens)
  };
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

function parseFrontMatter(markdown) {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { data: {}, body: markdown };

  const [, yamlBlock, body] = fmMatch;
  const data = {};
  yamlBlock.split(/\n/).forEach(line => {
    const [key, ...rest] = line.split(':');
    if (!key) return;
    data[key.trim()] = rest.join(':').trim();
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

function premiumUrlFor(item, root = '') {
  const sub = item.branch === 'appendix' ? 'appendix' : 'course';
  const rel = path.join(sub, `${item.slug}.html`);
  return root ? path.join(root, rel) : `/premium/${rel}`;
}

module.exports = { build, extractLogicalIntro };
