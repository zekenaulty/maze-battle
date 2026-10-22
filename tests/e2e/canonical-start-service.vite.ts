import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { browserOrigin, serviceOrigin } from '../agentica-start-service/service.mjs';
export default defineConfig({
  cacheDir: 'node_modules/.vite-canonical-start-service', envDir: false,
  define: { 'import.meta.env.VITE_START_SERVICE_ORIGIN': JSON.stringify(browserOrigin),
    ...Object.fromEntries(Object.entries({ ENDPOINT: serviceOrigin.replace('http:', 'ws:') + '/api/host', PROVIDER: 'fixture',
    MODEL: 'observation-sequence', MAX_STEPS: '4', MAX_REFINEMENTS: '3', MAX_PLAN_CONTINUATIONS: '0',
    TIMEOUT_SECONDS: '60', ACTION_TIMEOUT_SECONDS: '10',
  }).map(([key, value]) => ['import.meta.env.VITE_AGENTICA_' + key, JSON.stringify(value)])) },
  plugins: [react(), {
    name: 'actual-app-service-controller', enforce: 'pre',
    transform(source, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/services/agentica/game/playNavigation.ts')) {
        const anchor = '      timer = setTimeout(() => { void pulse(); }, 250);';
        if (!source.includes(anchor)) throw Error('History transfer custody barrier no longer matches');
        // Test-only scheduling pause after real custody ACK, before the first local step.
        return source.replace(anchor, `if (new URL(location.href).searchParams.has('activeJourneyProof')
          && await (await import('/tests/e2e/canonical-start-service.active-journey-evidence.ts')).pauseActiveJourney(action, result)) return;
        if (result.status === 'custody-confirmed'
          && new URL(location.href).searchParams.has('historyTransferProof')) {
          globalThis.__canonicalHistoryTransferPaused = true; return;
        }
        ${anchor}`);
      }
      if (id.replaceAll('\\', '/').endsWith('/src/persistence/canonical/agentica/decision.query.read.ts')) {
        const anchor = 'return { pages, usage };';
        if (!source.includes(anchor)) throw Error('Decision query read-meter instrumentation no longer matches');
        // Observe the real counters without replacing reads, budgets, authority or query results.
        return source.replace(anchor, `if (new URL(location.href).searchParams.has('historyProof'))
          (globalThis.__canonicalDecisionReadMeters ??= []).push(usage);
          ${anchor}`);
      }
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
          ...(new URL(location.href).searchParams.has('historyProof') ? {
            VITE_AGENTICA_MODEL: 'decision-history', VITE_AGENTICA_MAX_STEPS: '5',
            VITE_AGENTICA_MAX_REFINEMENTS: '3', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '1',
            VITE_AGENTICA_TIMEOUT_SECONDS: '180', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '30',
          } : {}),
          ...(new URL(location.href).searchParams.has('chestProof') ? {
            VITE_AGENTICA_MODEL: 'decision-chest', VITE_AGENTICA_MAX_STEPS: '4',
            VITE_AGENTICA_MAX_REFINEMENTS: '2', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '1',
            VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
          ...(new URL(location.href).searchParams.has('journalProof') ? {
            VITE_AGENTICA_MODEL: 'decision-journal', VITE_AGENTICA_MAX_STEPS: '3',
            VITE_AGENTICA_MAX_REFINEMENTS: '2', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '0',
            VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
          ...(new URL(location.href).searchParams.has('returnProof') ? {
            VITE_AGENTICA_MODEL: 'decision-return', VITE_AGENTICA_MAX_STEPS: '5',
            VITE_AGENTICA_MAX_REFINEMENTS: '2', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '2',
            VITE_AGENTICA_TIMEOUT_SECONDS: '180', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20',
          } : {}),
          ...(new URL(location.href).searchParams.has('corpusProof') ? {
            VITE_AGENTICA_MODEL: 'decision-corpus', VITE_AGENTICA_MAX_STEPS: '64',
            VITE_AGENTICA_MAX_REFINEMENTS: '48', VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '16',
            VITE_AGENTICA_TIMEOUT_SECONDS: '300', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '30',
          } : {}),
          ...(new URL(location.href).searchParams.has('roomJourneyProof') ? { VITE_AGENTICA_MODEL: 'room-journey' } : {}),
          ...(new URL(location.href).searchParams.has('plannerCaptureProof') ? { VITE_AGENTICA_MODEL: 'corpus-planner-capture' } : {}),
        });`);
      }
      if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useGameSession.ts')) return;
      const anchor = 'return { ...view, controller: session,';
      if (!source.includes(anchor)) throw Error('Actual App hook instrumentation no longer matches');
      return source.replace(anchor, 'globalThis.__canonicalStartAppSession = session;\n  ' + anchor);
    },
  }],
  server: { host: '127.0.0.1', port: Number(new URL(browserOrigin).port), strictPort: true },
  optimizeDeps: { entries: ['tests/e2e/canonical-start-service.html'] },
});
