import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { readKnownCells } from '../../src/persistence/canonical/knowledge/queries';
import { observePosition } from '../../src/persistence/canonical/knowledge/observe';
import { REGION_WORK_LIMITS } from '../../src/persistence/canonical/knowledge/region';
import { loadWorldIndexBlock, worldBlockKey } from '../../src/persistence/canonical/knowledge/worldIndex';
import type { KnowledgeRead } from '../../src/persistence/canonical/knowledge/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { jsonBytes } from '../../src/persistence/canonical/validation';
import { compareExplorationObservation } from '../../src/persistence/canonical/knowledge/explorationPolicy';

// Diagnostic only: existing public cell-query validation, not a replacement material
// comparison. It computes a lower bound with perfect per-key/witness memoization.
export function auditRequiredSources(next: WorldPosition) {
  return readCanonical(async (raw, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint);
    const prospective = await observePosition(raw, next);
    const records = new Map<string, Awaited<ReturnType<KnowledgeRead['get']>>>();
    const witnesses = new Map<string, string | null>(), attempts: string[] = [];
    const pages: KnowledgeRead = {
      async get(area, key) {
        if (area !== 'knowledge') throw Error('Diagnostic source validation attempted hidden read');
        attempts.push(key);
        if (!records.has(key)) records.set(key, await raw.get(area, key));
        return structuredClone(records.get(key));
      },
      async witness(area, prefix) {
        if (area !== 'knowledge') throw Error('Diagnostic source witness attempted hidden read');
        if (!witnesses.has(prefix)) witnesses.set(prefix, await raw.witness(area, prefix));
        return witnesses.get(prefix)!;
      },
      async scan() { throw Error('Diagnostic must not scan'); },
    };
    const { sequence, id } = checkpoint.knowledge!;
    const current = await loadObservation(pages, { sequence, id });
    const spatial = new Set<string>();
    for (const cells of [current.cells, prospective]) {
      for (let i = 0; i < cells.length; i += 64) await readKnownCells(pages, checkpoint, cells.slice(i, i + 64).map(c => c.at));
      for (const cell of cells) {
        const key = worldBlockKey(cell.at.level, cell.world);
        if (!spatial.has(key)) { await loadWorldIndexBlock(pages, cell.at.level, cell.world); spatial.add(key); }
      }
    }
    const keys = [...records.keys()], observationKeys = keys.filter(key => key.startsWith('perception/observation/'));
    let comparisonReads = 0, comparisonBytes = 0;
    const counted = <T>(value: T) => { comparisonReads++; comparisonBytes += value === undefined ? 0 : jsonBytes(value); return value; };
    const material = await compareExplorationObservation({
      async get(area, key) { if (area !== 'knowledge') throw Error('Hidden comparison read'); return counted(await raw.get(area, key)); },
      async witness(area, prefix) { if (area !== 'knowledge') throw Error('Hidden comparison witness'); return counted(await raw.witness(area, prefix)); },
      async scan() { throw Error('Comparison must not scan'); },
    }, checkpoint, prospective, checkpoint.position.cell.spaceId);
    return { currentCells: current.cells.length, prospectiveCells: prospective.length,
      comparisonReads, comparisonBytes, material,
      uniqueRecords: records.size, uniqueWitnesses: witnesses.size, lowerBoundReads: records.size + witnesses.size,
      recordBytes: [...records.values()].reduce((n, row) => n + (row ? jsonBytes(row) : 0), 0),
      observationHeaders: observationKeys.filter(key => key.split('/').length === 3).length,
      observationChunks: observationKeys.filter(key => /\/\d+$/.test(key) && key.split('/').length === 4).length,
      observationManifests: observationKeys.filter(key => key.endsWith('/integrity')).length,
      memoryBlocks: keys.filter(key => key.startsWith('perception/cell/')).length,
      spatialReads: keys.filter(key => key.startsWith('perception/world/')).length,
      repeatedGetsAvoided: attempts.length - records.size, keys };
  }, { limits: { ...REGION_WORK_LIMITS } });
}
