import type { AgenticaStart } from '../../services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import { requireRpg, validateRpgBinding } from '../../services/agentica/rpg/validation';
import { boundedJson } from '../agenticaValidation';
import type { GameWrite } from '../gameTransaction';
import { checkHost, rpgAgenticaWrite, sealHost } from './transaction';
import type { HostDecisionAdoption, HostOperationEvent } from '../../services/agentica/sdk/agentica-host.mjs';

export interface RpgLaunch {
  version: 1; id: string; url: string; draft: RpgAgenticaBinding; request: AgenticaStart;
  stopped: boolean; sent: boolean; stopAcknowledged: boolean; binding?: RpgAgenticaBinding;
  operationId?: string; witness: string;
  wake?: { event: HostOperationEvent; draft: RpgAgenticaBinding; binding?: RpgAgenticaBinding;
    adoption?: HostDecisionAdoption; adoptedDraft?: RpgAgenticaBinding };
}
export const launchPointer = (gameId: string) => JSON.stringify(['rpg-agentica-launch', gameId]);
const key = (id: string) => JSON.stringify(['rpg-agentica-launch-record', id]);

export async function launchAt(tx: GameWrite, id: string) {
  const raw = await tx.objectStore('meta').get(key(id));
  if (!raw) return;
  const value: RpgLaunch = JSON.parse(raw.value); checkHost(value); validateRpgBinding(value.draft);
  requireRpg(value.version === 1 && value.id === id && typeof value.stopped === 'boolean'
    && typeof value.sent === 'boolean' && typeof value.stopAcknowledged === 'boolean', 'invalid launch record');
  if (value.binding) validateRpgBinding(value.binding);
  if (value.wake) {
    validateRpgBinding(value.wake.draft); if (value.wake.binding) validateRpgBinding(value.wake.binding);
    if (value.wake.adoptedDraft) validateRpgBinding(value.wake.adoptedDraft);
    requireRpg(!!value.wake.adoption === !!value.wake.adoptedDraft, 'incomplete decision adoption');
  }
  return value;
}
export async function putLaunch(tx: GameWrite, value: Omit<RpgLaunch, 'witness'> | RpgLaunch) {
  const { witness: _witness, ...body } = value as RpgLaunch;
  const sealed = sealHost(body);
  await tx.objectStore('meta').put({ key: key(value.id), value: JSON.stringify(sealed) });
  return sealed;
}
export function readRpgLaunch(gameId: string) {
  return rpgAgenticaWrite(async tx => { const id = (await tx.objectStore('meta').get(launchPointer(gameId)))?.value;
    return id ? launchAt(tx, id) : undefined; });
}
export function markRpgLaunch(id: string, patch: { sent?: true; stopped?: true; stopAcknowledged?: true }) {
  const input = structuredClone(patch);
  requireRpg(Object.keys(input).every(k => ['sent', 'stopped', 'stopAcknowledged'].includes(k))
    && Object.values(input).every(v => v === true), 'invalid launch transition');
  return rpgAgenticaWrite(async tx => {
    const launch = await launchAt(tx, id); requireRpg(launch, 'missing original launch');
    requireRpg(!input.sent || !launch.stopped, 'launch was stopped before dispatch');
    requireRpg(!input.stopAcknowledged || launch.stopped || input.stopped, 'stop was not requested');
    return putLaunch(tx, { ...launch, ...input });
  });
}

/** Service identity survives cancellation or local binding failure; it is not fresh effect authority. */
export function announceRpgLaunch(id: string, binding: RpgAgenticaBinding) {
  validateRpgBinding(binding); const input = structuredClone(binding);
  return rpgAgenticaWrite(async tx => {
    const launch = await launchAt(tx, id); requireRpg(launch, 'missing launch');
    const { runId: _runId, manifestHash: _hash, ...expected } = launch.wake?.adoptedDraft ?? launch.wake?.draft ?? launch.draft;
    const { runId: _newId, manifestHash: _newHash, ...actual } = input;
    requireRpg(boundedJson(actual) === boundedJson(expected), 'service changed launch scope');
    const previous = launch.wake ? launch.wake.binding : launch.binding;
    requireRpg(!previous || boundedJson(previous) === boundedJson(input), 'original launch identity changed');
    return putLaunch(tx, launch.wake ? { ...launch, wake: { ...launch.wake, binding: input } } : { ...launch, binding: input });
  });
}
export async function launchForRun(tx: GameWrite, binding: RpgAgenticaBinding) {
  const id = (await tx.objectStore('meta').get(launchPointer(binding.gameId)))?.value;
  const launch = id ? await launchAt(tx, id) : undefined;
  return launch?.binding?.runId === binding.runId ? launch : undefined;
}
export async function stopStatus(tx: GameWrite, runId: string) {
  return (await tx.objectStore('meta').get(JSON.stringify(['rpg-agentica-stopped-run', runId])))?.value === 'true';
}
export function stopRpgRun(runId: string) {
  return rpgAgenticaWrite(tx => tx.objectStore('meta').put({ key: JSON.stringify(['rpg-agentica-stopped-run', runId]), value: 'true' }));
}
