/**
 * BUILD СКРИПТ: Генерация статичных HTML из Markdown
 *
 * Использование:
 *   node build.js
 *
 * Что делает:
 * 1. Читает все .md файлы из /source/articles/
 * 2. Парсит markdown → HTML
 * 3. Копирует изображения из /source/images/ → /public/images/
 * 4. Генерирует HTML страницы в /public/articles/
 * 5. Обновляет index.html с меню статей
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

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
    'lang', 'dir'
  ],
  ADD_ATTR: ['data-footnote-ref', 'data-footnote-backref']
};

const FALLBACK_SANITIZE_WARN = (
  '⚠️  DOMPurify недоступен, активирован запасной санитайзер без поддержки allowlist. '
  + 'Проверьте окружение сборки.'
);

let fallbackSanitizeNotified = false;

// Настраиваем DOMPurify один раз на основе JSDOM
let DOMPurify = null;

try {
  const { window } = new JSDOM('');
  DOMPurify = createDOMPurify(window);
} catch (error) {
  fallbackSanitizeNotified = true;
  console.warn(FALLBACK_SANITIZE_WARN);
  console.warn(error);
}

// Конфигурация путей
const PATHS = {
  source: {
    articles: './source/articles',
    images: './source/images',
    // config.json позволяет задать порядок статей, локализованные заголовки и связи «Далее»
    config: './source/config.json',
    template: './template.html'
  },
  public: {
    articles: './public/articles',
    images: './public/images',
    root: './public'
  }
};

/**
 * Главная функция сборки
 */
async function build() {
  console.log('🚀 Начинаем сборку...\n');

  // 1. Создать папки если их нет
  ensureDirectories();

  // 2. Копировать изображения
  copyImages();

  // 3. Загрузить конфиг
  const config = loadConfig();

  // 4. Сгенерировать HTML для каждой статьи
  const articles = await buildArticles(config);

  // 5. Обновить index.html с меню
  updateIndex(articles);

  console.log('\n✅ Сборка завершена!');
  console.log(`📦 Результат в папке: ${PATHS.public.root}`);
}

/**
 * Создать необходимые папки
 */
