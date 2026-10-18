import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  cacheDir: 'node_modules/.vite-canonical-start-service', envDir: false,
  define: Object.fromEntries(Object.entries({ ENDPOINT: 'ws://127.0.0.1:5259/api/host', PROVIDER: 'fixture',
    MODEL: 'observation-sequence', MAX_STEPS: '4', MAX_REFINEMENTS: '3', MAX_PLAN_CONTINUATIONS: '0',
    TIMEOUT_SECONDS: '60', ACTION_TIMEOUT_SECONDS: '10',
  }).map(([key, value]) => ['import.meta.env.VITE_AGENTICA_' + key, JSON.stringify(value)])),
  plugins: [react(), {
    name: 'actual-app-service-controller', enforce: 'pre',
    transform(source, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/persistence/canonical/game/initialize.ts')) {
        const anchor = 'seed = crypto.getRandomValues(new Uint32Array(1))[0]';
        if (!source.includes(anchor)) throw Error('Actual game seed instrumentation no longer matches');
        // Room-only input qualifies a first-page current-space frontier; the approach cohort stays on seed 2.
        return source.replace(anchor, "seed = new URL(location.href).searchParams.has('roomProof') ? 5 : 2");
      }
      if (id.replaceAll('\\', '/').endsWith('/src/hooks/useGameAgenticPlay.ts')) {
        const anchor = 'const configuration = readGameAgenticaProfile(import.meta.env);';
        if (!source.includes(anchor)) throw Error('Actual App profile instrumentation no longer matches');
        return source.replace(anchor, `const configuration = readGameAgenticaProfile({ ...import.meta.env,
          ...(new URL(location.href).searchParams.has('decisionProof') ? {
            VITE_AGENTICA_MODEL: 'decision-navigation', VITE_AGENTICA_MAX_STEPS: '8',
            VITE_AGENTICA_MAX_REFINEMENTS: '6', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '1',
            VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
          ...(new URL(location.href).searchParams.has('frontierProof') ? {
            VITE_AGENTICA_MODEL: 'decision-frontier', VITE_AGENTICA_MAX_STEPS: '4',
            VITE_AGENTICA_MAX_REFINEMENTS: '2', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '1',
            VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
          ...(new URL(location.href).searchParams.has('roomProof') ? {
            VITE_AGENTICA_MODEL: 'decision-room', VITE_AGENTICA_MAX_STEPS: '4',
            VITE_AGENTICA_MAX_REFINEMENTS: '2', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '0',
            VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
          ...(new URL(location.href).searchParams.has('chestProof') ? {
            VITE_AGENTICA_MODEL: 'decision-chest', VITE_AGENTICA_MAX_STEPS: '4',
            VITE_AGENTICA_MAX_REFINEMENTS: '2', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '1',
            VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
        });`);
      }
      if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useGameSession.ts')) return;
      const anchor = 'return { ...view, controller: session,';
      if (!source.includes(anchor)) throw Error('Actual App hook instrumentation no longer matches');
      return source.replace(anchor, 'globalThis.__canonicalStartAppSession = session;\n  ' + anchor);
    },
  }],
  server: { host: '127.0.0.1', port: 5258, strictPort: true },
  optimizeDeps: { entries: ['tests/e2e/canonical-start-service.html'] },
});
