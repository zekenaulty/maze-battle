import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', port: 5241, strictPort: true },
  optimizeDeps: { entries: ['tests/e2e/canonical-agentica-perception.html'] } });
