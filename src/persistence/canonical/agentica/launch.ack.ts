import type { AcknowledgementVerifier } from '../acknowledgement';
import { MAX_ACK_PROOF_BYTES } from '../operationValidation';
import { readCanonical } from '../read';
import { fields } from '../roster/codec';
import type { JsonObject } from '../types';
import { check, jsonBytes } from '../validation';
import { loadLaunch } from './launch.read';
import { validateLaunchAckProof } from './launch.ack-proof';
import { captureLaunchAdmission } from './launch.service';
import { equal, snapshotJson } from './validation';

type Launch = Awaited<ReturnType<typeof loadLaunch>>;
function proofFor(launch: Launch, entry: unknown) {
  check(launch.guard.ackPolicy === 'verified-host' && launch.guard.terminal?.disposition === 'cancelled', 'launch lacks a funded verified Stop');
  const remote = launch.dispatch ? captureLaunchAdmission(entry, launch.binding.start, launch.dispatch.source.attemptId) : null;
  check(launch.dispatch ? remote?.stopRequested && remote.terminal : entry === null, 'start has not settled');
  const proof = snapshotJson({ schema: 1, kind: 'launch-stop', launchId: launch.binding.launchId,
    admissionAttemptId: launch.guard.admissionAttemptId, dispatch: launch.dispatch?.ref ?? null,
    admission: remote?.admission ?? null, terminal: remote?.terminal ?? null }) as unknown as JsonObject;
  validateLaunchAckProof(launch, proof); jsonBytes(proof, MAX_ACK_PROOF_BYTES); return proof;
}
/** No network or ordinary writes in the verifier. Unknown or still-running starts retain their reservation. */
export function launchAcknowledgement(launchId: string, input: unknown | null) {
  const entry = snapshotJson(input, 16 * 1024);
  const verify: AcknowledgementVerifier = async (pages, request) => {
    const launch = await loadLaunch(pages, launchId), args = fields(request.input, 'operationId terminalAttemptId proof');
    check(args.operationId === launch.guard.id && args.terminalAttemptId === launch.guard.terminal?.attemptId
      && equal(args.proof, proofFor(launch, entry)), 'launch acknowledgement target or proof changed');
  };
  return { verify, async prepare() {
    return (await readCanonical(async pages => {
      const launch = await loadLaunch(pages, launchId), proof = proofFor(launch, entry);
      return { target: { generation: launch.guard.generation, gameId: launch.guard.gameId, operationId: launch.guard.id },
        terminalAttemptId: launch.guard.terminal!.attemptId, proof };
    })).value;
  } };
}
