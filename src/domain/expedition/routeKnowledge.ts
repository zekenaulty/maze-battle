import { isRecord, knowledgeSignature, observedGraph, type KnowledgeKind, type ObservedGraph } from './explorationGraph';
import type { ExpeditionCheckpoint } from './types';

/**
 * Optional trusted-host optimization, NOT just visible observation keys. List every
 * changed/deleted record since fromRevision, including both learned door endpoints.
 * Omit after reload, missing receipts, or whenever complete coverage is uncertain.
 * An omitted key cannot be detected without a full audit; callers own this contract.
 */
export interface RouteKnowledgeChanges {
  fromRevision: number;
  cells: readonly string[];
  openings: readonly string[];
  chests: readonly string[];
}

export interface RoutePlannerWork {
  fullAudits: number;
  deltaAudits: number;
  recordsRead: number;
  graphBuilds: number;
  graphBuildRecords: number;
  plans: number;
  localSearches: number;
  localCellVisits: number;
  localNodesScanned: number;
  localCacheHits: number;
  portStates: number;
  reusedSteps: number;
  invalidations: number;
}

export function emptyRouteWork(): RoutePlannerWork {
  return { fullAudits: 0, deltaAudits: 0, recordsRead: 0, graphBuilds: 0, graphBuildRecords: 0,
    plans: 0, localSearches: 0, localCellVisits: 0, localNodesScanned: 0, localCacheHits: 0, portStates: 0, reusedSteps: 0, invalidations: 0 };
}

const kinds: readonly KnowledgeKind[] = ['cells', 'openings', 'chests'];
const signatures = () => ({ cells: new Map<string, string>(), openings: new Map<string, string>(), chests: new Map<string, string>() });

/** Bounded semantic snapshot. It owns copies, not references to mutable host records. */
export class RouteKnowledge {
  private signatures = signatures();
  private opened = new Set<string>();
  graph?: ObservedGraph;

  get recordCount() { return kinds.reduce((sum, kind) => sum + this.signatures[kind].size, 0); }

  clear() {
    this.signatures = signatures();
    this.opened.clear();
    this.graph = undefined;
  }

  sync(checkpoint: ExpeditionCheckpoint, maxRecords: number, work: RoutePlannerWork,
    changes?: RouteKnowledgeChanges, fromRevision?: number): boolean {
    const knowledge = checkpoint.knowledge;
    if (!isRecord(knowledge) || kinds.some(kind => !isRecord(knowledge[kind]))
      || !Array.isArray(checkpoint.openedChestIds)) throw new Error('Invalid observed knowledge.');
    const opened = new Set<string>();
    if (checkpoint.openedChestIds.length > maxRecords) throw new Error('Opened-ID budget exhausted.');
    for (const id of checkpoint.openedChestIds) {
      work.recordsRead++;
      if (typeof id !== 'string' || !id) throw new Error('Invalid opened chest IDs.');
      opened.add(id);
    }
    let changed = !this.graph || opened.size !== this.opened.size || [...opened].some(id => !this.opened.has(id));
    const incremental = Boolean(this.graph && changes && changes.fromRevision === fromRevision
      && checkpoint.revision === fromRevision + 1);
    if (incremental && changes) {
      work.deltaAudits++;
      for (const kind of kinds) {
        const keys = changes[kind];
        if (!Array.isArray(keys) || keys.length > maxRecords) throw new Error('Invalid complete change set.');
        for (const key of keys) {
          work.recordsRead++;
          if (typeof key !== 'string') throw new Error('Invalid changed record key.');
          if (!Object.prototype.hasOwnProperty.call(knowledge[kind], key)) {
            changed = this.signatures[kind].delete(key) || changed;
          } else {
            const signature = knowledgeSignature(kind, key, knowledge[kind][key]);
            if (signature === undefined) throw new Error('Corrupt observed record.');
            changed = this.signatures[kind].get(key) !== signature || changed;
            this.signatures[kind].set(key, signature);
          }
        }
      }
    } else {
      work.fullAudits++;
      const next = signatures();
      let count = 0;
      for (const kind of kinds) {
        for (const key in knowledge[kind]) {
          if (!Object.prototype.hasOwnProperty.call(knowledge[kind], key)) continue;
          if (++count > maxRecords) throw new Error('Known-record budget exhausted.');
          work.recordsRead++;
          const signature = knowledgeSignature(kind, key, knowledge[kind][key]);
          if (signature === undefined) throw new Error('Corrupt observed record.');
          changed = this.signatures[kind].get(key) !== signature || changed;
          next[kind].set(key, signature);
        }
        changed = next[kind].size !== this.signatures[kind].size || changed;
      }
      this.signatures = next;
    }
    if (this.recordCount > maxRecords) throw new Error('Known-record budget exhausted.');
    if (changed) {
      work.graphBuilds++;
      work.graphBuildRecords += this.recordCount;
      const graph = observedGraph(knowledge, opened);
      if (!graph) throw new Error('Empty, inconsistent, or corrupt observed graph.');
      // A complete change set must also cover deletions; record limits never authorize a hidden graph.
      if (graph.nodes.size > maxRecords) throw new Error('Known-cell budget exhausted.');
      this.graph = graph;
      this.opened = opened;
    }
    return changed;
  }
}
