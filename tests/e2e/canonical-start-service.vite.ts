import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  cacheDir: 'node_modules/.vite-canonical-start-service', envDir: false,
  plugins: [react(), {
    name: 'actual-app-service-controller', enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useGameSession.ts')) return;
      const anchor = 'return { ...view, controller: session,';
      if (!source.includes(anchor)) throw Error('Actual App hook instrumentation no longer matches');
      return source.replace(anchor, 'globalThis.__canonicalStartAppSession = session;\n  ' + anchor);
    },
  }],
  server: { host: '127.0.0.1', port: 5258, strictPort: true },
  optimizeDeps: { entries: ['tests/e2e/canonical-start-service.html'] },
});
