import * as navigation from '../../src/persistence/canonical/navigation/commands';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { planLocalExploration, planScopedApproach } from '../../src/persistence/canonical/navigation/explorationPlan';
import { findKnownRoute } from '../../src/persistence/canonical/knowledge/navigation';
import { readKnowledgeRegion, REGION_WORK_LIMITS } from '../../src/persistence/canonical/knowledge/region';
import { MIN_TERMINAL_BYTES } from '../../src/persistence/canonical/types';
import { json, same } from '../../src/persistence/canonical/world/records';
import type { DestinationLimits } from '../../src/domain/directed/destinationLimits';
import { worldRequest as command } from './canonical-world-fixture';
import { dump, knowledgeOnly, query, refusal } from './canonical-frontier.support';
import { read as roster } from './canonical-roster-fixture';
import { seedPrefixScene as seed } from './canonical-exploration-prefix.fixture';
import { auditRequiredSources } from './canonical-exploration-prefix.audit';
import { cleanupBudgetFailure } from './canonical-exploration-prefix.cleanup';
import { rejectObservationProof } from './canonical-exploration-prefix.atomic';
import { rejectMemoryProof } from './canonical-exploration-prefix.memory-atomic';

async function admit(limits: DestinationLimits) {
  const frontiers = await query(), actor = gameCheckpoint(frontiers.head.checkpoint).position;
  // Only current public frontiers and actor identity select the grant. No seed, goal or oracle input.
  const selection = frontiers.value.find(f => f.at.level === actor.level && f.at.cell.spaceId === actor.cell.spaceId);
  if (!selection) throw Error('No earned same-space frontier');
  const id = crypto.randomUUID(), binding = navigation.createExplorationBinding(selection, limits);
  const request = command(frontiers.head, 'operation.admit', { operationId: id, binding: json(binding), terminalBytes: MIN_TERMINAL_BYTES });
  const outcome = await navigation.executeNavigationCommand(request), state = await navigation.readDestination(id);
  return { id, frontiers, selection, request, outcome, state };
}
async function advance(id: string) {
  const state = await navigation.readDestination(id);
  const request = command(state.head, 'navigation.advance', { operationId: id, sequence: state.value.progress.sequence });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function capture(id: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw Error('Invalid prefix pulse bound');
  const rows = [];
  for (let n = 0; n < count; n++) {
    const before = await navigation.readDestination(id);
    if (before.value.status !== 'running') break;
    const step = await advance(id); rows.push({ step, state: await navigation.readDestination(id) });
  }
  return rows;
}
async function survey() {
  const accesses: string[] = [];
  const result = await reader.readCanonical(async (raw, snapshot) => {
    const pages = knowledgeOnly(raw, accesses), checkpoint = gameCheckpoint(snapshot.checkpoint);
    const plan = await planLocalExploration(pages, checkpoint, checkpoint.position.cell.spaceId);
    if (!plan) throw Error('No earned survey target');
    const region = await readKnowledgeRegion(pages, checkpoint, plan.window);
    const target = region.cells.find(c => same(c.cell.at, plan.target));
    if (!target) throw Error('Selected target lacks earned evidence');
    const full = findKnownRoute({ ...region, cells: region.cells.filter(c => c.cell.at.cell.spaceId === checkpoint.position.cell.spaceId) },
      checkpoint.position, target.cell.world, 512);
    return { plan, full };
  }, { limits: { ...REGION_WORK_LIMITS } });
  return { ...result, accesses };
}
async function refill(id: string) {
  const state = await navigation.readDestination(id), cursor = state.value.progress.exploration!;
  const accesses: string[] = [];
  const result = await reader.readCanonical((pages, snapshot) => planScopedApproach(knowledgeOnly(pages, accesses),
    gameCheckpoint(snapshot.checkpoint), cursor.target, cursor.window), { limits: { ...REGION_WORK_LIMITS } });
  return { ...result, accesses };
}
async function digest() {
  const bytes = new TextEncoder().encode(await dump());
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
async function effects() {
  const { state } = (await roster()).value;
  return { party: state.party, inventory: state.inventory, stash: state.stash };
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5418') throw Error('Isolated prefix fixture only');
const api = { ...navigation, ...transaction, ...reader, seed, admit, advance, capture, survey, refill, digest, effects, command, refusal,
  auditRequiredSources, cleanupBudgetFailure, rejectObservationProof, rejectMemoryProof };
declare global { interface Window { canonicalExplorationPrefix: typeof api } }
window.canonicalExplorationPrefix = api;
