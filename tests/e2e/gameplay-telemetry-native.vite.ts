import { mergeConfig } from 'vite';
import base from '../../vite.config';
export default mergeConfig(base, { cacheDir: '.vite-dev.telemetry-native',
  server: { host: '127.0.0.1', port: 5581, strictPort: true } });
