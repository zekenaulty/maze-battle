import type { AgenticaCapability } from '../contracts';
import { fields } from '../../../persistence/canonical/roster/codec';
import { check, jsonBytes } from '../../../persistence/canonical/validation';
import { wireId } from '../../../persistence/canonical/agentica/validation';
import { MAX_LAUNCH_START_BYTES } from '../../../persistence/canonical/agentica/launch.types';

type WireValue = null | boolean | number | string | WireValue[] | { [key: string]: WireValue };
const escapes: Record<string, string> = {
  '\t': '\\t', '\n': '\\n', '\r': '\\r', '\\': '\\\\', '"': '\\u0022',
  '&': '\\u0026', "'": '\\u0027', '+': '\\u002B', '<': '\\u003C', '>': '\\u003E', '`': '\\u0060',
};
const quote = (value: string) => `"${value.replace(/[\t\n\r\\"&'+<>`]/g, c => escapes[c])}"`;

// Only constructed, validated manifest values reach this writer. Array order is significant.
function wireJson(value: WireValue): string {
  if (typeof value === 'string') return quote(value);
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(wireJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${quote(key)}:${wireJson(value[key])}`).join(',')}}`;
}
function ascii(value: unknown, maximum: number, identity = false): string {
  check(typeof value === 'string' && value.length <= maximum && !/[^\x20-\x7e\t\n\r]/.test(value),
    'unsupported manifest text; only ASCII and tab/CR/LF are supported');
  if (identity) wireId(value);
  return value;
}
function range(value: unknown): number | null {
  if (value === undefined) return null;
  check(typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 2147483647 && !Object.is(value, -0),
    'unsupported manifest range; require an integer within +/-2147483647, excluding negative zero');
  return value;
}
function materialize(input: AgenticaCapability): WireValue {
  const c = fields(input, 'id name description kind effect inputSchema', 'durableHandoff');
  check(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore', 'maze.interact'].includes(c.id as string), 'unsupported launch capability');
  const navigation = c.id === 'maze.navigate' || c.id === 'maze.explore' || c.id === 'maze.interact';
  check(c.kind === (navigation ? 'action' : 'query') && c.effect === (navigation ? 'writesLocalState' : 'readOnly')
    && (navigation ? c.durableHandoff === true : c.durableHandoff === undefined), 'invalid launch capability effect');
  const name = ascii(c.name, 128, true), description = ascii(c.description, 512);
  check(description.trim().length > 0, 'empty manifest description');
  const schema = fields(c.inputSchema, 'fields allowAdditionalProperties');
  check(schema.allowAdditionalProperties === false && Array.isArray(schema.fields) && schema.fields.length <= 6, 'invalid launch schema');
  const names = new Set<string>();
  const schemaFields = schema.fields.map(input => {
    const f = fields(input, 'name type required', 'description allowedValues minimum maximum');
    const fieldName = ascii(f.name, 128, true);
    check(!names.has(fieldName) && ['string', 'integer'].includes(f.type as string) && typeof f.required === 'boolean', 'invalid capability field');
    names.add(fieldName);
    let allowedValues: string[] | null = null;
    if (f.allowedValues !== undefined) {
      check(f.type === 'string' && Array.isArray(f.allowedValues) && f.allowedValues.length <= 16, 'invalid field choices');
      allowedValues = f.allowedValues.map(value => ascii(value, 128, true));
    }
    check(f.type === 'integer' || f.minimum === undefined && f.maximum === undefined, 'invalid field range type');
    const minimum = range(f.minimum), maximum = range(f.maximum);
    check(minimum === null || maximum === null || minimum <= maximum, 'invalid field range');
    return { name: fieldName, type: f.type, required: f.required,
      description: f.description === undefined ? null : ascii(f.description, 256),
      allowedValues, example: null, minimum, maximum };
  });
  // HostCapability omits false DurableHandoff; ToolInputField emits all five nullable fields.
  return { id: c.id, name, description, kind: c.kind, effect: c.effect,
    ...(navigation ? { durableHandoff: true } : {}), inputSchema: { fields: schemaFields, allowAdditionalProperties: false } };
}

/** Capability-only sha256 for pinned Agentica d65fb5b7, not proof of the full start request.
 * Supports the current launchStart shape, ASCII text and bounded integers only; fails closed otherwise.
 */
export async function mazeManifestDigest(capabilities: AgenticaCapability[]): Promise<string> {
  jsonBytes(capabilities, MAX_LAUNCH_START_BYTES);
  check(Array.isArray(capabilities) && capabilities.length > 0 && capabilities.length <= 5, 'invalid launch manifests');
  const manifest = capabilities.map(materialize);
  check(new Set(capabilities.map(c => c.id)).size === capabilities.length, 'duplicate launch capabilities');
  // Materialize and encode before the first await, so caller mutations cannot change this attempt.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(wireJson(manifest)));
  return `sha256:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
}
