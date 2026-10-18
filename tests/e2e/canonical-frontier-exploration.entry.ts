import * as navigation from '../../src/persistence/canonical/navigation/commands';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { destinationDisposition } from '../../src/persistence/canonical/navigation/types';
import { MIN_TERMINAL_BYTES } from '../../src/persistence/canonical/types';
import { json } from '../../src/persistence/canonical/world/records';
import type { FrontierSelection } from '../../src/persistence/canonical/knowledge/frontiers';
import type { DestinationLimits } from '../../src/domain/directed/destinationLimits';
import * as roster from './canonical-roster-fixture';
import * as content from './canonical-content-fixture';
import { worldRequest as command } from './canonical-world-fixture';
import { dump, refusal } from './canonical-frontier.support';
import { seedExplorationScene as seed } from './canonical-frontier-exploration.fixture';
import { readExplorationFrame as frame, explorationComparison, selectUnopenedObjectFrontier } from './canonical-frontier-exploration.evidence';

async function admit(selection: FrontierSelection, limits?: DestinationLimits) {
  const id = crypto.randomUUID(), binding = navigation.createExplorationBinding(selection, limits);
  const request = command((await reader.readCanonicalHead()).head, 'operation.admit',
    { operationId: id, binding: json(binding), terminalBytes: MIN_TERMINAL_BYTES });
  return { id, request, outcome: await navigation.executeNavigationCommand(request) };
}
async function advance(id: string) {
  const state = await navigation.readDestination(id);
  const request = command(state.head, 'navigation.advance', { operationId: id, sequence: state.value.progress.sequence });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function capture(id: string, maxPulses: number) {
  if (!Number.isInteger(maxPulses) || maxPulses < 1 || maxPulses > 64) throw Error('Invalid fixture pulse bound');
  const rows = [{ state: await navigation.readDestination(id), frame: await frame(), step: null as Awaited<ReturnType<typeof advance>> | null }];
  for (let n = 0; n < maxPulses && rows.at(-1)!.state.value.status === 'running'; n++) {
    const step = await advance(id);
    rows.push({ state: await navigation.readDestination(id), frame: await frame(), step });
  }
  return rows;
}
async function settle(id: string) {
  const state = await navigation.readDestination(id), disposition = destinationDisposition(state.value.progress);
  if (!disposition) throw Error('Cannot settle a running exploration');
  const request = command(state.head, 'operation.settle', { operationId: id, disposition });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function acknowledge(id: string, terminalAttemptId: string) {
  return transaction.operateCanonical(command((await reader.readCanonicalHead()).head,
    'operation.acknowledge', { operationId: id, terminalAttemptId }), 'acknowledge');
}
async function effects() {
  const state = (await roster.read()).value.state;
  return { party: state.party, inventory: state.inventory, stash: state.stash, targets: await content.targets() };
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5291') throw Error('Isolated exploration fixture only');
const api = { ...navigation, ...transaction, ...reader, seed, frame, admit, advance, capture, settle, acknowledge,
  effects, command, dump, refusal, selectUnopenedObjectFrontier,
  compare: (frames: Awaited<ReturnType<typeof frame>>[]) => frames.map(explorationComparison()) };
declare global { interface Window { canonicalFrontierExploration: typeof api } }
window.canonicalFrontierExploration = api;
