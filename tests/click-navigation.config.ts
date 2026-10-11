import { mergeConfig } from 'vitest/config';
import base from '../vite.config';

// Dependency junction is shared and read-only; all generated caches stay here.
export default mergeConfig(base, { cacheDir: '.vite-dev.click-navigation' });
