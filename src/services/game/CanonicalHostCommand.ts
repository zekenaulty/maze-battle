import type { executeCanonical } from '../../persistence/canonical/transaction';
import type { CanonicalRequest, Json } from '../../persistence/canonical/types';
import { request as validateRequest } from '../../persistence/canonical/validation';

export type CanonicalCommit = Awaited<ReturnType<typeof executeCanonical>>;
type Executor = (request: CanonicalRequest, options: { signal: AbortSignal }) => Promise<CanonicalCommit>;
/** Trusted application code only. The executor is not a provider tool or an authorization grant. */
export type CanonicalHostCommand = (
  | { kind: 'fresh'; operation: string; input: Json }
  | { kind: 'retry'; request: CanonicalRequest }
) & { execute: Executor; signal?: AbortSignal };

export interface CanonicalHostPort {
  readonly hostSignal: AbortSignal;
  submitHostCommand(command: CanonicalHostCommand): Promise<CanonicalCommit['receipt']>;
}

/** Capture before queueing, including an exact retry's original fence and deadline. */
export function captureHostCommand(command: CanonicalHostCommand): CanonicalHostCommand {
  const execute = command.execute, signal = command.signal;
  if (typeof execute !== 'function') throw new Error('Missing canonical host executor');
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error('Invalid host lifetime');
  if (command.kind === 'retry') return { kind: 'retry', request: validateRequest(command.request), execute, signal };
  if (command.kind !== 'fresh' || typeof command.operation !== 'string') throw new Error('Invalid canonical host command');
  return { kind: 'fresh', operation: command.operation, input: structuredClone(command.input), execute, signal };
}
