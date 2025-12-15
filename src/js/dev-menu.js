/**
 * Dev Menu - Mock menu content for Vite dev server
 * Import in all template files for consistent menu
 */
export function initDevMenu() {
    const menuList = document.querySelector('[data-build-slot="menu"]');
    if (menuList && menuList.children.length <= 1) {
        menuList.innerHTML = `
      <li><a href="./template-index.html">Введение в курс</a></li>
      <li><a href="./template-paywall.html">Основы химии уборки</a></li>
      <li><a href="./template.html">Демонстрация стилей</a></li>
      <li><a href="./template-recommendations.html">Рекомендация: Губка</a></li>
    `;
    }
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDevMenu);
} else {
    initDevMenu();
}
