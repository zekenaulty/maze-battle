import { mergeConfig } from 'vitest/config';
import base from '../../vite.config';
export default mergeConfig(base, { cacheDir: 'node_modules/.vite-restoration-3d' });
