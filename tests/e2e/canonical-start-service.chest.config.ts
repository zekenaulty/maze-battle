import config from './canonical-start-service.config';

// Isolated entrypoint while the shared cohort's explicit testMatch is parent-owned.
export default { ...config, testMatch: 'canonical-start-service.app-chest.spec.ts' };
