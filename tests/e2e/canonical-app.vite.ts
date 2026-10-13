import { mergeConfig } from 'vitest/config';
import base from '../../vite.config';
export default mergeConfig(base, { cacheDir: '.vite-canonical-app' });
