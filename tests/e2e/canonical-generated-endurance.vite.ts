import { defineConfig } from 'vite';
import sharedApp from './canonical-revisit.vite';

// Reuse the existing mounted GameSession instrumentation, never a parallel game controller.
export default defineConfig({ ...sharedApp, cacheDir: '.vite-dev.canonical-generated-endurance' });
