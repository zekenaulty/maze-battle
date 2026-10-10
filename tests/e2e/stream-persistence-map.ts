import './stream-persistence-review';
import * as api from '../../src/persistence/streamMapRepository';
import { addressKey } from '../../src/domain/expedition/address';
import { traceMap } from './stream-map-trace';
import { topologyTransaction } from '../../src/persistence/topology/database';

const map = {
  api, trace: traceMap,
  async setup(extraPages = 30) {
    await window.stream.setup();
    const publicScopeId = await window.stream.api.ensureStreamPublicScope('stream');
    const { after } = await window.streamReview.firstCrossing();
    // Synthetic saved evidence tests listing growth without creating canonical rooms.
    await topologyTransaction(async tx => {
      const root = (await tx.get('roots', 'stream'))!;
      for (let index = 0; index < extraPages; index++) {
        const id = `saved-${String(index).padStart(4, '0')}`;
        const knowledge = structuredClone(after.room.knowledge!); knowledge.spaceId = id;
        for (const collection of ['cells', 'openings', 'frontiers', 'chests'] as const) {
          for (const entry of Object.values(knowledge[collection])) entry.spaceId = id;
        }
        knowledge.cells = Object.fromEntries(Object.values(knowledge.cells).map(cell => [addressKey(cell), cell]));
        await tx.put('streamKnowledge', ['stream', id], knowledge);
      }
      await tx.stageRoot('stream', root);
    });
    return { publicScopeId, checkpoint: after.checkpoint };
  },
};
declare global { interface Window { streamMap: typeof map } }
window.streamMap = map;
