#!/usr/bin/env node
/**
 * После сборки поднимает live-server на dist/assets и открывает Safari
 * с двумя вкладками: template.html и template-paywall.html.
 */
const { spawn } = require('child_process');
const { networkInterfaces } = require('os');
const path = require('path');

if (process.env.SKIP_BUILD_PREVIEW === '1') {
  process.exit(0);
}

// Поднимаем превью на корень prod-сборки (dist), чтобы видеть итог как на хостинге.
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = process.env.BUILD_PREVIEW_PORT || 4040;
// Bind to all interfaces so the preview is reachable by LAN IP.
const LISTEN_HOST = process.env.BUILD_PREVIEW_HOST || '0.0.0.0';

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

function startServer() {
  const args = [
    'live-server',
    DIST_DIR,
    `--host=${LISTEN_HOST}`,
    `--port=${PORT}`,
    '--no-browser',
    '--quiet',
  ];
  const child = spawn('npx', args, {
    stdio: 'ignore',
    detached: true,
  });
  child.on('error', (err) => {
    console.error('⚠️  Build preview server failed to start:', err.message);
  });
  child.unref();
}

function openSafari(urls = []) {
  if (process.platform !== 'darwin') {
    console.warn('⚠️  Автооткрытие Safari пропущено: не macOS. URL:', urls.join(' '));
    return;
  }
  if (!urls.length) return;
  const args = ['-na', 'Safari', ...urls];
  spawn('open', args, { stdio: 'ignore', detached: true }).unref();
}

const host = getLanIp();
startServer();

const baseUrl = `http://${host}:${PORT}`;
// Открываем основные страницы прод-сборки
const urls = [`${baseUrl}/index.html`, `${baseUrl}/premium/index.html`];

setTimeout(() => {
  openSafari(urls);
  console.log('✅ Build preview server started at:');
  console.log(`   ${urls[0]}`);
  console.log(`   ${urls[1]}`);
}, 1500);
