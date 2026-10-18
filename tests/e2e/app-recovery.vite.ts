import { mergeConfig } from 'vitest/config';
import base from '../../vite.config';

// Test-only access to the actual hook-owned controller. No replacement hook or second session.
export default mergeConfig(base, { cacheDir: 'node_modules/.vite-app-recovery', plugins: [{
  name: 'actual-app-recovery-controller', enforce: 'pre',
  transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/hooks/useGameSession.ts')) return;
    const anchor = 'return { ...view, controller: session,';
    if (!source.includes(anchor)) throw new Error('Actual App hook instrumentation no longer matches');
    return source.replace(anchor, 'globalThis.__appRecoverySession = session;\n  ' + anchor);
  },
}] });
