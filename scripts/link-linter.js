#!/usr/bin/env node

/**
 * Link Linter - проверка внутренних ссылок в сгенерированных HTML файлах
 *
 * Использование:
 *   node scripts/link-linter.js
 *   node scripts/link-linter.js --fix  (исправить битые ссылки где возможно)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DIST_DIR = path.resolve(__dirname, '../dist');
const FIX_MODE = process.argv.includes('--fix');

const results = {
  totalFiles: 0,
  totalLinks: 0,
  brokenLinks: [],
  warnings: [],
  fixed: []
};

async function main() {
  console.log('🔍 Link Linter - проверка внутренних ссылок\n');

  // Проверяем free и premium
  await lintDirectory(path.join(DIST_DIR, 'free'), '/');
  await lintDirectory(path.join(DIST_DIR, 'premium'), '/premium');

  // Выводим отчёт
  printReport();

  // Выходим с кодом ошибки если есть битые ссылки
  if (results.brokenLinks.length > 0) {
    process.exit(1);
  }
}

async function lintDirectory(dir, urlPrefix) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Директория не найдена: ${dir}`);
    return;
  }

  const files = await findHTMLFiles(dir);
  console.log(`📁 ${urlPrefix}: найдено ${files.length} HTML файлов`);

  for (const file of files) {
    await lintFile(file, dir, urlPrefix);
  }
}

async function findHTMLFiles(dir) {
  const files = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

async function lintFile(filePath, baseDir, urlPrefix) {
  results.totalFiles++;

  const html = fs.readFileSync(filePath, 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const links = document.querySelectorAll('a[href]');
  const relativeFilePath = path.relative(baseDir, filePath);

  for (const link of links) {
    const href = link.getAttribute('href');
    results.totalLinks++;

    // Пропускаем внешние ссылки и якоря
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#') || href.startsWith('mailto:')) {
      continue;
    }

    // Пропускаем javascript:
    if (href.startsWith('javascript:')) {
      continue;
    }

    // Проверяем внутренние ссылки
    await checkInternalLink(href, filePath, baseDir, urlPrefix, relativeFilePath);
  }
}

async function checkInternalLink(href, sourceFile, baseDir, urlPrefix, relativeFilePath) {
  // Убираем query string и hash
  const cleanHref = href.split('?')[0].split('#')[0];

  if (!cleanHref) {
    return; // Только якорь
  }

  // Определяем целевой файл
  let targetPath;

  if (cleanHref.startsWith('/')) {
    // Абсолютная ссылка от корня
    if (cleanHref.startsWith('/premium/')) {
      targetPath = path.join(DIST_DIR, 'premium', cleanHref.replace('/premium/', ''));
    } else {
      targetPath = path.join(DIST_DIR, 'free', cleanHref);
    }
  } else {
    // Относительная ссылка
    targetPath = path.join(path.dirname(sourceFile), cleanHref);
  }

  // Если ссылка на директорию, ищем index.html
  if (cleanHref.endsWith('/')) {
    targetPath = path.join(targetPath, 'index.html');
  } else if (!cleanHref.includes('.')) {
    // Если нет расширения, пробуем добавить .html
    if (!fs.existsSync(targetPath) && fs.existsSync(targetPath + '.html')) {
      targetPath += '.html';
    }
  }

  // Проверяем существование
  if (!fs.existsSync(targetPath)) {
    results.brokenLinks.push({
      source: relativeFilePath,
      href,
      target: targetPath,
      urlPrefix
    });

    if (FIX_MODE) {
      // Попытка исправить
      const fixed = tryFix(href, sourceFile, targetPath);
      if (fixed) {
        results.fixed.push({
          source: relativeFilePath,
          from: href,
          to: fixed
        });
      }
    }
  }
}

function tryFix(href, sourceFile, targetPath) {
  // Попытка 1: добавить .html
  if (fs.existsSync(targetPath + '.html')) {
    updateLinkInFile(sourceFile, href, href + '.html');
    return href + '.html';
  }

  // Попытка 2: убрать trailing slash
  if (href.endsWith('/')) {
    const withoutSlash = href.slice(0, -1);
    const newTarget = targetPath.slice(0, -1);
    if (fs.existsSync(newTarget + '.html')) {
      updateLinkInFile(sourceFile, href, withoutSlash + '.html');
      return withoutSlash + '.html';
    }
  }

  return null;
}

function updateLinkInFile(filePath, oldHref, newHref) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    new RegExp(`href="${escapeRegex(oldHref)}"`, 'g'),
    `href="${newHref}"`
  );
  fs.writeFileSync(filePath, content, 'utf8');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function printReport() {
  console.log('\n📊 Отчёт Link Linter:');
  console.log(`  Проверено файлов: ${results.totalFiles}`);
  console.log(`  Проверено ссылок: ${results.totalLinks}`);

  if (results.brokenLinks.length > 0) {
    console.log(`\n❌ Найдено битых ссылок: ${results.brokenLinks.length}\n`);

    for (const broken of results.brokenLinks) {
      console.log(`  ${broken.source}:`);
      console.log(`    href="${broken.href}"`);
      console.log(`    → ${broken.target} (не найден)\n`);
    }
  } else {
    console.log('\n✅ Битых ссылок не найдено!');
  }

  if (results.fixed.length > 0) {
    console.log(`\n🔧 Исправлено ссылок: ${results.fixed.length}\n`);
    for (const fix of results.fixed) {
      console.log(`  ${fix.source}:`);
      console.log(`    ${fix.from} → ${fix.to}`);
    }
  }
}

main().catch(error => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
});
