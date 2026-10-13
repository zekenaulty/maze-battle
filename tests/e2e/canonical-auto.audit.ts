import { readCanonical } from '../../src/persistence/canonical/read';
import { loadWorldQuality } from '../../src/persistence/canonical/world/quality';
import { required } from '../../src/persistence/canonical/world/records';
import { loadRoomContent, loadChest, loadContract, loadAcceptedQuest } from '../../src/persistence/canonical/content/records';
import type { ModuleJoin } from '../../src/domain/expedition/topology/modules/types';

/** Post-run test oracle: sequential one-room reads, never imported by the Auto planner. */
export async function auditAutoCompletion() {
  const { value: proof, snapshot } = await readCanonical(p => loadWorldQuality(p, 1));
  if (proof.status !== 'qualified' || proof.metrics?.reachable !== proof.binding.roomCount) throw Error('Fixture reachability is not qualified');
  if (proof.binding.roomCount > 16) throw Error('Auto oracle room budget exceeded');
  const rooms = [];
  for (let ordinal = 0; ordinal < proof.binding.roomCount; ordinal++) {
    rooms.push((await readCanonical(async p => {
      const spaceId = ordinal === 0 ? 'entry' : (await required<{ join: ModuleJoin }>(p, `dungeon/1/join/socket-${ordinal - 1}`)).join.toRoomId;
      const content = await loadRoomContent(p, 1, spaceId);
      const chest = content.chestId ? (await loadChest(p, 1, content.chestId)).chest : null;
      const contract = content.contractId ? await loadContract(p, content.contractId) : null;
      const quest = contract ? (await loadAcceptedQuest(p, contract))?.quest : undefined;
      return { spaceId, chest: chest && { id: chest.id, opened: chest.opened }, contract: contract && {
        id: contract.contract.id, objective: contract.contract.objective, accepted: contract.accepted,
        status: quest?.status ?? null, progress: quest?.task.progress ?? 0, required: quest?.task.required ?? contract.contract.task.required,
      } };
    }, { snapshot })).value);
  }
  return { reachable: proof.metrics.reachable, rooms };
}
