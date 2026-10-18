// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgenticaCapability } from '../contracts';
import { mazeCapabilities } from './capabilities';
import { mazeManifestDigest } from './manifestDigest';
import { launchStart } from '../../../persistence/canonical/agentica/launch.wire';
import { launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';

function retainedThreeCapabilities() {
  const capabilities = mazeCapabilities().slice(0, 3);
  capabilities[0].description = 'Actor and earned sight source.';
  capabilities[1].description = 'Map lists rooms only. Cell requires all address fields. Room pages a 16x16 query window, not room bounds. Cursor continues the same query.';
  capabilities[2].description = 'Navigate to an earned local address; arrival does not interact.';
  capabilities[1].inputSchema.fields[0].allowedValues = ['room', 'map', 'cell'];
  return capabilities;
}

describe('capability-only pinned service digest', () => {
  it('hashes the current manifest without changing the caller input', async () => {
    const capabilities = mazeCapabilities(), before = structuredClone(capabilities);
    expect(await mazeManifestDigest(capabilities)).toBe('sha256:a62808cec9c3fe540352ce187ed95682fb3f1e4ee379bad1790b04506a5392b2');
    expect(capabilities).toEqual(before);
  });
  it('keeps retained three-capability roots exact without introducing explore authority', async () => {
    const capabilities = retainedThreeCapabilities();
    expect(await mazeManifestDigest(capabilities)).toBe('sha256:ce89f3ef265d785b00d5a5c7c8ab75c4addc1e933c644447f942f8653412edbf');
    expect(launchStart({ ...launchStartFixture(), capabilities }).capabilities).toEqual(capabilities);
    expect(capabilities.some(c => c.id === 'maze.explore')).toBe(false);
  });
  it('fits five capabilities and explicit interaction within the bounded start envelope', () => {
    const capabilities = mazeCapabilities(), start = { ...launchStartFixture(), capabilities };
    expect(launchStart(start)).toEqual(start);
    expect(new TextEncoder().encode(JSON.stringify(start)).length).toBeLessThanOrEqual(3584);
    expect(capabilities).toHaveLength(5);
    expect(capabilities[1].inputSchema.fields).toHaveLength(6);
    expect(capabilities[3]).toMatchObject({ kind: 'action', effect: 'writesLocalState', durableHandoff: true,
      inputSchema: { fields: [{ name: 'frontier', type: 'string', required: true },
        { name: 'mode', type: 'string', required: false, allowedValues: ['room'] }], allowAdditionalProperties: false } });
  });
  // Checked by manifest-digest/run-manifest-digest.ps1 against d65fb5b7 DLLs, not a copied service implementation.
  it.each([
    ['empty field description', '342afc377cabcd19f80b61cd3b179c883297005151ecae91aa41686e28344721',
      (c: AgenticaCapability[]) => { c[1].inputSchema.fields[0].description = ''; }],
    ['empty choices', '6d30118eb1fe2d76c5a4b95e470dca324b8ec95defce71fcba79f3839572c181',
      (c: AgenticaCapability[]) => { c[1].inputSchema.fields[0].allowedValues = []; }],
    ['zero bounds', '82b67d6b4ea0e0a4cabf2af767306aabd2af33f364f16eb4ab90fc9ee65b6e08',
      (c: AgenticaCapability[]) => { Object.assign(c[2].inputSchema.fields[0], { minimum: 0, maximum: 0 }); }],
    ['integer endpoints', 'd0ef759cf2225379e8f083e4ecbdb99c5cd7ee3588a690e4d7c4451554202baf',
      (c: AgenticaCapability[]) => { Object.assign(c[2].inputSchema.fields[0], { minimum: -2147483647, maximum: 2147483647 }); }],
    ['combined escaping', '11c68cc49da9929bb469663231af7534448566eb2de3069c49afbceacac4ad20',
      (c: AgenticaCapability[]) => { c[0].description = '"\\&\'<+>`\t\r\n' + String.fromCharCode(...Array.from({ length: 95 }, (_, i) => i + 32)); }],
  ] as const)('matches pinned .NET golden: %s', async (_, expected, change) => {
    const capabilities = retainedThreeCapabilities(); change(capabilities);
    expect(await mazeManifestDigest(capabilities)).toBe(`sha256:${expected}`);
  });
  it('uses ordinal object keys, independently of insertion order', async () => {
    const reverseKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(reverseKeys)
      : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, child]) => [k, reverseKeys(child)])) : v;
    expect(await mazeManifestDigest(reverseKeys(mazeCapabilities()) as AgenticaCapability[])).toBe(await mazeManifestDigest(mazeCapabilities()));
  });
  it('captures all input before yielding', async () => {
    const capabilities = mazeCapabilities(), expected = await mazeManifestDigest(capabilities);
    const pending = mazeManifestDigest(capabilities);
    capabilities[0].description = 'Changed after invocation';
    capabilities[1].inputSchema.fields.reverse();
    expect(await pending).toBe(expected);
    expect(await mazeManifestDigest(capabilities)).not.toBe(expected);
  });
  it.each([
    ['capability order', (c: AgenticaCapability[]) => c.reverse()],
    ['field order', (c: AgenticaCapability[]) => c[1].inputSchema.fields.reverse()],
    ['choice order', (c: AgenticaCapability[]) => c[1].inputSchema.fields[0].allowedValues!.reverse()],
    ['name', (c: AgenticaCapability[]) => { c[0].name += '!'; }],
    ['description', (c: AgenticaCapability[]) => { c[0].description += '!'; }],
    ['field description', (c: AgenticaCapability[]) => { c[1].inputSchema.fields[0].description = ''; }],
    ['empty choices versus null', (c: AgenticaCapability[]) => { c[1].inputSchema.fields[5].allowedValues = []; }],
    ['required', (c: AgenticaCapability[]) => { c[1].inputSchema.fields[0].required = false; }],
    ['minimum', (c: AgenticaCapability[]) => { c[2].inputSchema.fields[0].minimum = 0; }],
  ] as const)('preserves %s as digest input', async (_, change) => {
    const capabilities = mazeCapabilities(); change(capabilities);
    expect(await mazeManifestDigest(capabilities)).not.toBe(await mazeManifestDigest(mazeCapabilities()));
  });

  const invalid: [string, (c: AgenticaCapability[]) => void][] = [
    ['empty manifest', c => { c.length = 0; }],
    ['too many capabilities', c => { c.push(c[0]); }],
    ['duplicate capability', c => { c[1] = c[0]; }],
    ['unknown capability', c => { c[0].id = 'other.observe'; }],
    ['changed kind', c => { c[0].kind = 'action'; }],
    ['changed effect', c => { c[0].effect = 'writesLocalState'; }],
    ['missing handoff', c => { delete c[2].durableHandoff; }],
    ['missing explore handoff', c => { delete c[3].durableHandoff; }],
    ['read-only explore', c => { c[3].effect = 'readOnly'; }],
    ['query explore', c => { c[3].kind = 'query'; }],
    ['explicit false handoff', c => { c[0].durableHandoff = false; }],
    ['additional properties', c => { Object.assign(c[0].inputSchema, { allowAdditionalProperties: true }); }],
    ['duplicate field', c => { c[1].inputSchema.fields[1].name = 'scope'; }],
    ['too many fields', c => { c[1].inputSchema.fields.push(c[1].inputSchema.fields[0]); }],
    ['unsupported type', c => { Object.assign(c[1].inputSchema.fields[0], { type: 'number' }); }],
    ['missing required flag', c => { Reflect.deleteProperty(c[1].inputSchema.fields[0], 'required'); }],
    ['missing schema default', c => { Reflect.deleteProperty(c[0].inputSchema, 'allowAdditionalProperties'); }],
    ['unknown capability property', c => { Object.assign(c[0], { extra: null }); }],
    ['unknown field property', c => { Object.assign(c[1].inputSchema.fields[0], { example: null }); }],
    ['explicit null description', c => { Object.assign(c[1].inputSchema.fields[0], { description: null }); }],
    ['explicit undefined description', c => { Object.assign(c[1].inputSchema.fields[0], { description: undefined }); }],
    ['empty identity', c => { c[0].name = ' '; }],
    ['empty description', c => { c[0].description = ''; }],
    ['oversize description', c => { c[0].description = 'x'.repeat(513); }],
    ['oversize field description', c => { c[1].inputSchema.fields[0].description = 'x'.repeat(257); }],
    ['Unicode', c => { c[0].description = '\u00e9'; }],
    ['unpaired surrogate', c => { c[0].description = '\ud800'; }],
    ['unsupported control', c => { c[0].description = '\b'; }],
    ['DEL', c => { c[0].description = '\x7f'; }],
    ['newline identity', c => { c[0].name = 'Observe\n'; }],
    ['empty choice', c => { c[1].inputSchema.fields[0].allowedValues = ['']; }],
    ['too many choices', c => { c[1].inputSchema.fields[0].allowedValues = Array(17).fill('a'); }],
    ['integer choices', c => { c[2].inputSchema.fields[0].allowedValues = ['one']; }],
    ['string range', c => { c[1].inputSchema.fields[0].minimum = 1; }],
    ['fractional range', c => { c[2].inputSchema.fields[0].minimum = 0.5; }],
    ['negative zero', c => { c[2].inputSchema.fields[0].minimum = -0; }],
    ['out-of-subset integer', c => { c[2].inputSchema.fields[0].minimum = 2147483648; }],
    ['nonfinite range', c => { c[2].inputSchema.fields[0].minimum = Infinity; }],
    ['reversed range', c => { c[2].inputSchema.fields[0].maximum = 0; }],
    ['nonplain object', c => { Object.setPrototypeOf(c[0], { inherited: true }); }],
    ['sparse array', c => { delete c[1]; }],
    ['symbol property', c => { Object.assign(c[0], { [Symbol('hidden')]: true }); }],
    ['cycle', c => { Object.assign(c[0], { cycle: c }); }],
    ['oversize input', c => { c[0].description = 'x'.repeat(3073); }],
  ];
  it.each(invalid)('fails closed on %s', async (_, change) => {
    const capabilities = mazeCapabilities(); change(capabilities);
    await expect(mazeManifestDigest(capabilities)).rejects.toThrow();
  });
  it('rejects accessors without evaluating them', async () => {
    const capabilities = mazeCapabilities(); let called = false;
    Object.defineProperty(capabilities[0], 'description', { enumerable: true, get() { called = true; return 'unsafe'; } });
    await expect(mazeManifestDigest(capabilities)).rejects.toThrow();
    expect(called).toBe(false);
  });
});
