import * as navigation from '../../src/persistence/canonical/navigation/commands';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { readFrontiers, isCurrentFrontier, frontierSelection, type FrontierSelection } from '../../src/persistence/canonical/knowledge/frontiers';
import * as roster from './canonical-roster-fixture';
import * as content from './canonical-content-fixture';
import * as knowledge from './canonical-knowledge-fixture';
import { worldRequest as command } from './canonical-world-fixture';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { MIN_TERMINAL_BYTES, type Json } from '../../src/persistence/canonical/types';
import { DIRECTIONS } from '../../src/persistence/canonical/knowledge/types';
import { REGION_WORK_LIMITS, readKnowledgeRegion } from '../../src/persistence/canonical/knowledge/region';
import { worldBlockKey } from '../../src/persistence/canonical/knowledge/worldIndex';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { json, same } from '../../src/persistence/canonical/world/records';
import { movePosition } from '../../src/domain/maze/movement';
import type { DestinationLimits } from '../../src/domain/directed/destinationLimits';
import { dump, query, current, refusal, knowledgeOnly } from './canonical-frontier.support';

async function seed() {
  await roster.seed('manual'); await content.prepare();
  const beforeLook = (await reader.readCanonicalHead()).head;
  await knowledge.act({ kind: 'look' });
  const sight = (await knowledge.current()).value, page = await query();
  if (!page.value.length) throw Error('Generated cold fixture has no earned nonzero frontier');
  return { beforeLook, sight, page };
}
async function admitBinding(binding: Json, id = crypto.randomUUID()) {
  const request = command((await reader.readCanonicalHead()).head, 'operation.admit', { operationId: id, binding, terminalBytes: MIN_TERMINAL_BYTES });
  return { id, request, outcome: await navigation.executeNavigationCommand(request) };
}
function admit(selection: FrontierSelection, limits?: DestinationLimits) {
  return admitBinding(json(navigation.createFrontierBinding(selection, limits)));
}
async function advance(id: string) {
  const state = await navigation.readDestination(id), request = command(state.head, 'navigation.advance', { operationId: id, sequence: state.value.progress.sequence });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function finish(id: string) {
  for (let i = 0; i < 32; i++) {
    const state = await navigation.readDestination(id);
    if (state.value.status !== 'running') return state;
    await advance(id);
  }
  throw Error('Frontier fixture exceeded its bounded approach window');
}
async function settle(id: string) {
  const state = await navigation.readDestination(id), request = command(state.head, 'operation.settle', {
    operationId: id, disposition: state.value.status === 'arrived' ? 'completed' : 'blocked' });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function acknowledge(id: string, terminalAttemptId: string) {
  return transaction.operateCanonical(command((await reader.readCanonicalHead()).head, 'operation.acknowledge', { operationId: id, terminalAttemptId }), 'acknowledge');
}
async function effects() {
  const state = (await roster.read()).value.state;
  return { party: state.party, inventory: state.inventory, stash: state.stash, targets: await content.targets() };
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5290') throw Error('Isolated frontier fixture only');
const api = { ...navigation, ...transaction, ...reader, readFrontiers, isCurrentFrontier, frontierSelection, roster, content, knowledge, command, openCanonicalDatabase,
  seed, admitBinding, admit, advance, finish, settle, acknowledge, effects, dump, query, current, refusal, knowledgeOnly,
  DIRECTIONS, MIN_TERMINAL_BYTES, REGION_WORK_LIMITS, readKnowledgeRegion, worldBlockKey, gameCheckpoint, json, same, movePosition };
declare global { interface Window { canonicalFrontier: typeof api } }
window.canonicalFrontier = api;
