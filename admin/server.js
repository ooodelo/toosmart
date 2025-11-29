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
const { buildPaywallSegments, extractBlocks } = require('../scripts/lib/paywall');

const PORT = process.env.PORT || 3001;
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'site.json');
const PAYWALL_CONFIG_PATH = path.join(__dirname, '..', 'config', 'paywall.json');
const ADMIN_DIR = __dirname;
const PROJECT_ROOT = path.join(__dirname, '..');
const PREVIEW_DEFAULT_PORT = process.env.BUILD_PREVIEW_PORT || process.env.PREVIEW_PORT || 4040;
let previewProcess = null;

// Разрешенные HTML-блоки для редактирования
const HTML_BLOCKS = {
  paymentModal: {
    label: 'Модальное окно оплаты',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'payment-modal.html')
  },
  modals: {
    label: 'Все модалки и cookie',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'modals.html')
  },
  cookieBanner: {
    label: 'Баннер cookies',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'modals.html')
  },
  loginModal: {
    label: 'Модалка логина / личный кабинет',
    path: path.join(PROJECT_ROOT, 'src', 'partials', 'modals.html')
  },
  templateFull: {
    label: 'Базовый шаблон (free)',
    path: path.join(PROJECT_ROOT, 'src', 'template-full.html')
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

// Создание HTTP сервера
const server = http.createServer(async (req, res) => {
  // CORS заголовки - только для localhost
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

    if (pathname === '/api/sections' && req.method === 'GET') {
      await handleGetSections(req, res);
      return;
    }

    if (pathname === '/api/section-content' && req.method === 'GET') {
      await handleGetSectionContent(req, res, url.searchParams.get('branch'), url.searchParams.get('file'));
      return;
    }

    if (pathname === '/api/paywall') {
      if (req.method === 'GET') {
        await handleGetPaywallConfig(req, res);
      } else if (req.method === 'POST') {
        await handleSavePaywall(req, res);
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

    // SEO API endpoints
    if (pathname === '/api/seo/content' && req.method === 'GET') {
      await handleGetSeoContent(req, res);
      return;
    }

    if (pathname === '/api/seo/save' && req.method === 'POST') {
      await handleSaveSeoData(req, res);
      return;
    }

    if (pathname === '/api/seo/load' && req.method === 'GET') {
      await handleLoadSeoData(req, res);
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
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);

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
      const config = JSON.parse(body);

      // Валидация
      const validation = validateConfig(config);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.error }));
        return;
      }

      // Создание бэкапа
      const backupPath = CONFIG_PATH + '.backup';
      if (fs.existsSync(CONFIG_PATH)) {
        fs.copyFileSync(CONFIG_PATH, backupPath);
      }

      // Сохранение
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');

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

  if (config.recommendationCards && !Array.isArray(config.recommendationCards)) {
    return { valid: false, error: 'recommendationCards должен быть массивом' };
  }

  if (Array.isArray(config.recommendationCards)) {
    const invalid = config.recommendationCards.find(card => !card || typeof card.slug !== 'string');
    if (invalid) {
      return { valid: false, error: 'У каждой карточки рекомендаций должен быть slug' };
    }
  }

  return { valid: true };
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

    const url = `http://${getLanIp()}:${port}/`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      url,
      message: `Превью поднято на ${url} (корень dist)`
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

function buildRecommendationMeta(filePath) {
  const file = path.basename(filePath);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const cleanedFrontMatter = normalizeFrontMatter(data);
    const slug = cleanedFrontMatter.slug || slugify(file.replace(/^(\d+[-_]?)/, '').replace(/\.md$/, ''));
    const titleFromFile = cleanedFrontMatter.title || extractH1(body) || slug;
    const descriptionFromFile = cleanedFrontMatter.excerpt || cleanedFrontMatter.teaser || buildTeaserFromMarkdown(body);
    const coverFromFile = cleanedFrontMatter.image || cleanedFrontMatter.cover || '';

    return {
      file,
      slug,
      titleFromFile,
      descriptionFromFile,
      coverFromFile
    };
  } catch (error) {
    return {
      file,
      slug: slugify(file.replace(/\.md$/, '')),
      titleFromFile: '',
      descriptionFromFile: '',
      coverFromFile: '',
      error: error.message
    };
  }
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

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

function extractH1(markdown) {
  const match = markdown.match(/^#\s+(.*)$/m);
  return match ? match[1] : null;
}

function buildTeaserFromMarkdown(markdown) {
  const withoutHeadings = markdown.replace(/^#\s+.*$/m, '').trim();
  const paragraphs = withoutHeadings.split(/\n{2,}/).map(p => p.replace(/^##?\s+/g, '').trim()).filter(Boolean);
  const teaser = paragraphs.slice(0, 2).join(' ');
  return teaser;
}

// Получение списка разделов
async function handleGetSections(req, res) {
  try {
    const courseDir = path.join(PROJECT_ROOT, 'content', 'course');
    const recsDir = path.join(PROJECT_ROOT, 'content', 'recommendations');
    const introDir = path.join(PROJECT_ROOT, 'content', 'intro');
    const appendixDir = path.join(PROJECT_ROOT, 'content', 'appendix');

    const courseSections = fs.readdirSync(courseDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    const introSections = fs.existsSync(introDir)
      ? fs.readdirSync(introDir).filter(f => f.endsWith('.md')).sort()
      : [];

    const appendixSections = fs.existsSync(appendixDir)
      ? fs.readdirSync(appendixDir).filter(f => f.endsWith('.md')).sort()
      : [];

    const recommendations = fs.existsSync(recsDir)
      ? fs.readdirSync(recsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(file => buildRecommendationMeta(path.join(recsDir, file)))
      : [];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      intro: introSections,
      course: courseSections,
      appendix: appendixSections,
      recommendations: recommendations
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения разделов: ' + error.message }));
  }
}

function loadPaywallConfig() {
  try {
    if (fs.existsSync(PAYWALL_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(PAYWALL_CONFIG_PATH, 'utf8')) || {};
    }
  } catch (error) {
    console.warn('⚠️  Ошибка чтения paywall.json:', error.message);
  }
  return {};
}

function savePaywallConfig(config) {
  fs.writeFileSync(PAYWALL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function getPaywallEntry(config, branch, slug) {
  if (!config) return null;
  const key = `${branch}/${slug}`;
  const entry = config[key] || (config.entries && config.entries[key]);
  if (!entry || typeof entry !== 'object') return null;

  const normalized = {};
  if (Number.isFinite(entry.openBlocks)) normalized.openBlocks = Number(entry.openBlocks);
  if (Number.isFinite(entry.teaserBlocks)) normalized.teaserBlocks = Number(entry.teaserBlocks);
  return Object.keys(normalized).length ? normalized : null;
}

async function handleGetPaywallConfig(req, res) {
  try {
    const config = loadPaywallConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения paywall: ' + error.message }));
  }
}

async function handleGetSectionContent(req, res, branch, file) {
  try {
    if (!branch || !file) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Не указан branch или file' }));
      return;
    }

    const dir = path.resolve(PROJECT_ROOT, 'content', branch);
    const fullPath = path.resolve(dir, file);
    if (!fullPath.startsWith(dir)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Некорректный путь файла' }));
      return;
    }
    if (!fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Файл не найден' }));
      return;
    }

    const raw = fs.readFileSync(fullPath, 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const slug = data.slug || slugify(file.replace(/^(\d+[-_]?)/, '').replace(/\.md$/, ''));
    const title = data.title || extractH1(body) || slug;

    const paywallConfig = loadPaywallConfig();
    const paywallEntry = getPaywallEntry(paywallConfig, branch, slug);
    const paywallSegments = buildPaywallSegments(body, paywallEntry);
    const blocksInfo = extractBlocks(body);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      branch,
      file,
      slug,
      title,
      paywall: {
        openBlocks: paywallSegments.openBlocks,
        teaserBlocks: paywallSegments.teaserBlocks,
        totalBlocks: paywallSegments.totalBlocks
      },
      blocks: blocksInfo.blocks,
      totalBlocks: blocksInfo.totalBlocks,
      openHtml: paywallSegments.openHtml,
      teaserHtml: paywallSegments.teaserHtml
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения раздела: ' + error.message }));
  }
}

async function handleSavePaywall(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      const branch = payload.branch;
      const file = payload.file;
      const slugFromPayload = payload.slug;
      const openBlocks = Number(payload.openBlocks);
      const teaserBlocks = Number(payload.teaserBlocks ?? 3);

      if (!branch || (!file && !slugFromPayload) || !Number.isFinite(openBlocks)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Неверные данные paywall' }));
        return;
      }

      const slug = slugFromPayload || slugify(String(file).replace(/^(\d+[-_]?)/, '').replace(/\.md$/, ''));
      const config = loadPaywallConfig();
      const key = `${branch}/${slug}`;
      config[key] = {
        openBlocks,
        teaserBlocks: Number.isFinite(teaserBlocks) ? teaserBlocks : 3,
        updatedAt: new Date().toISOString()
      };

      savePaywallConfig(config);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, key }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ошибка сохранения paywall: ' + error.message }));
    }
  });
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

  const filePath = path.join(ADMIN_DIR, pathname);

  // Проверка безопасности пути
  if (!filePath.startsWith(ADMIN_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

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

// Запуск сервера
server.listen(PORT, () => {
  console.log('═'.repeat(50));
  console.log('  🚀 Админ-панель запущена');
  console.log('═'.repeat(50));
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Конфиг: ${CONFIG_PATH}`);
  console.log('═'.repeat(50));
  console.log('  Для остановки нажмите Ctrl+C');
  console.log('═'.repeat(50));
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n📭 Сервер остановлен');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n📭 Сервер остановлен');
  process.exit(0);
});
