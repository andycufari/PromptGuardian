import { defineConfig, Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, renameSync, rmSync, readFileSync, writeFileSync } from 'fs';

function chromeExtensionPlugin(): Plugin {
  return {
    name: 'chrome-extension',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');

      // Move popup.html to dist root and fix asset paths
      const nestedHtml = resolve(dist, 'src/popup/popup.html');
      if (existsSync(nestedHtml)) {
        let html = readFileSync(nestedHtml, 'utf-8');
        // Fix relative paths: ../../popup.js -> ./popup.js
        html = html.replace(/(?:\.\.\/)+/g, './');
        writeFileSync(resolve(dist, 'popup.html'), html);
        rmSync(resolve(dist, 'src'), { recursive: true, force: true });
      }

      // Copy manifest
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(dist, 'manifest.json'),
      );

      // Copy icons if they exist
      const iconsDir = resolve(__dirname, 'icons');
      if (existsSync(iconsDir)) {
        const destIcons = resolve(dist, 'icons');
        if (!existsSync(destIcons)) mkdirSync(destIcons, { recursive: true });
        for (const file of ['icon16.png', 'icon48.png', 'icon128.png']) {
          const src = resolve(iconsDir, file);
          if (existsSync(src)) copyFileSync(src, resolve(destIcons, file));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content.ts'),
        interceptor: resolve(__dirname, 'src/inject/interceptor.ts'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
    target: 'esnext',
    minify: false,
  },
  plugins: [chromeExtensionPlugin()],
});