function ensureDirectories() {
  [
    PATHS.public.root,
    PATHS.public.articles,
    PATHS.public.images
  ].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Создана папка: ${dir}`);
    }
  });
}

/**
 * Копировать все изображения
 */
function copyImages() {
  console.log('🖼️  Копирование изображений...');

  if (!fs.existsSync(PATHS.source.images)) {
    console.log('⚠️  Папка с изображениями не найдена, пропускаем');
    return;
  }

  const images = fs.readdirSync(PATHS.source.images)
    .filter(file => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file));

  images.forEach(img => {
    const src = path.join(PATHS.source.images, img);
    const dest = path.join(PATHS.public.images, img);
    fs.copyFileSync(src, dest);
  });

  console.log(`   Скопировано изображений: ${images.length}`);
}

/**
 * Загрузить конфигурацию статей
 */
function loadConfig() {
  if (!fs.existsSync(PATHS.source.config)) {
    console.log('⚠️  config.json не найден, используем автоопределение статей');
    return autoDetectArticles();
  }

  try {
    const configData = fs.readFileSync(PATHS.source.config, 'utf8');
    const parsed = JSON.parse(configData);
    return normalizeConfig(parsed);
  } catch (error) {
    console.error('⚠️  Не удалось разобрать config.json, используется автоопределение статей.', error);
    return autoDetectArticles();
  }
}

function normalizeConfig(config) {
  if (!config || !Array.isArray(config.articles)) {
    console.warn('⚠️  config.json не содержит корректный массив статей, используется автоопределение.');
    return autoDetectArticles();
  }

  const articles = config.articles.map((article, index, list) => {
    const markdown = article.markdown || `${article.id}.md`;
    const derivedId = article.id || markdown.replace(/\.md$/i, '');
    const next = article.next ?? (index < list.length - 1 ? list[index + 1].id || list[index + 1].markdown.replace(/\.md$/i, '') : null);

    return {
      ...article,
      id: derivedId,
      title: article.title || derivedId.replace(/-/g, ' '),
      markdown,
      next
    };
  });

  return {
    ...config,
    articles
  };
}

/**
 * Автоматическое определение статей из папки
 */
function autoDetectArticles() {
  const files = fs.readdirSync(PATHS.source.articles)
    .filter(f => f.endsWith('.md'))
    .sort();

  return {
    articles: files.map((file, index) => ({
      id: file.replace('.md', ''),
      title: file.replace('.md', '').replace(/-/g, ' '),
      markdown: file,
      next: index < files.length - 1 ? files[index + 1].replace('.md', '') : null
    }))
  };
}

/**
 * Сгенерировать HTML для всех статей
 */
async function buildArticles(config) {
  console.log('\n📝 Генерация статей...');

  const articles = [];

  for (const article of config.articles) {
    console.log(`   Обработка: ${article.id}`);

    // Читаем markdown
    const mdPath = path.join(PATHS.source.articles, article.markdown);
    const markdown = fs.readFileSync(mdPath, 'utf8');

    // Парсим в HTML
    const content = parseMarkdown(markdown);

    // Генерируем заголовки для dots-rail
    const sections = extractSections(markdown);

    // Создаем полный HTML
    const html = generateArticleHTML({
      ...article,
      content,
      sections
    });

    // Сохраняем
    const outputPath = path.join(PATHS.public.articles, `${article.id}.html`);
    fs.writeFileSync(outputPath, html);

    articles.push({
      ...article,
      sections
    });
  }

  console.log(`   Создано страниц: ${articles.length}`);
  return articles;
}

/**
 * Парсинг markdown в HTML
 */
function parseMarkdown(markdown) {
  // Настройка renderer для изображений
  const renderer = new marked.Renderer();

  // Переопределяем рендеринг изображений
  renderer.image = (href, title, text) => {
    // Все изображения находятся в /images/
    let imagePath = href;

    // Если путь относительный, убираем ./
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

  // Настройка marked
  marked.setOptions({
    renderer,
    gfm: true,              // GitHub Flavored Markdown
    breaks: true,           // переносы строк
    headerIds: true,        // ID для заголовков
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
      console.warn('⚠️  DOMPurify не смог санитизировать HTML, используется запасной режим.', error);
    }
  } else if (!fallbackSanitizeNotified) {
    console.warn(FALLBACK_SANITIZE_WARN);
    fallbackSanitizeNotified = true;
  }

  return legacySanitize(html);
}

function legacySanitize(html) {
  if (typeof html !== 'string') {
    return '';
  }

  return html
    // Удаляем скрипты и опасные URI
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    // Удаляем инлайн-обработчики событий
    .replace(/on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Удаляем потенциальные SVG/MathML сценарии
    .replace(/<\/?(script|iframe|object|embed)[^>]*>/gi, '');
}

/**
 * Извлечь заголовки для навигации (dots-rail)
 */
function extractSections(markdown) {
  const sections = [];
  const headingRegex = /^##\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const title = match[1].trim();
    const id = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    sections.push({ id, title });
  }

  return sections;
}

/**
 * Сгенерировать полный HTML страницы
 */
function generateArticleHTML(article) {
  // Читаем шаблон
  let template;
  if (fs.existsSync(PATHS.source.template)) {
    template = fs.readFileSync(PATHS.source.template, 'utf8');
  } else {
    // Используем встроенный шаблон из текущего index.html
    template = fs.readFileSync('./index.html', 'utf8');
  }

  // Генерируем секции с ID для якорей
  const sectionsHTML = generateSectionsHTML(article.content, article.sections);

  // Заменяем плейсхолдеры
  let html = template
    .replace('{{TITLE}}', article.title)
    .replace('{{ARTICLE_ID}}', article.id)
    .replace('{{CONTENT}}', sectionsHTML)
    .replace('{{NEXT_ARTICLE}}', article.next || '');

  // Обновляем кнопку "Далее"
  if (article.next) {
    html = html.replace(
      '<button class="btn-next" type="button">Далее</button>',
      `<button class="btn-next" type="button" onclick="location.href='${article.next}.html'">Далее</button>`
    );
  } else {
    // Если это последняя статья, убираем кнопку
    html = html.replace(
      '<button class="btn-next" type="button">Далее</button>',
      ''
    );
  }

  return html;
}

/**
 * Обернуть контент в секции с ID
 */
function generateSectionsHTML(content, sections) {
  if (sections.length === 0) {
    return `<div class="text-section">${content}</div>`;
  }

  // Разбиваем по заголовкам H2
  const parts = content.split(/(<h2[^>]*>.*?<\/h2>)/);
  let result = '';
  let sectionIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith('<h2')) {
      // Начало новой секции
      if (sectionIndex > 0) {
        result += '</section>'; // закрываем предыдущую
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

  // Закрываем последнюю секцию
  if (sectionIndex > 0) {
    result += '</section>';
  }

  return result;
}

/**
 * Обновить index.html с меню статей
 */
function updateIndex(articles) {
  console.log('\n🏠 Обновление index.html...');

  const indexPath = path.join(PATHS.public.root, 'index.html');

  // Копируем текущий index.html как основу
  if (!fs.existsSync(indexPath)) {
    fs.copyFileSync('./index.html', indexPath);
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Генерируем меню
  const menuHTML = articles.map(a => `
    <li><a href="/articles/${a.id}.html">${a.title}</a></li>
  `).join('');

  // Заменяем меню
  html = html.replace(
    /<ul class="site-menu__list">[\s\S]*?<\/ul>/,
    `<ul class="site-menu__list">\n${menuHTML}\n        </ul>`
  );

  // Перенаправляем на первую статью
  if (articles.length > 0) {
    const firstArticle = articles[0];
    html = html.replace(
      '<body',
      `<body data-redirect="/articles/${firstArticle.id}.html"`
    );

    // Добавляем скрипт редиректа
    if (!html.includes('data-redirect')) {
      html = html.replace(
        '</body>',
        `
        <script>
          // Автоматический редирект на первую статью
          if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            window.location.href = '/articles/${firstArticle.id}.html';
          }
        </script>
        </body>
        `
      );
    }
  }

  fs.writeFileSync(indexPath, html);
  console.log('   index.html обновлен');
}

// Запуск сборки
build().catch(err => {
  console.error('❌ Ошибка сборки:', err);
  process.exit(1);
});
