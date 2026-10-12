import type { RpgAddress } from '../../domain/agentic/knowledge/types';
import { configuredDestinationLimits } from '../../config/directedTravel';
import type { AgenticaStart } from '../../services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import { rpgCapabilities } from '../../services/agentica/rpg/capabilities';
import { requireRpg, validateRpgBinding } from '../../services/agentica/rpg/validation';
import { rpgObservation } from '../../services/agentica/rpg/views';
import { fixtureUrl } from '../../services/agentica/clientPolicy';
import { currentGame, ACTIVE_TRAVEL } from '../rpgTravel/execute';
import { validateTravel } from '../rpgTravel/validation';
import { sameOwner, type SaveControl } from '../saveControl';
import { memoryInGameTransaction } from '../rpgMemory/access';
import { memoryBudget } from '../rpgMemory/budget';
import { cellMemoryKey } from '../rpgMemory/keys';
import { rpgAgenticaWrite } from './transaction';
import { ensureRpgScope } from './runs';
import { launchAt, launchPointer, putLaunch } from './launchRecords';
import { bindRpgQuest, rpgQuestStatus } from '../../services/agentica/rpg/quest';
import { samePosition } from '../../domain/maze/key';

export interface RpgLaunchOptions {
  url: string; target: RpgAddress; provider?: AgenticaStart['provider']; limits?: AgenticaStart['limits'];
  mode?: 'exploration' | 'quest'; questId?: string;
}
export async function prepareRpgLaunch(control: SaveControl, options: RpgLaunchOptions) {
  const owner = structuredClone(control), input = structuredClone(options), url = fixtureUrl(input.url);
  requireRpg(input.mode === undefined || input.mode === 'exploration' || input.mode === 'quest', 'invalid launch mode');
  requireRpg(input.mode === 'quest' || input.questId === undefined, 'quest requires retrieval mode');
  const scope = await ensureRpgScope(owner);
  return rpgAgenticaWrite(async tx => {
    const current = await currentGame(tx);
    requireRpg(current && sameOwner(current.control, owner) && current.control.revision === owner.revision
      && current.game.id === scope.gameId, 'launch checkpoint changed');
    requireRpg(current.game.mode === 'manual' && !current.game.battle && current.game.party.some(a => a.hp > 0), 'launch requires manual exploration');
    requireRpg(!current.game.randomBattles, 'Turn encounters off before noncombat Agentic Play.');
    const pointer = (await tx.objectStore('meta').get(launchPointer(scope.gameId)))?.value;
    const prior = pointer && await launchAt(tx, pointer);
    requireRpg(!prior || prior.stopped && (!prior.sent || prior.stopAcknowledged), 'Reconnect or stop the retained launch before creating another objective.');
    const activeId = (await tx.objectStore('meta').get(ACTIVE_TRAVEL))?.value;
    const active = activeId && await tx.objectStore('rpgTravels').get(activeId);
    requireRpg(!active || validateTravel(active, activeId!).gameId !== current.game.id || active.operation.status !== 'running', 'A retained journey must be cancelled before a new objective.');
    const slot = await tx.objectStore('saves').get('auto'), query = slot && await memoryInGameTransaction(tx, slot, memoryBudget());
    requireRpg(query && input.target.floor === current.game.dungeonLevel
      && await query.cell(await query.tree.get(cellMemoryKey(input.target)), input.target), 'Choose a destination the party has already observed.');
    const quest = input.mode === 'quest' ? bindRpgQuest(current.game, input.questId) : undefined;
    if (quest) requireRpg(samePosition(input.target, current.game.maze.start), 'Quest return must be the known floor entrance.');
    const draft: RpgAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scope.scopeId, scopeId: scope.scopeId,
      sessionEpoch: String(owner.epoch), perspectiveId: 'party', gameId: scope.gameId, floor: scope.floor,
      objectiveId: crypto.randomUUID(), objective: input.mode === 'quest'
        ? 'Retrieve the accepted quest collectible and return to the known entrance. Use scoped earned observations to choose exploration and travel. Explicitly open an observed chest at your location; arrival never interacts. Read quest.status for the carried item and return target. Only the host can prove completion from the saved quest, pack and return position.'
        : input.mode === 'exploration'
        ? 'Explore from earned observations. Query current frontiers, choose a bounded frontier approach, review newly revealed evidence and choose the next intention. Do not interact or collect. Arrival does not complete exploration.'
        : `Reach the known destination at floor ${input.target.floor}, row ${input.target.row}, column ${input.target.column}. Do not interact or collect.`,
      runId: 'pending-start', manifestHash: `sha256:${'0'.repeat(64)}`, control: owner,
      completionTarget: input.target, travelLimits: configuredDestinationLimits(), ...(input.mode ? { mode: input.mode } : {}),
      ...(quest ? { quest } : {}) };
    validateRpgBinding(draft);
    const request: AgenticaStart = { protocolVersion: 1, hostId: draft.hostId, sessionId: draft.sessionId, sessionEpoch: draft.sessionEpoch,
      scopeId: draft.scopeId, perspectiveId: 'party', objectiveId: draft.objectiveId, objective: draft.objective,
      observation: await rpgObservation(query, owner.revision, scope.scopeId), capabilities: rpgCapabilities(input.mode === 'quest' ? 'quest' : input.mode === 'exploration'),
      provider: input.provider ?? { provider: 'fixture', model: 'fixture-model', contextWindowTokens: 131072, maxOutputTokens: 4096 },
      limits: input.limits ?? { maxSteps: 16, maxRefinements: 8, maxPlanContinuations: 8, timeoutSeconds: 300, actionTimeoutSeconds: 45 } };
    if (quest) request.observation.data.quest = rpgQuestStatus(current.game, draft);
    const launch = await putLaunch(tx, { version: 1, id: crypto.randomUUID(), url, draft, request,
      stopped: false, sent: false, stopAcknowledged: false });
    await tx.objectStore('meta').put({ key: launchPointer(scope.gameId), value: launch.id });
    return launch;
  });
}
