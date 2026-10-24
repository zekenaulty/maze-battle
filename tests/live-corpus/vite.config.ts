import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proposed public run profile only. This neither loads credentials nor authorizes Start.
const profile = {
  ENDPOINT: 'ws://127.0.0.1:5078/api/host', PROVIDER: 'openai', MODEL: 'gpt-6-luna', THINKING_EFFORT: 'high',
  CONTEXT_WINDOW_TOKENS: '65536', MAX_OUTPUT_TOKENS: '4096', MAX_STEPS: '64', MAX_REFINEMENTS: '48',
  MAX_PLAN_CONTINUATIONS: '16', TIMEOUT_SECONDS: '300', ACTION_TIMEOUT_SECONDS: '30',
};
export default defineConfig({
  envDir: false, envPrefix: [], cacheDir: '.vite-dev.live-corpus',
  define: Object.fromEntries(Object.entries(profile).map(([key, value]) => [`import.meta.env.VITE_AGENTICA_${key}`, JSON.stringify(value)])),
  plugins: [react(), {
    name: 'live-corpus-app-session-witness', enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useGameSession.ts')) return;
      const anchor = 'return { ...view, controller: session,';
      if (source.split(anchor).length !== 2) throw Error('Actual App session hook anchor changed');
      return source.replace(anchor, `if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5488')
        throw Error('Isolated live corpus App only');
        globalThis.__canonicalStartAppSession = session;
        ${anchor}`);
    },
  }],
  server: { host: '127.0.0.1', port: 5488, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/live-corpus/setup.html'] },
});
