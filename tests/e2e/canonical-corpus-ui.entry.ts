import type { ComponentProps } from 'react';
import type { MazeCanvas } from '../../src/components/MazeCanvas';
import type { useKnownRooms } from '../../src/hooks/useKnownRooms';
import type { GameSession } from '../../src/services/game/GameSession';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalRecord, type CanonicalSnapshot } from '../../src/persistence/canonical/types';
import { initializeCorpus } from './canonical-corpus.initialize';
import type { CorpusVariant } from './canonical-corpus.layout';
import type {} from './canonical-corpus-ui.probe';
import type {} from './canonical-corpus.control';

type Canvas = Pick<ComponentProps<typeof MazeCanvas>, 'maze' | 'chests' | 'facing' | 'visibility' | 'camera' |
  'mode' | 'viewport' | 'origin' | 'frameKey' | 'pending'> & { width: number; height: number };
type Rooms = Pick<ReturnType<typeof useKnownRooms>, 'page' | 'error' | 'busy' | 'number'> & { snapshot: CanonicalSnapshot };
declare global {
  var __corpusUiSession: GameSession | undefined;
  var __corpusUiCanvas: Canvas | undefined;
  var __corpusUiRooms: Rooms | undefined;
  interface Window { corpusUi: typeof fixture }
}
if (location.href !== 'http://127.0.0.1:5446/tests/e2e/canonical-corpus-ui.html' || !window.corpusControl || !window.corpusUiWrites)
  throw Error('Controlled corpus UI fixture required');

function session() {
  const value = globalThis.__corpusUiSession;
  if (!value?.view.game) throw Error('Actual App session not ready');
  return value;
}
async function digest(value: string | Uint8Array<ArrayBuffer>) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
// Privileged independent native oracle. These bytes never enter App, rendering, or movement inputs.
async function database() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), stores = [];
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name);
      stores.push({ name, keys: await store.getAllKeys(), values: await store.getAll() });
    }
    await tx.done;
    return stores;
  } finally { db.close(); }
}
let started = false, audit: { database: string; writes: number } | undefined;
const fixture = {
  async boot(variant: CorpusVariant) {
    if (started || (await indexedDB.databases()).some(db => db.name === 'maze-battle')) throw Error('Fresh document/database required');
    started = true;
    await initializeCorpus(variant, 'corpus-ui-genesis');
    const genesis = await database();
    const head = genesis.find(store => store.name === 'heads')!.values[0] as CanonicalHead;
    const records = genesis.find(store => store.name === 'records')!.values as CanonicalRecord[];
    const world = records.filter(record => record.area === 'world');
    const beforeApp = { head, knowledgeRecords: records.filter(record => record.area === 'knowledge').length,
      counts: genesis.map(store => ({ store: store.name, count: store.values.length })),
      databaseHash: await digest(JSON.stringify(genesis)), worldHash: await digest(JSON.stringify(world)) };
    await import('../../src/main');
    return beforeApp;
  },
  state() {
    const { game, controlled, busy, status, recoveryRequired, saves } = session().view;
    return structuredClone({ game, controlled, busy, status, recoveryRequired, saves });
  },
  async beginUiAudit() {
    if (audit) throw Error('Overlapping UI audit');
    await session().flush();
    audit = { database: JSON.stringify(await database()), writes: window.corpusUiWrites!().length };
  },
  async endUiAudit() {
    if (!audit) throw Error('Missing UI audit');
    await session().flush();
    const after = JSON.stringify(await database()), writes = window.corpusUiWrites!().slice(audit.writes);
    if (after !== audit.database || writes.length) throw Error(`Rendering changed native database: ${JSON.stringify(writes)}`);
    audit = undefined;
    return { exactDatabaseUnchanged: true, nativeWrites: writes, bytes: new TextEncoder().encode(after).length, hash: await digest(after) };
  },
  async capture(kind: 'dungeon' | 'rooms' | 'nearby') {
    const state = fixture.state(), canvas = document.querySelector<HTMLCanvasElement>('canvas.maze-canvas');
    const raw = kind === 'rooms' ? globalThis.__corpusUiRooms : globalThis.__corpusUiCanvas;
    if (!raw || (kind !== 'rooms' && !canvas)) throw Error('Missing actual render capture');
    // Sets are serialized in their original iteration order; no IDs, values, or geometry are normalized.
    const render = JSON.parse(JSON.stringify(raw, (_key, value) => value instanceof Set ? [...value] : value));
    let pixels = null;
    if (kind !== 'rooms' && canvas) {
      // Read the displayed bitmap, not the live context: readback can switch Chrome's live canvas to a CPU backend.
      const bitmap = await createImageBitmap(canvas), copy = new OffscreenCanvas(canvas.width, canvas.height);
      const context = copy.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const rgba = context.getImageData(0, 0, copy.width, copy.height).data;
      const colors = new Set<number>();
      for (let i = 0; i < rgba.length; i += 4) colors.add((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]);
      pixels = { width: canvas.width, height: canvas.height, colors: colors.size, rgbaHash: await digest(new Uint8Array(rgba)) };
    }
    return { state, render, pixels, visibleText: document.body.innerText,
      screenStatus: document.querySelector('.screen-status')?.textContent,
      statuses: Array.from(document.querySelectorAll('[role=status], [role=alert], [aria-live]'), element => element.textContent),
      canvasAttributes: kind === 'rooms' ? null : Object.fromEntries(Array.from(canvas!.attributes, attribute => [attribute.name, attribute.value])),
      controls: Array.from(document.querySelectorAll<HTMLButtonElement>('button'), button => ({
        text: button.innerText, label: button.getAttribute('aria-label'), disabled: button.disabled,
        selected: button.getAttribute('aria-selected'), pressed: button.getAttribute('aria-pressed'),
      })), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } };
  },
  stop() { globalThis.__corpusUiSession?.stop(); },
};
window.corpusUi = fixture;
