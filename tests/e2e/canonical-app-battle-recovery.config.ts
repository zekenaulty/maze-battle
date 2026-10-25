import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './canonical-app-auto-kill.config';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.BATTLE_RECOVERY_OUTPUT ?? `${root}/test-results/app-battle-recovery-d189639`;
export default defineConfig({
  ...base, testMatch: 'canonical-app-battle-recovery.spec.ts', timeout: 120_000,
  outputDir: `${output}/artifacts`,
  reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
});
