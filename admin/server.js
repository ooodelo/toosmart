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

const PORT = process.env.PORT || 3001;
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'site.json');
const ADMIN_DIR = __dirname;
const PROJECT_ROOT = path.join(__dirname, '..');

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

    if (pathname === '/api/files' && req.method === 'POST') {
      await handleFileUpload(req, res);
      return;
    }

    if (pathname === '/api/sections' && req.method === 'GET') {
      await handleGetSections(req, res);
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
      let command;
      switch (target) {
        case 'free':
          command = `"${nodeExec}" scripts/build.js --target=free`;
          break;
        case 'premium':
          command = `"${nodeExec}" scripts/build.js --target=premium`;
          break;
        case 'recommendations':
          command = `"${nodeExec}" scripts/build.js --target=recommendations`;
          break;
        case 'all':
        default:
          command = `"${nodeExec}" scripts/build.js`;
          break;
      }

      console.log(`[${new Date().toISOString()}] Запуск сборки: ${command}`);

      // Запуск сборки
      const output = execSync(command, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 60000, // 60 секунд таймаут
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

// Получение списка разделов
async function handleGetSections(req, res) {
  try {
    const courseDir = path.join(PROJECT_ROOT, 'content', 'course');
    const recsDir = path.join(PROJECT_ROOT, 'content', 'recommendations');

    const courseSections = fs.readdirSync(courseDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    const recommendations = fs.readdirSync(recsDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      course: courseSections,
      recommendations: recommendations
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка чтения разделов: ' + error.message }));
  }
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
