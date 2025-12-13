#!/usr/bin/env node

/**
 * Сервер админ-панели для управления параметрами билда
 *
 * Запуск: node admin/server.js
 * или: npm run admin
 *
 * API:
 * - GET  /api/config - получить конфигурацию
 * - POST /api/config - сохранить конфигурацию
 * - POST /api/build  - запустить сборку
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { networkInterfaces } = require('os');
const fsp = fs.promises;
const { buildPaywallSegments, extractBlocks, extractBlocksWithMarkers } = require('../scripts/lib/paywall');

const PORT = process.env.PORT || 3001;
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'site.json');
const CONTENT_META_PATH = path.join(__dirname, '..', 'config', 'content-meta.json');
const IMAGES_META_PATH = path.join(__dirname, '..', 'config', 'images-meta.json');
const LEGAL_CONFIG_PATH = path.join(__dirname, '..', 'config', 'legal.json');
const ADMIN_DIR = __dirname;
const PROJECT_ROOT = path.join(__dirname, '..');
const PREVIEW_DEFAULT_PORT = process.env.BUILD_PREVIEW_PORT || process.env.PREVIEW_PORT || 4040;

function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
let previewProcess = null;

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`⚠️  Ошибка чтения ${filePath}:`, error.message);
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.warn(`⚠️  Ошибка записи ${filePath}:`, error.message);
    return false;
  }
}

const DEFAULT_SITE_CONFIG = {
  domain: 'example.com',
  pricing: {
    originalAmount: 4990,
    currentAmount: 2990,
    currency: 'RUB'
  },
  ctaTexts: {
    enterFull: 'Получить полный доступ',
    next: 'Следующий раздел',
    goToCourse: 'Вернуться к курсу',
    openCourse: 'Начать курс'
  },
  footer: {
    companyName: 'ООО \"Название компании\"',
    inn: '0000000000',
    year: new Date().getFullYear()
  },
  robokassa: {
    merchantLogin: '',
    password1: '',
    password2: '',
    isTest: true,
    invoicePrefix: 'SUU',
    description: 'Курс «Слишком умная уборка»',
    successUrl: '/success.php',
    failUrl: '/fail.php',
    resultUrl: '/robokassa-callback.php',
    culture: 'ru'
  },
  build: {
    wordsPerMinute: 150
  },
  features: {
    cookiesBannerEnabled: true
  },
  seo: {
    titleSuffix: '— Слишком умная уборка',
    globalMetaDescription: '',
    globalOgImage: '/assets/og-default.jpg'
  },
  manifest: {
    name: 'Слишком умная уборка',
    short_name: 'СУУ',
    theme_color: '#ffffff',
    background_color: '#ffffff',
    start_url: '/'
  },
  legal: {}
};

const DEFAULT_META = {
  seo_h1: '',
  title: '',
  meta_description: '',
  menu_label: '',
  menu_subtitle: '',
  slug: '',
  paywall: {
    openBlocks: 3,
    teaserBlocks: 2
  },
  carousel_label: '',
  carousel_subtitle: '',
  carousel_icon: '',
  carousel_order: null,
  carousel_enabled: true
};

// Разрешенные HTML-блоки для редактирования
const HTML_BLOCKS = {
  paymentModal: {
    label: 'Модальное окно оплаты',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'payment-modal.html')
  },
  legalModals: {
    label: 'Legal-модалки (terms/offer/privacy/contacts)',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'legal-modals.html')
  },
  loginModal: {
    label: 'Модалка логина / личный кабинет',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'login-modal.html')
  },
  cookieBanner: {
    label: 'Баннер cookies',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'cookie-banner.html')
  },
  modalFallbacks: {
    label: 'Скрипты фолбэков модалок/cookie',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'modal-fallbacks.html')
  },
  templateFull: {
    label: 'Базовый шаблон (free)',
    path: path.join(PROJECT_ROOT, 'src', 'template-full.html')
  },
  error404: {
    label: 'Страница 404 (404.html)',
    path: path.join(PROJECT_ROOT, 'public', '404.html')
  },
  error403: {
    label: 'Страница 403 (403.html)',
    path: path.join(PROJECT_ROOT, 'public', '403.html')
  },
  error500: {
    label: 'Страница 500 (500.html)',
    path: path.join(PROJECT_ROOT, 'public', '500.html')
  },
  error503: {
    label: 'Страница 503 (503.html)',
    path: path.join(PROJECT_ROOT, 'public', '503.html')
  }
};

// MIME types для статических файлов
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function walkFiles(dir, exts = null, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, acc);
    } else if (!exts || exts.has(path.extname(entry.name).toLowerCase())) {
      acc.push(full);
    }
  }
  return acc;
}

function parseMarkdownImages(md) {
  const results = [];
  const imageMd = /!\[[^\]]*\]\(([^)]+)\)/g;
  const imageHtml = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imageMd.exec(md)) !== null) {
    results.push(m[1]);
  }
  while ((m = imageHtml.exec(md)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function normalizeWebPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/');
}

function loadImagesMeta() {
  return readJsonSafe(IMAGES_META_PATH, {});
}

function saveImagesMeta(meta) {
  return writeJsonSafe(IMAGES_META_PATH, meta);
}

async function buildImagesIndex() {
  const meta = loadImagesMeta();
  const imagesMap = new Map();

  const addImage = (filePath, source) => {
    const rel = normalizeWebPath(path.relative(PROJECT_ROOT, filePath));
    const webPath = '/' + rel.replace(/^\/+/, '');
    const key = webPath;
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (!stat) return;
    const entry = imagesMap.get(key) || {
      id: key,
      path: key,
      filename: path.basename(filePath),
      size: stat.size,
      sources: new Set(),
      inUse: [],
      alt: meta[key]?.alt || '',
      description: meta[key]?.description || '',
      caption: meta[key]?.caption || ''
    };
    entry.sources.add(source);
    imagesMap.set(key, entry);
  };

  // Static dirs
  const staticDirs = [
    { dir: path.join(PROJECT_ROOT, 'content', 'images'), source: 'static' },
    { dir: path.join(PROJECT_ROOT, 'content', 'uploads'), source: 'upload' },
    { dir: path.join(PROJECT_ROOT, 'public', 'assets'), source: 'static' },
    { dir: path.join(PROJECT_ROOT, 'src', 'assets'), source: 'static' }
  ];
  for (const { dir, source } of staticDirs) {
    walkFiles(dir, IMAGE_EXTS).forEach(f => addImage(f, source));
  }

  // Markdown references
  const mdFiles = walkFiles(path.join(PROJECT_ROOT, 'content'), null).filter(f => f.endsWith('.md'));
  for (const mdPath of mdFiles) {
    const raw = fs.readFileSync(mdPath, 'utf8');
    const images = parseMarkdownImages(raw);
    images.forEach(imgPath => {
      const key = normalizeWebPath(imgPath.startsWith('/') ? imgPath : '/' + imgPath.replace(/^\.?\//, ''));
      const entry = imagesMap.get(key) || {
        id: key,
        path: key,
        filename: path.basename(key),
        size: null,
        sources: new Set(),
        inUse: [],
        alt: meta[key]?.alt || '',
        description: meta[key]?.description || '',
        caption: meta[key]?.caption || ''
      };
      entry.sources.add('markdown');
      entry.inUse.push({ file: normalizeWebPath(path.relative(PROJECT_ROOT, mdPath)), type: 'markdown' });
      imagesMap.set(key, entry);
    });
  }

  const list = Array.from(imagesMap.values()).map(item => ({
    ...item,
    sources: Array.from(item.sources),
    status: {
      missingAlt: !item.alt
    }
  }));

  return list.sort((a, b) => a.path.localeCompare(b.path));
}

// Создание HTTP сервера
const server = http.createServer(async (req, res) => {
  // CORS заголовки - только для localhost
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Preflight запрос
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url, `http://${host}`);
  const pathname = url.pathname;

  try {
    // API endpoints
    if (pathname === '/api/config') {
      if (req.method === 'GET') {
        await handleGetConfig(req, res);
      } else if (req.method === 'POST') {
        await handleSaveConfig(req, res);
      }
      return;
    }

    if (pathname === '/api/build' && req.method === 'POST') {
      await handleBuild(req, res);
      return;
    }

    if (pathname === '/api/preview' && req.method === 'POST') {
      await handlePreview(req, res);
      return;
    }

    if (pathname === '/api/files' && req.method === 'POST') {
      await handleFileUpload(req, res);
      return;
    }

    if (pathname === '/api/images' && req.method === 'GET') {
      await handleGetImages(req, res);
      return;
    }

    if (pathname.startsWith('/api/images/') && req.method === 'PATCH') {
      await handlePatchImage(req, res, pathname.replace('/api/images/', ''));
      return;
    }

    if (pathname === '/api/upload-image' && req.method === 'POST') {
      await handleUploadImage(req, res);
      return;
    }

    if (pathname === '/api/content') {
      if (req.method === 'GET') {
        await handleGetContent(req, res);
      } else if (req.method === 'POST') {
        await handleSaveContentMeta(req, res);
      }
      return;
    }

    if (pathname === '/api/legal') {
      if (req.method === 'GET') {
        await handleGetLegal(req, res);
      } else if (req.method === 'POST') {
        await handleSaveLegal(req, res);
      }
      return;
    }

    if (pathname === '/api/payment-modal') {
      if (req.method === 'GET') {
        await handleGetPaymentModal(req, res);
      } else if (req.method === 'POST') {
        await handleSavePaymentModal(req, res);
      }
      return;
    }

    if (pathname === '/api/html-block') {
      if (req.method === 'GET') {
        await handleGetHtmlBlock(req, res, url.searchParams.get('name'));
      } else if (req.method === 'POST') {
        await handleSaveHtmlBlock(req, res, url.searchParams.get('name'));
      }
      return;
    }

    if (pathname === '/api/html-blocks' && req.method === 'GET') {
      await handleListHtmlBlocks(req, res);
      return;
    }

    // Favicon API endpoints
    if (pathname === '/api/favicon') {
      if (req.method === 'GET') {
        await handleGetFavicon(req, res);
      } else if (req.method === 'POST') {
        await handleUploadFavicon(req, res);
      }
      return;
    }

    if (pathname === '/api/favicon/manifest' && req.method === 'POST') {
      await handleSaveFaviconManifest(req, res);
      return;
    }

    if (pathname === '/api/favicon/reset' && req.method === 'POST') {
      await handleResetFavicon(req, res);
      return;
    }

    if (pathname === '/api/promo' && req.method === 'GET') {
      await handleGetPromos(req, res);
      return;
    }

    if (pathname === '/api/promo' && req.method === 'POST') {
      await handleSavePromos(req, res);
      return;
    }

    if (pathname === '/api/upload-asset' && req.method === 'POST') {
      await handleUploadAsset(req, res);
      return;
    }

    // Статические файлы
    await serveStatic(req, res, pathname);

  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Получение конфигурации
async function handleGetConfig(req, res) {
  try {
    const config = loadSiteConfig();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Не удалось прочитать конфигурацию: ' + error.message }));
  }
}

// Сохранение конфигурации
async function handleSaveConfig(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const incoming = JSON.parse(body);
      const config = deepMerge(clone(DEFAULT_SITE_CONFIG), incoming);

      // Валидация
      const validation = validateConfig(config);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.error }));
        return;
      }

      saveSiteConfig(config);

      console.log(`[${new Date().toISOString()}] Конфигурация сохранена`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения: ' + error.message }));
    }
  });
}

// Валидация конфигурации
function validateConfig(config) {
  if (!config.pricing || typeof config.pricing.currentAmount !== 'number') {
    return { valid: false, error: 'Некорректная цена' };
  }

  if (config.pricing.currentAmount < 0 || config.pricing.originalAmount < 0) {
    return { valid: false, error: 'Цена не может быть отрицательной' };
  }

  if (!config.footer || !config.footer.companyName) {
    return { valid: false, error: 'Название компании обязательно' };
  }

  if (config.footer.inn && !/^\d{10,12}$/.test(config.footer.inn)) {
    return { valid: false, error: 'ИНН должен содержать 10-12 цифр' };
  }

  return { valid: true };
}

async function handleGetContent(req, res) {
  try {
    const items = collectContentItems();
    const stats = computeContentStats(items);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items, stats }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка получения контента: ' + error.message }));
  }
}

async function handleSaveContentMeta(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      const pathKey = payload.pathKey;
      const data = payload.data || {};
      if (!pathKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'pathKey обязателен' }));
        return;
      }

      const meta = loadContentMetaFile();
      const existing = meta[pathKey] || {};
      const paywall = data.paywall || existing.paywall || {};
      meta[pathKey] = {
        ...existing,
        slug: (data.slug || existing.slug || '').trim(),
        seo_h1: data.seo_h1 ?? existing.seo_h1 ?? '',
        title: data.title ?? existing.title ?? '',
        meta_description: data.meta_description ?? existing.meta_description ?? '',
        menu_label: data.menu_label ?? existing.menu_label ?? '',
        menu_subtitle: data.menu_subtitle ?? existing.menu_subtitle ?? '',
        paywall: {
          openBlocks: Number.isFinite(Number(paywall.openBlocks || data.openBlocks)) ? Number(paywall.openBlocks || data.openBlocks) : DEFAULT_META.paywall.openBlocks,
          teaserBlocks: Number.isFinite(Number(paywall.teaserBlocks || data.teaserBlocks)) ? Number(paywall.teaserBlocks || data.teaserBlocks) : DEFAULT_META.paywall.teaserBlocks
        },
        carousel_label: data.carousel_label ?? existing.carousel_label ?? '',
        carousel_subtitle: data.carousel_subtitle ?? existing.carousel_subtitle ?? '',
        carousel_icon: data.carousel_icon ?? existing.carousel_icon ?? '',
        carousel_order: Number.isFinite(data.carousel_order) ? Number(data.carousel_order) : Number.isFinite(existing.carousel_order) ? Number(existing.carousel_order) : null,
        carousel_enabled: data.carousel_enabled !== undefined ? Boolean(data.carousel_enabled) : (existing.carousel_enabled !== undefined ? existing.carousel_enabled : true)
      };

      saveContentMetaFile(meta);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения контента: ' + error.message }));
    }
  });
}

async function handleGetLegal(req, res) {
  try {
    const legal = loadLegalConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(legal));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения legal.json: ' + error.message }));
  }
}

async function handleSaveLegal(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      if (typeof payload !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Неверные данные legal' }));
        return;
      }
      saveLegalConfig(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения legal: ' + error.message }));
    }
  });
}

// Запуск сборки
async function handleBuild(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const { target } = JSON.parse(body);

      // Определение команды
      // Используем process.execPath для гарантии той же версии Node.js
      const nodeExec = process.execPath;
      const buildArg = target && target !== 'all' ? ` --target=${target}` : '';
      // Прогоняем Vite, чтобы шаблоны были актуальными, затем основной сборщик
      const command = `npm run build:assets && "${nodeExec}" scripts/build.js${buildArg}`;

      console.log(`[${new Date().toISOString()}] Запуск сборки: ${command}`);

      // Запуск сборки
      const output = execSync(command, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 120000, // Vite + билдер могут занимать больше времени
        stdio: ['pipe', 'pipe', 'pipe']
      });

      console.log(`[${new Date().toISOString()}] Сборка завершена успешно`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        output: output || 'Сборка завершена успешно'
      }));

    } catch (error) {
      console.error(`[${new Date().toISOString()}] Ошибка сборки:`, error.message);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        output: error.stdout || error.stderr || ''
      }));
    }
  });
}

function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// Поднимает локальный preview-сервер на dist
async function handlePreview(req, res) {
  try {
    // Останавливаем предыдущий, если есть
    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill('SIGTERM');
      previewProcess = null;
    }

    const lanIp = getLanIp();
    const host = '0.0.0.0';
    const port = PREVIEW_DEFAULT_PORT;
    const distPath = path.join(PROJECT_ROOT, 'dist');
    const liveServerScript = path.join(PROJECT_ROOT, 'node_modules', 'live-server', 'live-server.js');
    const args = [
      liveServerScript,
      distPath,
      `--host=${host}`,
      `--port=${port}`,
      '--no-browser',
      '--quiet'
    ];

    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        BUILD_PREVIEW_HOST: host,
        BUILD_PREVIEW_PORT: port
      },
      stdio: 'ignore'
    });

    child.on('error', (error) => {
      console.error('Preview start error:', error);
    });
    child.on('exit', () => {
      previewProcess = null;
    });

    previewProcess = child;

    const urlLan = `http://${lanIp}:${port}/`;
    const urlLocal = `http://localhost:${port}/`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      url: urlLan,
      urlLocal,
      message: `Превью поднято на ${urlLan} (LAN) / ${urlLocal} (localhost)`
    }));
  } catch (error) {
    console.error('Preview start error:', error.message);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

// Загрузка файлов
async function handleFileUpload(req, res) {
  const contentType = req.headers['content-type'] || '';

  // Определяем boundary для multipart/form-data
  if (!contentType.includes('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Требуется multipart/form-data' }));
    return;
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Не найден boundary в запросе' }));
    return;
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      const parts = parseMultipart(buffer, boundary);
      const uploadedFiles = [];

      for (const part of parts) {
        if (part.filename) {
          // Определяем директорию для загрузки
          const uploadDir = path.join(PROJECT_ROOT, 'content', 'uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          // Безопасное имя файла
          const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = path.join(uploadDir, safeName);

          fs.writeFileSync(filePath, part.data);
          uploadedFiles.push({
            name: safeName,
            path: `/content/uploads/${safeName}`,
            size: part.data.length
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        files: uploadedFiles,
        message: `Загружено файлов: ${uploadedFiles.length}`
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка загрузки: ' + error.message }));
    }
  });
}

async function handleGetImages(req, res) {
  try {
    const images = await buildImagesIndex();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(images));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handlePatchImage(req, res, id) {
  try {
    let body = '';
    req.on('data', chunk => body += chunk);
    await new Promise(resolve => req.on('end', resolve));
    const data = JSON.parse(body || '{}');
    const meta = loadImagesMeta();
    const key = id.startsWith('/') ? id : `/${id}`;
    meta[key] = {
      alt: data.alt || '',
      description: data.description || '',
      caption: data.caption || ''
    };
    saveImagesMeta(meta);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleUploadImage(req, res) {
  // Обёртка над upload-asset: сохраняем в content/uploads и возвращаем путь, регистрируем в meta
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No boundary' }));
    return;
  }

  // Простая разбивка multipart (для небольших файлов)
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const parts = buffer.toString('binary').split(`--${boundary}`);
      let fileName = null;
      let fileData = null;
      for (const part of parts) {
        if (part.includes('Content-Disposition') && part.includes('filename=')) {
          const matchName = part.match(/filename="([^"]+)"/);
          if (matchName) fileName = path.basename(matchName[1]);
          const idx = part.indexOf('\r\n\r\n');
          if (idx !== -1) {
            const bin = part.substring(idx + 4, part.lastIndexOf('\r\n'));
            fileData = Buffer.from(bin, 'binary');
            break;
          }
        }
      }
      if (!fileName || !fileData) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No file' }));
        return;
      }

      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uploadDir = path.join(PROJECT_ROOT, 'content', 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, safeName);
      fs.writeFileSync(filePath, fileData);

      const webPath = `/content/uploads/${safeName}`;
      const meta = loadImagesMeta();
      meta[webPath] = meta[webPath] || { alt: '', description: '', caption: '' };
      saveImagesMeta(meta);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: webPath }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// Парсер multipart/form-data
function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from('--' + boundary);
  const endBoundary = Buffer.from('--' + boundary + '--');

  let start = 0;
  let idx = buffer.indexOf(boundaryBuffer, start);

  while (idx !== -1) {
    const nextIdx = buffer.indexOf(boundaryBuffer, idx + boundaryBuffer.length);
    if (nextIdx === -1) break;

    const partBuffer = buffer.slice(idx + boundaryBuffer.length, nextIdx);
    const headerEnd = partBuffer.indexOf('\r\n\r\n');

    if (headerEnd !== -1) {
      const headers = partBuffer.slice(0, headerEnd).toString('utf8');
      const data = partBuffer.slice(headerEnd + 4, partBuffer.length - 2); // Remove trailing \r\n

      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const nameMatch = headers.match(/name="([^"]+)"/);

      parts.push({
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        data: data
      });
    }

    idx = nextIdx;
  }

  return parts;
}

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: markdown };
  }

  const frontMatter = match[1];
  const body = match[2];
  const data = {};

  frontMatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (!key || valueParts.length === 0) return;
    data[key.trim()] = stripQuotes(valueParts.join(':').trim());
  });

  return { data, body };
}

function normalizeFrontMatter(data) {
  const normalized = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    normalized[key] = typeof value === 'string' ? stripQuotes(value) : value;
  });
  return normalized;
}

function stripQuotes(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const single = trimmed.match(/^'(.*)'$/);
  const doubleQ = trimmed.match(/^"(.*)"$/);
  if (single) return single[1];
  if (doubleQ) return doubleQ[1];
  return trimmed;
}

const CYR_MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
};

function transliterate(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .split('')
    .map(ch => CYR_MAP[ch] || ch)
    .join('');
}

function slugifyStrict(text) {
  if (!text) return '';
  return transliterate(text)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureUniqueSlug(base, registry) {
  let slug = slugifyStrict(base);
  if (!slug) slug = 'page';
  let candidate = slug;
  let counter = 2;
  while (registry.has(candidate)) {
    candidate = `${slug}-${counter}`;
    counter += 1;
  }
  registry.add(candidate);
  return candidate;
}

function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

function extractAndStripH1(markdown) {
  if (!markdown) return { h1: '', body: '' };
  const lines = markdown.split('\n');
  let h1 = '';
  const rest = [];
  for (const line of lines) {
    if (!h1) {
      const match = line.match(/^#\s+(.*)$/);
      if (match) {
        h1 = match[1].trim();
        continue;
      }
    }
    rest.push(line);
  }
  return { h1, body: rest.join('\n').replace(/^\s+/, '') };
}

function resolveTypeByBranch(branch) {
  switch (branch) {
    case 'intro':
      return 'intro';
    case 'course':
      return 'article';
    case 'appendix':
      return 'appendix';
    case 'recommendations':
      return 'recommendation';
    case 'legal':
      return 'legal';
    default:
      return 'article';
  }
}

function hasExplicitPaywall(meta = {}) {
  const pw = meta.paywall || {};
  return pw.openBlocks !== undefined || pw.teaserBlocks !== undefined;
}

function normalizeMeta(meta) {
  const merged = {
    ...DEFAULT_META,
    ...meta,
    paywall: { ...DEFAULT_META.paywall, ...(meta?.paywall || {}) }
  };

  if (merged.paywall) {
    merged.paywall.openBlocks = Number.isFinite(merged.paywall.openBlocks) ? Number(merged.paywall.openBlocks) : DEFAULT_META.paywall.openBlocks;
    merged.paywall.teaserBlocks = Number.isFinite(merged.paywall.teaserBlocks) ? Number(merged.paywall.teaserBlocks) : DEFAULT_META.paywall.teaserBlocks;
  }

  if (merged.carousel_order != null) {
    const coerced = Number(merged.carousel_order);
    merged.carousel_order = Number.isFinite(coerced) ? coerced : null;
  }

  return merged;
}

function buildTitleFromSeo(base, suffix) {
  const safeBase = (base || '').trim();
  const safeSuffix = (suffix || '').trim();
  if (safeBase && safeSuffix) return `${safeBase} ${safeSuffix}`.trim();
  return safeBase || safeSuffix || '';
}

function loadSiteConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return deepMerge(clone(DEFAULT_SITE_CONFIG), parsed);
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения site.json:', error.message);
  }
  return clone(DEFAULT_SITE_CONFIG);
}

function saveSiteConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function loadContentMetaFile() {
  try {
    if (fs.existsSync(CONTENT_META_PATH)) {
      return JSON.parse(fs.readFileSync(CONTENT_META_PATH, 'utf8')) || {};
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения content-meta.json:', error.message);
  }
  return {};
}

function saveContentMetaFile(data) {
  fs.writeFileSync(CONTENT_META_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadLegalConfig() {
  try {
    if (fs.existsSync(LEGAL_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(LEGAL_CONFIG_PATH, 'utf8')) || {};
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения legal.json:', error.message);
  }
  return {};
}

function saveLegalConfig(data) {
  fs.writeFileSync(LEGAL_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function collectContentItems() {
  const branches = ['intro', 'course', 'appendix', 'recommendations', 'legal'];
  const meta = loadContentMetaFile();
  const registry = new Set();
  const items = [];

  branches.forEach(branch => {
    const dir = path.join(PROJECT_ROOT, 'content', branch);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();

    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const { body } = parseFrontMatter(raw);
      const { h1, body: bodyWithoutH1 } = extractAndStripH1(body);

      const pathKey = `${branch}/${file}`;
      const rawMetaEntry = meta[pathKey] || {};
      const metaEntry = normalizeMeta(rawMetaEntry);
      const type = metaEntry.type || resolveTypeByBranch(branch);
      const slugBase = metaEntry.slug || metaEntry.seo_h1 || h1 || stripExtension(file);
      const slug = type === 'intro' ? 'index' : ensureUniqueSlug(slugBase, registry);
      const seo_h1 = metaEntry.seo_h1 || h1 || '';
      const title = metaEntry.title || buildTitleFromSeo(seo_h1 || h1, DEFAULT_SITE_CONFIG.seo.titleSuffix);
      const meta_description = metaEntry.meta_description || '';
      const menu_label = (type === 'article' || type === 'appendix') ? (metaEntry.menu_label || h1 || '') : '';
      const menu_subtitle = (type === 'article' || type === 'appendix') ? (metaEntry.menu_subtitle || '') : '';
      const hasPaywallOverride = type === 'article' && hasExplicitPaywall(rawMetaEntry);
      const paywallOverride = hasPaywallOverride ? metaEntry.paywall : null;
      const paywallSegments = type === 'article' ? buildPaywallSegments(bodyWithoutH1, paywallOverride) : null;
      let paywall = null;
      const carousel = type === 'recommendation'
        ? {
          label: metaEntry.carousel_label || h1 || '',
          subtitle: metaEntry.carousel_subtitle || '',
          icon: metaEntry.carousel_icon || '',
          order: metaEntry.carousel_order,
          enabled: metaEntry.carousel_enabled !== false
        }
        : null;

      const filled = {
        slug: !!rawMetaEntry.slug,
        seo_h1: !!rawMetaEntry.seo_h1,
        title: !!rawMetaEntry.title,
        meta_description: !!rawMetaEntry.meta_description,
        menu_label: !!rawMetaEntry.menu_label,
        menu_subtitle: !!rawMetaEntry.menu_subtitle,
        paywall_open: type === 'article' && rawMetaEntry.paywall && rawMetaEntry.paywall.openBlocks !== undefined,
        paywall_teaser: type === 'article' && rawMetaEntry.paywall && rawMetaEntry.paywall.teaserBlocks !== undefined,
        carousel_label: !!rawMetaEntry.carousel_label,
        carousel_subtitle: !!rawMetaEntry.carousel_subtitle,
        carousel_icon: !!rawMetaEntry.carousel_icon,
        carousel_order: rawMetaEntry.carousel_order !== null && rawMetaEntry.carousel_order !== undefined
      };

      let paywallPreview = null;
      if (type === 'article') {
        const previewBlocks = extractBlocksWithMarkers(bodyWithoutH1);
        const countableBlocks = extractBlocks(bodyWithoutH1);
        const useBlocks = previewBlocks.blocks.map(b => b.html);
        const totalCount = countableBlocks.totalBlocks || useBlocks.length;
        const dividerPos = Math.max(0, useBlocks.findIndex(html => html.includes('article-divider')) + 1);
        const baseOpenFromSegments = Math.max(1, Math.min(paywallSegments?.openBlocks || 0, totalCount || 1));
        // If divider exists, always split exactly at divider (divider included in free zone)
        const defaultOpen = dividerPos ? dividerPos : baseOpenFromSegments;
        const openCount = hasPaywallOverride
          ? Math.max(1, Math.min(paywallOverride.openBlocks || 1, totalCount))
          : defaultOpen;

        const baseTeaserFromSegments = Math.max(0, paywallSegments?.teaserBlocks || 0);
        const teaserCount = hasPaywallOverride && paywallOverride.teaserBlocks !== undefined
          ? Math.max(0, Math.min(paywallOverride.teaserBlocks, Math.max(0, totalCount - openCount)))
          : Math.min(baseTeaserFromSegments, Math.max(0, totalCount - openCount));

        const hiddenStart = openCount + teaserCount;
        paywallPreview = {
          blocks: useBlocks,
          paragraphs: useBlocks,
          open: useBlocks.slice(0, openCount),
          teaser: useBlocks.slice(openCount, hiddenStart),
          hidden: useBlocks.slice(hiddenStart),
          totalBlocks: totalCount,
          openBlocks: openCount,
          teaserBlocks: teaserCount
        };

        paywall = {
          openBlocks: paywallPreview.openBlocks || openCount,
          teaserBlocks: paywallPreview.teaserBlocks || teaserCount
        };
      } else {
        paywall = null;
      }

      items.push({
        pathKey,
        branch,
        type,
        file,
        slug,
        h1_md: h1 || '',
        seo_h1,
        title,
        meta_description,
        menu_label,
        menu_subtitle,
        paywall,
        carousel,
        readingTimeMinutes: estimateReadingTime(bodyWithoutH1, loadSiteConfig().build.wordsPerMinute),
        filled,
        paywallPreview
      });
    });
  });

  return items.sort((a, b) => a.pathKey.localeCompare(b.pathKey));
}

function estimateReadingTime(text, wpm = 150) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / (wpm || 150)));
}

function computeContentStats(items) {
  const total = items.length;
  const filled = items.filter(item => item.slug && (item.title || item.seo_h1)).length;
  const attention = items.filter(item => item.type !== 'legal' && (!item.meta_description || !item.slug)).length;
  return { total, filled, attention };
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

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function sanitizeFilename(filename) {
  if (!filename) return '';
  let sanitized = filename.replace(/\s+/g, '_');
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
  sanitized = sanitized.replace(/_+/g, '_');
  return sanitized;
}
// Получение HTML модального окна оплаты
async function handleGetPaymentModal(req, res) {
  try {
    const modalPath = path.join(PROJECT_ROOT, 'src', 'partials', 'payment-modal.html');
    const content = fs.readFileSync(modalPath, 'utf8');

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения модального окна: ' + error.message }));
  }
}

// Сохранение HTML модального окна оплаты
async function handleSavePaymentModal(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const modalPath = path.join(PROJECT_ROOT, 'src', 'partials', 'payment-modal.html');
      const backupPath = modalPath + '.backup';

      // Создание бэкапа
      if (fs.existsSync(modalPath)) {
        fs.copyFileSync(modalPath, backupPath);
      }

      // Сохранение нового содержимого
      fs.writeFileSync(modalPath, body, 'utf8');

      console.log(`[${new Date().toISOString()}] Модальное окно оплаты обновлено`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения: ' + error.message }));
    }
  });
}

// Получение произвольного HTML-блока (из разрешенного списка)
async function handleGetHtmlBlock(req, res, name) {
  try {
    const block = HTML_BLOCKS[name];
    if (!block) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Неизвестный блок' }));
      return;
    }
    const content = fs.readFileSync(block.path, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения блока: ' + error.message }));
  }
}

// Сохранение произвольного HTML-блока (из разрешенного списка)
async function handleSaveHtmlBlock(req, res, name) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const block = HTML_BLOCKS[name];
      if (!block) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Неизвестный блок' }));
        return;
      }

      // Создание бэкапа
      const backupPath = block.path + '.' + new Date().toISOString().replace(/[:.]/g, '-') + '.backup';
      if (fs.existsSync(block.path)) {
        fs.copyFileSync(block.path, backupPath);
      }

      fs.writeFileSync(block.path, body, 'utf8');

      console.log(`[${new Date().toISOString()}] HTML блок "${name}" сохранен`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, backup: path.basename(backupPath) }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения блока: ' + error.message }));
    }
  });
}

async function handleListHtmlBlocks(req, res) {
  try {
    const blocks = Object.entries(HTML_BLOCKS).map(([key, value]) => ({
      name: key,
      label: value.label,
      path: value.path.replace(PROJECT_ROOT, '').replace(/^\/+/, '')
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(blocks));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка получения списка блоков: ' + error.message }));
  }
}

async function handleGetPromos(req, res) {
  try {
    const promos = loadPromoConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(promos));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения промокодов: ' + error.message }));
  }
}

async function handleSavePromos(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '[]');
      if (!Array.isArray(parsed)) throw new Error('Неверный формат данных');
      savePromoConfig(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения промокодов: ' + error.message }));
    }
  });
}

// SEO данные - путь к файлу хранения
const SEO_DATA_PATH = path.join(PROJECT_ROOT, 'config', 'seo-data.json');

// Получение всего контента для SEO панели
async function handleGetSeoContent(req, res) {
  try {
    const contentItems = [];

    // Сканируем папки контента
    const contentDirs = [
      { dir: 'course', type: 'course', label: 'Курс' },
      { dir: 'recommendations', type: 'recommendation', label: 'Рекомендации' },
      { dir: 'intro', type: 'course', label: 'Введение' },
      { dir: 'appendix', type: 'other', label: 'Приложение' },
      { dir: 'legal', type: 'other', label: 'Юридическое' }
    ];

    for (const { dir, type, label } of contentDirs) {
      const dirPath = path.join(PROJECT_ROOT, 'content', dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const content = fs.readFileSync(filePath, 'utf8');

          // Извлекаем заголовок из содержимого
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const h1 = titleMatch ? titleMatch[1].trim() : file.replace('.md', '');

          // Извлекаем frontmatter если есть
          const frontmatter = extractFrontmatter(content);

          contentItems.push({
            id: `${dir}/${file}`.replace(/[^a-zA-Z0-9]/g, '-'),
            path: `/content/${dir}/${file}`,
            type: type,
            category: label,
            filename: file,
            defaults: {
              title: frontmatter.title || `${h1} | Слишком Умная Уборка`,
              description: frontmatter.description || '',
              h1: h1,
              slug: `/${dir}/${file.replace('.md', '.html')}`,
              robots: 'index,follow',
              canonical: '',
              pageType: type,
              ogTitle: frontmatter.ogTitle || frontmatter.title || h1,
              ogDescription: frontmatter.ogDescription || frontmatter.description || '',
              ogImage: frontmatter.ogImage || '',
              twitterCard: 'summary_large_image',
              ogType: 'article',
              imageAlt: '',
              imageCaption: ''
            }
          });
        }
      }
    }

    // Сканируем изображения
    const imagesDir = path.join(PROJECT_ROOT, 'content', 'images');
    if (fs.existsSync(imagesDir)) {
      const scanImages = (dir, prefix = '') => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const itemPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            scanImages(itemPath, prefix + item.name + '/');
          } else if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(item.name)) {
            contentItems.push({
              id: `images-${prefix}${item.name}`.replace(/[^a-zA-Z0-9]/g, '-'),
              path: `/content/images/${prefix}${item.name}`,
              type: 'image',
              category: 'Изображение',
              filename: item.name,
              defaults: {
                title: '',
                description: '',
                h1: '',
                slug: `/content/images/${prefix}${item.name}`,
                robots: 'noindex,follow',
                canonical: '',
                pageType: 'image',
                ogTitle: '',
                ogDescription: '',
                ogImage: `/content/images/${prefix}${item.name}`,
                twitterCard: '',
                ogType: '',
                imageAlt: '',
                imageCaption: ''
              }
            });
          }
        }
      };
      scanImages(imagesDir);
    }

    // Загружаем сохраненные SEO данные
    let savedData = {};
    if (fs.existsSync(SEO_DATA_PATH)) {
      savedData = JSON.parse(fs.readFileSync(SEO_DATA_PATH, 'utf8'));
    }

    // Определяем статус для каждого элемента
    contentItems.forEach(item => {
      const saved = savedData[item.id];
      if (saved) {
        item.savedData = saved.values;
        item.complete = saved.complete;
      }

      // Определяем статус
      const data = item.savedData || item.defaults;
      if (item.type === 'image') {
        item.status = data.imageAlt ? 'complete' : 'missing-required';
      } else {
        if (!data.title || !data.description) {
          item.status = 'missing-required';
        } else if (!data.ogTitle || !data.ogImage) {
          item.status = 'missing-og';
        } else {
          item.status = 'complete';
        }
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(contentItems));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка сканирования контента: ' + error.message }));
  }
}

// Извлечение frontmatter из markdown
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      // Убираем кавычки
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }
  return frontmatter;
}

// Сохранение SEO данных
async function handleSaveSeoData(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const data = JSON.parse(body);

      // Загружаем существующие данные
      let existingData = {};
      if (fs.existsSync(SEO_DATA_PATH)) {
        existingData = JSON.parse(fs.readFileSync(SEO_DATA_PATH, 'utf8'));
      }

      // Обновляем данные
      if (data.id) {
        existingData[data.id] = {
          values: data.values,
          complete: data.complete,
          updatedAt: new Date().toISOString()
        };
      } else if (data.bulk) {
        // Массовое сохранение
        for (const [id, itemData] of Object.entries(data.bulk)) {
          existingData[id] = {
            values: itemData.values,
            complete: itemData.complete,
            updatedAt: new Date().toISOString()
          };
        }
      }

      // Создаем бэкап
      if (fs.existsSync(SEO_DATA_PATH)) {
        fs.copyFileSync(SEO_DATA_PATH, SEO_DATA_PATH + '.backup');
      }

      // Сохраняем
      fs.writeFileSync(SEO_DATA_PATH, JSON.stringify(existingData, null, 2), 'utf8');

      console.log(`[${new Date().toISOString()}] SEO данные сохранены`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения: ' + error.message }));
    }
  });
}

// Загрузка сохраненных SEO данных
async function handleLoadSeoData(req, res) {
  try {
    let data = {};
    if (fs.existsSync(SEO_DATA_PATH)) {
      data = JSON.parse(fs.readFileSync(SEO_DATA_PATH, 'utf8'));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка загрузки: ' + error.message }));
  }
}

// Favicon paths
const FAVICON_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'favicon.json');
const FAVICON_DIR = path.join(ADMIN_DIR, 'assets');
const DEFAULT_FAVICON = 'favicon.svg';
const REQUIRED_FAVICON_FILES = [
  'favicon.svg',
  'favicon-dark.svg',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'web-app-manifest-192x192.png',
  'web-app-manifest-512x512.png'
];
const ASSET_UPLOAD_DIR = path.join(PROJECT_ROOT, 'dist', 'assets', 'uploaded');
const PROMO_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'promo.json');
async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function handleUploadAsset(req, res) {
  const contentType = req.headers['content-type'] || '';

  if (!contentType.includes('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Требуется multipart/form-data' }));
    return;
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Не найден boundary' }));
    return;
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const parts = parseMultipart(buffer, boundary);
      const uploaded = [];

      await ensureDir(ASSET_UPLOAD_DIR);

      for (const part of parts) {
        if (!part.filename) continue;
        const safeName = sanitizeFilename(part.filename);
        const targetPath = path.join(ASSET_UPLOAD_DIR, safeName);
        await fsp.writeFile(targetPath, part.data);
        uploaded.push({
          name: safeName,
          url: `/assets/uploaded/${safeName}`
        });
      }

      if (!uploaded.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Файлы не распознаны' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(uploaded[0]));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка загрузки файла: ' + error.message }));
    }
  });
}

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

function loadFaviconConfig() {
  try {
    if (fs.existsSync(FAVICON_CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(FAVICON_CONFIG_PATH, 'utf8'));
      const manifest = Object.assign({}, DEFAULT_MANIFEST, parsed.manifest || {});
      return {
        filename: parsed.filename || parsed.primary || DEFAULT_FAVICON,
        files: parsed.files || {},
        originalNames: parsed.originalNames || {},
        manifest
      };
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения favicon.json:', error.message);
  }
  return {
    filename: DEFAULT_FAVICON,
    files: {},
    originalNames: {},
    manifest: { ...DEFAULT_MANIFEST }
  };
}

function saveFaviconConfig(config) {
  const normalized = {
    filename: config.filename || DEFAULT_FAVICON,
    files: config.files || {},
    originalNames: config.originalNames || {},
    manifest: Object.assign({}, DEFAULT_MANIFEST, config.manifest || {}),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(FAVICON_CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
}

function normalizeFaviconTarget(originalName) {
  const lower = (originalName || '').toLowerCase();
  if (lower.includes('web-app-manifest-192')) return 'web-app-manifest-192x192.png';
  if (lower.includes('web-app-manifest-512')) return 'web-app-manifest-512x512.png';
  if (lower.includes('dark')) return 'favicon-dark.svg';
  if (lower.includes('apple-touch')) return 'apple-touch-icon.png';
  if (lower.includes('512')) return 'android-chrome-512x512.png';
  if (lower.includes('192')) return 'android-chrome-192x192.png';
  if (lower.includes('32')) return 'favicon-32x32.png';
  if (lower.includes('16')) return 'favicon-16x16.png';
  if (lower.endsWith('.ico')) return 'favicon.ico';
  if (lower.endsWith('.svg')) return 'favicon.svg';
  if (lower.includes('favicon')) return 'favicon-32x32.png';
  return null;
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFaviconFile(targetName, buffer) {
  ensureDirSync(FAVICON_DIR);
  ensureDirSync(path.join(PROJECT_ROOT, 'src', 'assets'));
  fs.writeFileSync(path.join(FAVICON_DIR, targetName), buffer);
  fs.writeFileSync(path.join(PROJECT_ROOT, 'src', 'assets', targetName), buffer);
}

function loadPromoConfig() {
  try {
    if (fs.existsSync(PROMO_CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(PROMO_CONFIG_PATH, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения promo.json:', error.message);
  }
  return [];
}

function savePromoConfig(promos) {
  const safeArray = Array.isArray(promos) ? promos : [];
  fs.writeFileSync(PROMO_CONFIG_PATH, JSON.stringify(safeArray, null, 2), 'utf8');
}

function collectFaviconStatus() {
  const config = loadFaviconConfig();
  const files = {};
  const existingSet = new Set();

  for (const name of REQUIRED_FAVICON_FILES) {
    const exists = fs.existsSync(path.join(PROJECT_ROOT, 'src', 'assets', name)) ||
      fs.existsSync(path.join(FAVICON_DIR, name));
    if (exists) existingSet.add(name);
    files[name] = {
      exists,
      path: `/assets/${name}`,
      originalName: config.originalNames?.[name] || name
    };
  }

  if (config.filename && !files[config.filename]) {
    const exists = fs.existsSync(path.join(PROJECT_ROOT, 'src', 'assets', config.filename)) ||
      fs.existsSync(path.join(FAVICON_DIR, config.filename));
    if (exists) existingSet.add(config.filename);
    files[config.filename] = {
      exists,
      path: `/assets/${config.filename}`,
      originalName: config.originalNames?.[config.filename] || config.filename
    };
  }

  const manifestIcons = (config.manifest?.icons && Array.isArray(config.manifest.icons))
    ? config.manifest.icons
    : DEFAULT_MANIFEST.icons;

  const filteredIcons = manifestIcons
    .filter(icon => icon && icon.src)
    .map(icon => {
      const cleanSrc = icon.src.replace(/^\/+/, '');
      const filename = cleanSrc.replace(/^assets\//, '');
      const exists = existingSet.has(filename);
      return {
        src: icon.src.startsWith('/') ? icon.src : `/${icon.src}`,
        sizes: icon.sizes,
        type: icon.type,
        exists
      };
    })
    .filter(icon => icon.exists);

  const manifest = Object.assign({}, DEFAULT_MANIFEST, config.manifest || {});
  manifest.icons = filteredIcons.length > 0 ? filteredIcons : DEFAULT_MANIFEST.icons;

  const primary = config.filename || DEFAULT_FAVICON;
  const primaryPath = `/assets/${primary}`;
  const htmlSnippet = buildFaviconHtmlSnippet({
    primary,
    manifest,
    files
  });

  return {
    filename: primary,
    path: primaryPath,
    isDefault: primary === DEFAULT_FAVICON,
    files,
    manifest,
    htmlSnippet
  };
}

function buildFaviconHtmlSnippet({ primary, manifest, files }) {
  const lines = [];
  const ext = path.extname(primary).toLowerCase();
  const type = ext === '.svg' ? 'image/svg+xml' : ext === '.ico' ? 'image/x-icon' : 'image/png';

  lines.push(`<link rel="icon" type="${type}" href="/assets/${primary}">`);

  if (files?.['favicon-32x32.png']?.exists) {
    lines.push('<link rel="alternate icon" href="/assets/favicon-32x32.png" sizes="32x32">');
  }
  if (files?.['favicon-16x16.png']?.exists) {
    lines.push('<link rel="alternate icon" href="/assets/favicon-16x16.png" sizes="16x16">');
  }
  if (files?.['apple-touch-icon.png']?.exists) {
    lines.push('<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">');
  }

  if (manifest) {
    lines.push('<link rel="manifest" href="/assets/site.webmanifest">');
    if (manifest.theme_color) {
      lines.push(`<meta name="theme-color" content="${manifest.theme_color}">`);
    }
  }

  return lines.join('\n');
}

// Получение информации о текущем favicon
async function handleGetFavicon(req, res) {
  try {
    const status = collectFaviconStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка: ' + error.message }));
  }
}

// Загрузка нового favicon набора
async function handleUploadFavicon(req, res) {
  const contentType = req.headers['content-type'] || '';

  if (!contentType.includes('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Требуется multipart/form-data' }));
    return;
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Не найден boundary' }));
    return;
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      const parts = parseMultipart(buffer, boundary);
      const uploaded = [];
      const originalNames = {};
      const config = loadFaviconConfig();

      for (const part of parts) {
        if (!part.filename) continue;
        const target = normalizeFaviconTarget(part.filename);
        if (!target) continue;

        const ext = path.extname(target).toLowerCase();
        if (!['.svg', '.png', '.ico'].includes(ext)) {
          continue;
        }

        copyFaviconFile(target, part.data);
        uploaded.push(target);
        originalNames[target] = part.filename;
      }

      if (uploaded.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Файлы favicon не распознаны. Используйте стандартные имена (favicon.svg, favicon.ico, favicon-32x32.png, favicon-16x16.png, apple-touch-icon.png, android-chrome-192x192.png, android-chrome-512x512.png)' }));
        return;
      }

      // Обновляем конфиг
      config.files = Object.assign({}, config.files, uploaded.reduce((acc, name) => {
        acc[name] = name;
        return acc;
      }, {}));
      config.originalNames = Object.assign({}, config.originalNames, originalNames);

      if (uploaded.includes('favicon.svg')) {
        config.filename = 'favicon.svg';
      } else if (uploaded.includes('favicon.ico')) {
        config.filename = 'favicon.ico';
      }

      // Гарантируем наличие дефолтного манифеста
      config.manifest = Object.assign({}, DEFAULT_MANIFEST, config.manifest || {});
      saveFaviconConfig(config);

      console.log(`[${new Date().toISOString()}] Favicon файлы загружены: ${uploaded.join(', ')}`);

      const status = collectFaviconStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        uploaded,
        status
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка загрузки: ' + error.message }));
    }
  });
}

// Сохранение манифеста (name, theme_color и т.п.)
async function handleSaveFaviconManifest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      const manifest = payload.manifest || payload;
      const config = loadFaviconConfig();

      config.manifest = Object.assign({}, DEFAULT_MANIFEST, config.manifest || {}, {
        name: manifest.name || config.manifest.name,
        short_name: manifest.short_name || manifest.shortName || config.manifest.short_name,
        start_url: manifest.start_url || manifest.startUrl || config.manifest.start_url,
        display: manifest.display || config.manifest.display,
        background_color: manifest.background_color || manifest.backgroundColor || config.manifest.background_color,
        theme_color: manifest.theme_color || manifest.themeColor || config.manifest.theme_color
      });

      saveFaviconConfig(config);
      const status = collectFaviconStatus();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, status }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения манифеста: ' + error.message }));
    }
  });
}

// Сброс favicon на стандартный
async function handleResetFavicon(req, res) {
  try {
    // Удаляем конфиг
    if (fs.existsSync(FAVICON_CONFIG_PATH)) {
      fs.unlinkSync(FAVICON_CONFIG_PATH);
    }

    // Удаляем кастомные favicon файлы
    const customFiles = new Set([
      ...REQUIRED_FAVICON_FILES,
      'custom-favicon.svg',
      'custom-favicon.png',
      'custom-favicon.ico',
      'site.webmanifest'
    ]);

    for (const file of customFiles) {
      const adminPath = path.join(FAVICON_DIR, file);
      const srcPath = path.join(PROJECT_ROOT, 'src', 'assets', file);
      if (fs.existsSync(adminPath)) fs.unlinkSync(adminPath);
      if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
    }

    console.log(`[${new Date().toISOString()}] Favicon сброшен на стандартный`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка сброса: ' + error.message }));
  }
}

// Обслуживание статических файлов
async function serveStatic(req, res, pathname) {
  // По умолчанию index.html
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  // Отдаём загруженные ассеты из dist
  if (pathname.startsWith('/assets/uploaded')) {
    const safePath = pathname.replace(/^\/+/, '');
    const uploadPath = path.join(PROJECT_ROOT, 'dist', safePath);
    const distRoot = path.join(PROJECT_ROOT, 'dist');
    if (uploadPath.startsWith(distRoot)) {
      return streamStatic(uploadPath, res);
    }
  }

  // Отдаём ассеты из src/assets (favicon и прочее)
  if (pathname.startsWith('/assets/')) {
    const safePath = pathname.replace(/^\/+/, '');
    const assetPath = path.join(PROJECT_ROOT, 'src', 'assets', safePath.replace(/^assets[\\/]/, ''));
    const assetsRoot = path.join(PROJECT_ROOT, 'src', 'assets');
    if (assetPath.startsWith(assetsRoot)) {
      return streamStatic(assetPath, res);
    }
  }

  const filePath = path.join(ADMIN_DIR, pathname);

  // Проверка безопасности пути
  if (!filePath.startsWith(ADMIN_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  streamStatic(filePath, res);
}

function streamStatic(filePath, res) {
  try {
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// Запуск сервера с автоматическим подбором свободного порта
function startServer(port, attempt = 0) {
  const maxAttempts = 10;

  const onError = (err) => {
    if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
      const nextPort = Number(port) + 1;
      console.warn(`Порт ${port} занят, пробуем ${nextPort}...`);
      server.removeListener('error', onError);
      server.removeAllListeners('listening');
      startServer(nextPort, attempt + 1);
    } else {
      console.error('Не удалось запустить сервер админки:', err.message);
      process.exit(1);
    }
  };

  server.removeAllListeners('listening');
  server.once('error', onError);
  server.once('listening', () => {
    const lan = getLanIp();
    const portUsed = server.address().port;
    console.log('═'.repeat(50));
    console.log('  🚀 Админ-панель запущена');
    console.log('═'.repeat(50));
    console.log(`  Local:   http://localhost:${portUsed}`);
    console.log(`  Network: http://${lan}:${portUsed}`);
    console.log(`  Конфиг: ${CONFIG_PATH}`);
    console.log('═'.repeat(50));
    console.log('  Для остановки нажмите Ctrl+C');
    console.log('═'.repeat(50));
    console.log('');
  });

  server.listen(port);
}

startServer(PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n📭 Сервер остановлен');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n📭 Сервер остановлен');
  process.exit(0);
});
