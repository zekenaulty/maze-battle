import type { GameSession } from '../../src/services/game/GameSession';
import { readCanonical } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { JsonObject } from '../../src/persistence/canonical/types';
import { observeMaze, inspectMaze } from '../../src/services/agentica/game/observation';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import type { InspectArgs } from '../../src/services/agentica/game/types';

/** Actual earned projections only. A separate oracle owns all raw world inspection. */
export async function corpusSurface(session: GameSession) {
  const published = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish', input: {},
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  const ref = (published.result as JsonObject).reference as unknown as ProtocolRef;
  const reads: { method: string; area: string; key: string }[] = [];
  const game = session.view.game!, at = game.checkpoint.position;
  const projection = await readCanonical(async (pages, snapshot) => {
    const earned = new Proxy(pages, { get(target, method) {
      if (['get', 'scan', 'witness'].includes(String(method))) return (area: string, key: string, ...args: unknown[]) => {
        if (area === 'world') throw Error('Actor projection consulted authoritative world');
        reads.push({ method: String(method), area, key });
        return Reflect.apply(Reflect.get(target, method), target, [area, key, ...args]);
      };
      const value = Reflect.get(target, method); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const actor = await observeMaze(earned, snapshot, ref);
    const scopes: Record<string, Awaited<ReturnType<typeof inspectMaze>>[]> = {};
    for (const scope of ['cell', 'frontiers', 'map', 'room', 'objects'] as const) {
      const frames: Awaited<ReturnType<typeof inspectMaze>>[] = [];
      scopes[scope] = frames;
      let cursor: string | undefined;
      for (let page = 0; page < 128; page++) {
        const args: InspectArgs = scope === 'cell' ? { scope, level: at.level, ...at.cell }
          : { scope, ...(cursor ? { cursor } : {}) };
        const frame = await inspectMaze(earned, snapshot, ref, args); frames.push(frame);
        cursor = frame.data.next as string | undefined;
        if (!cursor) break;
        if (page === 127) throw Error('Corpus actor projection exceeded its page bound');
      }
    }
    return { actor, scopes };
  });
  return {
    raw: { sight: structuredClone(game.observation), position: structuredClone(at), facing: game.checkpoint.facing,
      mode: game.mode, party: structuredClone(game.party), inventory: structuredClone(game.inventory),
      stash: structuredClone(game.stash), randomBattles: game.randomBattles,
      quests: game.quests.map(({ title, description, task, reward, status, acceptedAt, completedAt, claimedAt }) =>
        ({ title, description, task, reward, status, acceptedAt, completedAt, claimedAt })),
      capabilities: mazeCapabilities(), ...projection.value },
    metrics: { reads, stats: projection.stats,
      frameBytes: [projection.value.actor, ...Object.values(projection.value.scopes).flat()]
        .map(frame => new TextEncoder().encode(JSON.stringify(frame)).byteLength) },
  };
}
