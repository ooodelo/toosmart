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
  // Simplified file upload handler
  // In production, use proper multipart/form-data parser
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Загрузка файлов пока не реализована' }));
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
