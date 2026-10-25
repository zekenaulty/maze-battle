import { mergeConfig } from 'vite';
import base from './canonical-app.vite';
export default mergeConfig(base, { envDir: false, cacheDir: '.vite-dev.canonical-app-town-inventory' });
