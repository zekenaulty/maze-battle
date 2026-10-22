import type { AgenticaAction, AgenticaCapability } from '../contracts';
import { check } from '../../../persistence/canonical/validation';
import { inspectArgs } from './validation';

/** A newer adapter cannot expand the schema retained by the original launch. */
export function assertGraphGrant(capability: AgenticaCapability, args: AgenticaAction['arguments'], defaults?: { level: number; spaceId: string }) {
  const fields = capability.inputSchema.fields;
  check(fields.find(f => f.name === 'scope' && f.type === 'string')?.allowedValues?.includes(args.scope as string),
    'connection inspection was not granted');
  // Malformed input takes the dispatcher's retained refusal path, never a query.
  try { inspectArgs(args); } catch { return; }
  check(fields.every(f => !f.required || Object.hasOwn(args, f.name)), 'required connection arguments were not granted');
  const values = { ...args };
  // Optional room selectors still constrain their implicit current-room values when narrowed by the owner.
  if (args.scope === 'connections' && defaults) for (const name of ['level', 'spaceId'] as const)
    if (values[name] === undefined && fields.some(f => f.name === name)) values[name] = defaults[name];
  for (const [name, value] of Object.entries(values)) {
    const field = fields.find(f => f.name === name);
    check(field && (field.type === 'string'
      ? typeof value === 'string' && (field.allowedValues === undefined || field.allowedValues.includes(value))
      : typeof value === 'number' && Number.isSafeInteger(value)
        && (field.minimum === undefined || value >= field.minimum) && (field.maximum === undefined || value <= field.maximum)),
    'connection query argument was not granted');
  }
}
