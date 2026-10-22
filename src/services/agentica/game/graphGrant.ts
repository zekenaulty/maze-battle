import type { AgenticaAction, AgenticaCapability } from '../contracts';
import { check } from '../../../persistence/canonical/validation';
import { inspectArgs } from './validation';

/** A newer adapter cannot expand the schema retained by the original launch. */
export function assertGraphGrant(capability: AgenticaCapability, args: AgenticaAction['arguments']) {
  const fields = capability.inputSchema.fields;
  check(fields.find(f => f.name === 'scope' && f.type === 'string')?.allowedValues?.includes(args.scope as string),
    'connection inspection was not granted');
  // Malformed input takes the dispatcher's retained refusal path, never a query.
  try { inspectArgs(args); } catch { return; }
  check(fields.every(f => !f.required || Object.hasOwn(args, f.name)), 'required connection arguments were not granted');
  for (const [name, value] of Object.entries(args)) {
    const field = fields.find(f => f.name === name);
    check(field && (field.type === 'string'
      ? typeof value === 'string' && (field.allowedValues === undefined || field.allowedValues.includes(value))
      : typeof value === 'number' && Number.isSafeInteger(value)
        && (field.minimum === undefined || value >= field.minimum) && (field.maximum === undefined || value <= field.maximum)),
    'connection query argument was not granted');
  }
}
