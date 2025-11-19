import { createMenuStateController } from './modules/menu.js';
import { initFlyout } from './modules/flyout.js';

document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const menuHandle = document.getElementById('menu-handle');

    const menuState = createMenuStateController({
        body,
        handles: [menuHandle]
    });

    initFlyout({
        body,
        sections: [],
        menuState
    });

    console.log('App initialized');
});
