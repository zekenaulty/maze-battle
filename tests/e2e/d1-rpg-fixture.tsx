import { createRoot } from 'react-dom/client';
import { App } from '../../src/App';
import { getDatabase, saveGame } from '../../src/persistence/saveRepository';
import { boundary, fixtureGame } from './d1-rpg-fixtures';
import '../../src/styles.css';

async function snapshot() {
  const db = await getDatabase();
  const tx = db.transaction(['saves', 'meta', 'telemetry'], 'readonly');
  const saves = await tx.objectStore('saves').getAll();
  const meta = await tx.objectStore('meta').getAll();
  const telemetry = await tx.objectStore('telemetry').getAll();
  await tx.done;
  return { saves, meta, telemetry };
}

declare global {
  interface Window {
    d1Rpg: { snapshot: typeof snapshot; edge?: ReturnType<typeof boundary>; seedCount: number; session: string };
  }
}

async function start() {
  if (!import.meta.env.DEV || location.hostname !== '127.0.0.1' || location.port !== '5199') {
    throw new Error('D1 fixture is restricted to the isolated development port');
  }
  const scenario = new URLSearchParams(location.search).get('case') ?? 'fresh';
  if (!['fresh', 'original', 'classic', 'v1', 'v2', 'safe-manual', 'safe-auto'].includes(scenario)) throw new Error('Unknown fixture');
  const marker = 'd1-rpg-disposable-fixture';
  const stored = await snapshot();
  if (!stored.saves.length) {
    if (sessionStorage.getItem(marker)) throw new Error('Fixture database unexpectedly disappeared');
    await saveGame('auto', `D1 RPG ${scenario}`, 'auto', fixtureGame(scenario));
    const seeded = (await snapshot()).saves[0];
    sessionStorage.setItem(marker, JSON.stringify({ scenario, id: seeded.game.id, seedCount: 1 }));
  } else if (!sessionStorage.getItem(marker)) {
    throw new Error('Refusing to seed or adopt a non-fixture database');
  }
  const identity = JSON.parse(sessionStorage.getItem(marker)!);
  const game = (await snapshot()).saves.find(s => s.slotId === 'auto')!.game;
  if (identity.scenario !== scenario || identity.id !== game.id) throw new Error('Fixture identity changed');
  window.d1Rpg = { snapshot, session: crypto.randomUUID(), seedCount: identity.seedCount,
    edge: scenario.startsWith('safe-') ? boundary(game) : undefined };
  // Test-local RNG forcing; no encounter, movement, Auto, battle or persistence owner is mocked.
  if (scenario.startsWith('safe-')) Math.random = () => 0;
  createRoot(document.getElementById('root')!).render(<App />);
}

void start();
