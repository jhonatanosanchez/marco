import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// Multi-page build: / -> display (Raspberry Pi screen), /admin/ -> management panel.
export default defineConfig({
  root: 'web',
  plugins: [preact()],
  // Build identity reported by displays (docs/ARCHITECTURE.md), declared in web/shared/env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    // The HEIC decoder (heic-to, ~3 MB) is its own lazily imported chunk, loaded only when a HEIC photo is picked.
    chunkSizeWarningLimit: 3300,
    rollupOptions: {
      input: {
        display: resolve(root, 'web/index.html'),
        admin: resolve(root, 'web/admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/auth': { target: 'http://localhost:3000', changeOrigin: false },
      '/media': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
