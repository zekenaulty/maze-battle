import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: false, cacheDir: '.vite-dev.canonical-revisit',
  plugins: [react(), {
    name: 'revisit-actual-app-session', enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useGameSession.ts')) return;
      const anchor = 'return { ...view, controller: session,';
      if (!source.includes(anchor)) throw Error('Actual App session instrumentation no longer matches');
      return source.replace(anchor, 'globalThis.__revisitAppSession = session;\n  ' + anchor);
    },
  }],
});
