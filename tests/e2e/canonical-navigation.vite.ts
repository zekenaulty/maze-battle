import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-dev.canonical-navigation', server: { host: '127.0.0.1', port: 5222, strictPort: true, hmr: false } });
