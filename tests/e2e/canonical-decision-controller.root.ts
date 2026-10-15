import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readLaunchTerminal } from '../../src/persistence/canonical/agentica/launch.terminal';
import { launchAcknowledgement } from '../../src/persistence/canonical/agentica/launch.ack';
import { captureLaunchAdmission } from '../../src/persistence/canonical/agentica/launch.service';
import { launchEntryFixture, launchTerminalFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { readCanonical } from '../../src/persistence/canonical/read';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import type { CanonicalRecoveryPort } from '../../src/services/game/CanonicalHostRecovery';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';

/** Synthetic service evidence, but real funded GameSession cleanup and retained ACK sources. */
export function createControllerRootRecovery(port: CanonicalRecoveryPort & Pick<CanonicalHostPort, 'hostSignal'>, guardId: string) {
  async function current() {
    const { head, value: launch } = await readLaunch();
    if (!launch || launch.guard.id !== guardId) throw Error('Fixture root launch changed');
    return { head, launch };
  }
  async function entry(reason: 'stopped' | 'interrupted' = 'stopped') {
    const { launch } = await current();
    if (!launch.dispatch || !launch.run) throw Error('Fixture root requires an announced durable start');
    const admission = launch.run.value.data.admission;
    const raw = launchEntryFixture(launch.binding.start, launch.dispatch.source.attemptId, admission.runId, admission.manifestHash);
    if (canonicalJson(captureLaunchAdmission(raw, launch.binding.start, launch.dispatch.source.attemptId).admission) !== canonicalJson(admission))
      throw Error('Fixture root service evidence differs from retained admission');
    return launchTerminalFixture(raw, reason);
  }
  async function stop() {
    const { launch } = await current(), guard = launch.guard;
    const original = guard.terminal ? (await readLaunchTerminal(launch.binding.launchId)).value.terminal.source : null;
    return port.cleanupHostOperation(original ? { kind: 'retry', request: original } : { kind: 'cancel',
      target: { generation: guard.generation, gameId: guard.gameId, operationId: guard.id } }, port.hostSignal);
  }
  async function acknowledge(input: unknown, retry?: CanonicalRequest) {
    const captured = structuredClone(input), request = retry && structuredClone(retry), { launch } = await current();
    const checked = launchAcknowledgement(launch.binding.launchId, captured), args = await checked.prepare();
    return port.cleanupHostOperation(request ? { kind: 'verified-retry', request, verify: checked.verify }
      : { kind: 'verified-ack', ...args, verify: checked.verify }, port.hostSignal);
  }
  async function state() {
    const { head, launch } = await current(), id = launch.guard.acknowledgementAttemptId;
    const acknowledgement = id ? (await readCanonical(p => p.sourceReceipt(id))).value : null;
    return { head, launch, acknowledgement };
  }
  return { entry, stop, acknowledge, state };
}
