import * as interaction from '../../src/persistence/canonical/interaction/commands';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { MIN_TERMINAL_BYTES } from '../../src/persistence/canonical/types';
import type { ContentCommand } from '../../src/persistence/canonical/content/types';
import { DIRECTIONS } from '../../src/persistence/canonical/knowledge/types';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { json, same } from '../../src/persistence/canonical/world/records';
import * as content from './canonical-content-fixture';
import * as roster from './canonical-roster-fixture';
import * as knowledge from './canonical-knowledge-fixture';
import { worldRequest as command } from './canonical-world-fixture';
import { dump, refusal } from './canonical-frontier.support';

type Options = NonNullable<Parameters<typeof interaction.executeInteractionCommand>[1]>;
async function seed(options: { accepted?: boolean; quota?: { limitBytes: number; reserveBytes: number } } = {}) {
  await roster.seed('manual', [], options.quota); await content.prepare();
  const target = (await content.targets()).find(t => t.chest && t.contract?.contract.objective === 'fetch');
  if (!target) throw Error('Generated content has no chest fetch quest');
  if (options.accepted !== false) await content.act({ kind: 'accept-quest', contractId: target.room.contractId! });
  const position = { level: 1, cell: { spaceId: target.room.spaceId, ...target.chest!.chest.position } };
  await content.place(position); await knowledge.act({ kind: 'look' });
  return { target, position, command: { kind: 'open-chest' as const, chestId: target.room.chestId! } };
}
async function snapshot() {
  return { roster: (await roster.read()).value, targets: await content.targets(), observation: (await knowledge.current()).value };
}
async function quest(id: string) {
  return (await reader.readCanonical(async p => content.records.loadAcceptedQuest(p, await content.records.loadContract(p, id)))).value;
}
async function admit(input: ContentCommand, options?: Options, verified = false) {
  const head = (await reader.readCanonicalHead()).head, id = crypto.randomUUID();
  const binding = interaction.createInteractionBinding(input, gameCheckpoint(head.checkpoint).position);
  const request = command(head, 'operation.admit', { operationId: id, binding: json(binding), terminalBytes: MIN_TERMINAL_BYTES,
    ...(verified ? { ackPolicy: 'verified-host' } : {}) });
  return { id, request, outcome: await interaction.executeInteractionCommand(request, options) };
}
async function applyRequest(id: string) {
  return command((await reader.readCanonicalHead()).head, 'interaction.apply', { operationId: id, sequence: 0 });
}
async function apply(id: string, options?: Options) {
  const request = await applyRequest(id);
  return { request, outcome: await interaction.executeInteractionCommand(request, options) };
}
async function settle(id: string, options?: Options) {
  const state = await interaction.readInteraction(id), disposition = state.value.progress.status === 'blocked' ? 'blocked' : 'decision';
  const request = command(state.head, 'operation.settle', { operationId: id, disposition });
  return { request, outcome: await interaction.executeInteractionCommand(request, options) };
}
async function cancel(id: string) {
  return transaction.operateCanonical(command((await reader.readCanonicalHead()).head, 'operation.cancel', { operationId: id }), 'cancel');
}
async function acknowledge(id: string, terminalAttemptId: string) {
  return transaction.operateCanonical(command((await reader.readCanonicalHead()).head, 'operation.acknowledge', { operationId: id, terminalAttemptId }), 'acknowledge');
}
async function moveAway() {
  const sight = (await knowledge.current()).value, actor = sight.cells.find(cell => same(cell.at, sight.header.actor))!;
  const direction = DIRECTIONS.find(d => actor.edges[d]);
  if (!direction) throw Error('Chest tile has no observed exit');
  return knowledge.act({ kind: 'move', direction, triggerStairs: false });
}
function host(fail = false, seen: unknown[] = []): NonNullable<Options['host']> {
  return { async prepare() {}, async commit(view) {
    const event = await view.appendExecution(`fixture/interaction/${view.request.attemptId}`, json({ progress: view.progress, checkpoint: view.checkpoint }));
    seen.push({ progress: view.progress, checkpoint: view.checkpoint, event });
    if (fail) throw Error('fixture interaction host refused after proof');
    return { event };
  } };
}
async function fillNormalCapacity() {
  for (const size of [60000, 4096, 1024]) for (let i = 0; i < 128; i++) {
    try { await transaction.executeCanonical(command((await reader.readCanonicalHead()).head, 'fixture.fill'), async tx => {
      await tx.pages.set('execution', 'fixture/interaction-padding', 'x'.repeat(size)); return null;
    }); } catch (cause) { if (!String(cause).includes('quota exhausted')) throw cause; break; }
  }
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5293') throw Error('Isolated interaction fixture only');
const api = { ...interaction, ...transaction, ...reader, seed, snapshot, quest, admit, applyRequest, apply, settle, cancel, acknowledge,
  moveAway, host, fillNormalCapacity, content, roster, knowledge, command, dump, refusal, gameCheckpoint, json };
declare global { interface Window { canonicalInteraction: typeof api } }
window.canonicalInteraction = api;
