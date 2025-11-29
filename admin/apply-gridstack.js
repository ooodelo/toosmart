#!/usr/bin/env node

/**
 * Скрипт для применения GridStack к admin/index.html
 * 
 * Что делает:
 * 1. Добавляет Google Fonts и GridStack CDN в head
 * 2. Обновляет CSS переменные на Journal Premium
 * 3. Оборачивает Build Actions в grid-stack
 * 4. Оборачивает основные карточки (Prices, CTA, Footer) в grid-stack
 * 5. Добавляет JavaScript для GridStack
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || 'admin/index.html';
const backupPath = filePath + '.pre-gridstack-backup';

console.log(`Processing: ${filePath}`);

// Read file
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add fonts and GridStack CDN after apple-touch-icon link
const fontsAndCDN = `  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <!-- GridStack.js -->
  <link href="https://cdn.jsdelivr.net/npm/gridstack@10/dist/gridstack.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/gridstack@10/dist/gridstack-extra.min.css" rel="stylesheet" />`;

content = content.replace(
    /  <link rel="apple-touch-icon" href="\/assets\/apple-touch-icon\.png">/,
    fontsAndCDN
);

// 2. Update CSS variables
const newVars = `    :root {
      /* Palette: Journal Premium */
      --bg-page: #FAFAFA;
      --bg-card: #FFFFFF;
      --text-main: #111827;
      --text-secondary: #4B5563;
      --text-muted: #9CA3AF;

      --primary: #0F172A;
      --primary-hover: #1E293B;

      --accent: #2563EB;
      --success: #059669;
      --warning: #D97706;
      --danger: #DC2626;

      --border-light: #E5E7EB;
      --border-medium: #D1D5DB;

      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025);

      --font-serif: 'Playfair Display', serif;
      --font-sans: 'Inter', sans-serif;
      
      /* Legacy compatibility */
      --bg: var(--bg-page);
      --card-bg: var(--bg-card);
      --text: var(--text-main);
      --border: var(--border-light);
    }`;

content = content.replace(
    /    :root \{[^}]+\}/,
    newVars
);

console.log('✓ Added fonts, CDN, and updated CSS variables');

// 3. Add GridStack JavaScript before </body>
const gridstackJS = `
  <!-- GridStack.js Library -->
  <script src="https://cdn.jsdelivr.net/npm/gridstack@10/dist/gridstack-all.js"></script>

  <script>
    let grid = null;

    function initGridStack() {
      const gridElements = document.querySelectorAll('.grid-stack');
      gridElements.forEach(gridEl => {
        const gridInstance = GridStack.init({
          column: 12,
          cellHeight: 80,
          resizable: { handles: 'e, se, s, w, sw, n, nw, ne' },
          draggable: true,
          margin: 12,
          float: true,
          animate: true
        }, gridEl);

        if (!grid) grid = gridInstance;

        const savedLayout = localStorage.getItem('adminPanelLayout');
        if (savedLayout) {
          try {
            gridInstance.load(JSON.parse(savedLayout));
          } catch (e) {
            console.error('Failed to load layout:', e);
          }
        }

        gridInstance.on('change', () => {
          const layout = gridInstance.save(false);
          localStorage.setItem('adminPanelLayout', JSON.stringify(layout));
        });
      });
    }

    function autoFitWidget(el) {
      if (!grid || !el) return;
      const content = el.querySelector('.card');
      if (!content) return;

      const clone = content.cloneNode(true);
      clone.style.cssText = \`
        width: \${content.offsetWidth}px;
        height: auto;
        position: absolute;
        visibility: hidden;
        top: -9999px;
      \`;
      document.body.appendChild(clone);

      const height = clone.offsetHeight;
      document.body.removeChild(clone);

      const cellHeight = grid.getCellHeight();
      const margin = grid.opts.margin || 12;
      const h = Math.ceil((height + margin) / (cellHeight + margin));

      grid.update(el, { h: Math.max(h, 2) });
    }

    function autoFitAll() {
      if (!grid) return;
      grid.engine.nodes.forEach(node => autoFitWidget(node.el));
      grid.compact();
    }

    function resetLayout() {
      if (confirm('Сбросить расположение модулей?')) {
        localStorage.removeItem('adminPanelLayout');
        location.reload();
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      initGridStack();
      setTimeout(() => {
        autoFitAll();
        // Auto-fit after content loads
        setTimeout(autoFitAll, 1000);
      }, 300);
    });
  </script>
</body>`;

content = content.replace('</body>', gridstackJS);

console.log('✓ Added GridStack JavaScript');

// Save
fs.writeFileSync(backupPath, fs.readFileSync(filePath));
fs.writeFileSync(filePath, content, 'utf8');

console.log(`✓ Done! Backup saved to: ${backupPath}`);
console.log('  Next: Manually wrap cards in grid-stack-item structure');
