import { defineConfig } from '@playwright/test';
import paired from './ns6-paired.config';

export default defineConfig({ ...paired, testMatch: 'launch-ui.spec.ts', outputDir: '../../test-results/launch-ui',
  webServer: Array.isArray(paired.webServer) ? paired.webServer.map(server => ({ ...server,
    ...(server.url?.includes(':5185') ? { env: { VITE_MAZE_TRAVEL_STEPS: '64', VITE_MAZE_TRAVEL_REPLANS: '4', VITE_MAZE_TRAVEL_DURATION_MS: '120000' } } : {}),
  })) : paired.webServer,
  reporter: [['list'], ['json', { outputFile: 'test-results/launch-ui-report.json' }]],
});
