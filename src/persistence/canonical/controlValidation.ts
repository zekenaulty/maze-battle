import type { CanonicalRequest } from './types';
import { check, isObject, validId } from './validation';

export type ControlAction = 'stop' | 'takeover' | 'claim' | 'resume';
export interface ControlIntent { action: ControlAction; owner: string; recovery: boolean }

/** Recovery claim is an explicit host intent, never an automatic fallback for ordinary claim/resume. */
export function controlInput(request: CanonicalRequest, action: ControlAction): ControlIntent {
  check(['stop', 'takeover', 'claim', 'resume'].includes(action) && request.operation === `control.${action}`, 'invalid control action');
  const value = request.input;
  check(isObject(value) && validId(value.owner), 'invalid control owner');
  const recoveryClaim = action === 'claim' && value.recovery === true;
  check(Object.keys(value).sort().join(',') === (recoveryClaim ? 'owner,recovery' : 'owner'), 'invalid control fields');
  if (action === 'stop' || action === 'resume') check(value.owner === request.expected.owner, 'control owner mismatch');
  if (action === 'claim') check(value.owner !== request.expected.owner, 'claim requires a new owner');
  return { action, owner: value.owner, recovery: recoveryClaim || action === 'stop' || action === 'takeover' };
}
