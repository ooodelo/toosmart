import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: 'src',
    build: {
        outDir: '../dist/assets',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'src/js/main.js'),
                styles: path.resolve(__dirname, 'src/styles.css')
            },
            output: {
                entryFileNames: 'script.js',
                assetFileNames: '[name].[ext]'
            }
        }
    }
});
