#!/usr/bin/env node

const { build } = require('./lib/build');

(async () => {
  try {
    const args = process.argv.slice(2);
    const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1] || null;
    await build({ target });
    console.log('✅ Сборка завершена');
  } catch (error) {
    console.error('❌ Ошибка сборки:', error.message);
    process.exit(1);
  }
})();
