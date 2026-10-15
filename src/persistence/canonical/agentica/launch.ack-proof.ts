import type { CanonicalOperation } from '../types';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { equal } from './validation';
import { validateLaunchAdmission, validateLaunchSettlement } from './launch.service';
import type { LaunchBinding, LaunchDispatch, LaunchRead, LaunchRun, LoadedLaunchRecord } from './launch.types';

export interface LaunchProofContext {
  binding: LaunchBinding; guard: CanonicalOperation;
  dispatch: LoadedLaunchRecord<LaunchDispatch> | null; run: LoadedLaunchRecord<LaunchRun> | null;
}
export function validateLaunchAckProof(launch: LaunchProofContext, input: unknown) {
  const p = fields(input, 'schema kind launchId admissionAttemptId dispatch admission terminal');
  check(p.schema === 1 && p.kind === 'launch-stop' && p.launchId === launch.binding.launchId
    && p.admissionAttemptId === launch.guard.admissionAttemptId && launch.guard.terminal?.disposition === 'cancelled', 'launch acknowledgement binding changed');
  check(equal(p.dispatch, launch.dispatch?.ref ?? null), 'launch acknowledgement dispatch changed');
  if (!launch.dispatch) check(p.admission === null && p.terminal === null, 'undispatched launch has remote settlement');
  else {
    const admission = validateLaunchAdmission(p.admission, launch.binding.start, launch.dispatch.source.attemptId);
    validateLaunchSettlement(p.terminal, admission);
    check(!launch.run || equal(admission, launch.run.value.data.admission), 'launch acknowledgement service identity changed');
  }
}
/** Replay/replacement checks validate the compact proof again, not merely the generic ACK flag. */
export async function validateLaunchAckHistory(pages: LaunchRead, launch: LaunchProofContext) {
  if (launch.guard.state !== 'acknowledged') return;
  const ack = await pages.sourceReceipt(launch.guard.acknowledgementAttemptId!);
  const args = fields(ack.source.input, 'operationId terminalAttemptId proof');
  check(ack.source.operation === 'operation.acknowledge' && args.operationId === launch.guard.id
    && args.terminalAttemptId === launch.guard.terminal?.attemptId, 'launch acknowledgement source changed');
  validateLaunchAckProof(launch, args.proof);
}
