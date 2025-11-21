#!/usr/bin/env node
/**
 * Запускает Vite dev server, доступный по локальной сети (Wi‑Fi).
 * Автоопределяет первый внешний IPv4 и прокидывает его в Vite как host.
 */
const { networkInterfaces } = require('os');
const { spawn } = require('child_process');

function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '0.0.0.0';
}

const host = getLanIp();
const port = process.env.PORT || 4173;
const args = ['vite', '--host', host, '--port', String(port), '--clearScreen', 'false', '--strictPort'];

console.log(`\n🌐 Starting Vite dev server on ${host}:${port} (LAN)\n`);
console.log(`   URLs:`);
console.log(`   - Local:   http://localhost:${port}/template.html`);
console.log(`   - Network: http://${host}:${port}/template.html`);
console.log(`   - Network: http://${host}:${port}/template-paywall.html`);
console.log('');

const child = spawn('npx', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: host,
    PORT: port
  }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

function openSafari(urls = []) {
  if (process.platform !== 'darwin' || !urls.length) return;
  const args = ['-na', 'Safari', ...urls];
  spawn('open', args, { stdio: 'ignore', detached: true }).unref();
}

// Открываем обе вкладки
const base = `http://${host}:${port}`;
const urls = [`${base}/template.html`, `${base}/template-paywall.html`];
setTimeout(() => openSafari(urls), 1500);
