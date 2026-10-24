import { initializeCorpus } from './canonical-corpus.initialize';

// Test-only genesis. Never overwrite an existing game or install an alternate App writer.
if (location.origin !== 'http://127.0.0.1:5206' || location.pathname !== '/tests/e2e/canonical-3d.html')
  throw Error('Controlled 3D qualification origin required');
const exists = (await indexedDB.databases()).some(db => db.name === 'maze-battle');
if (!sessionStorage.getItem('canonical-3d-fixture')) {
  if (exists) throw Error('Fresh 3D qualification context required');
  await initializeCorpus('A', 'canonical-3d-genesis');
  sessionStorage.setItem('canonical-3d-fixture', 'A');
}
await import('../../src/main');
