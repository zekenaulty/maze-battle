// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { AgenticaCapability } from '../../../src/services/agentica/contracts';
import { mazeCapabilities } from '../../../src/services/agentica/game/capabilities';
import { mazeManifestDigest } from '../../../src/services/agentica/game/manifestDigest';
import { launchStart } from '../../../src/persistence/canonical/agentica/launch.wire';
import { launchStartFixture } from '../../../src/persistence/canonical/agentica/launch.test-support';

const probe = process.env.MAZE_MANIFEST_PROBE_DLL;
it.skipIf(!probe)('matches typed ProtocolValidation.Digest in the hash-checked pinned assemblies', async () => {
  const cases: { name: string; capabilities: AgenticaCapability[] }[] = [];
  const add = (name: string, change: (c: AgenticaCapability[]) => void = () => {}) => {
    const capabilities = mazeCapabilities(); change(capabilities);
    launchStart({ ...launchStartFixture(), capabilities });
    cases.push({ name, capabilities });
  };
  add('actual-maze-capabilities');
  add('reversed-object-keys', c => {
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
    c.splice(0, c.length, ...reverse(c) as AgenticaCapability[]);
  });
  add('reversed-capabilities', c => c.reverse());
  add('reversed-fields', c => c[1].inputSchema.fields.reverse());
  add('reversed-choices', c => c[1].inputSchema.fields[0].allowedValues!.reverse());
  add('empty-choices', c => { c[1].inputSchema.fields[0].allowedValues = []; });
  add('empty-field-description', c => { c[1].inputSchema.fields[0].description = ''; });
  add('negative-integer-bounds', c => { Object.assign(c[2].inputSchema.fields[0], { minimum: -2147483647, maximum: 2147483647 }); });
  add('zero-bounds', c => { Object.assign(c[2].inputSchema.fields[0], { minimum: 0, maximum: 0 }); });
  add('omitted-bounds', c => { delete c[2].inputSchema.fields[0].minimum; });
  add('observe-only', c => c.splice(1));
  add('navigate-only', c => c.splice(0, c.length, c[2]));
  add('explore-only', c => c.splice(0, c.length, c[3]));
  add('retained-three-capabilities', c => {
    c.splice(3);
    c[0].description = 'Actor and earned sight source.';
    c[1].description = 'Map lists rooms only. Cell requires all address fields. Room pages a 16x16 query window, not room bounds. Cursor continues the same query.';
    c[2].description = 'Navigate to an earned local address; arrival does not interact.';
    c[1].inputSchema.fields[0].allowedValues = ['room', 'map', 'cell'];
  });
  for (const code of [...Array.from({ length: 95 }, (_, i) => i + 32), 9, 10, 13]) {
    add(`ascii-${code}`, c => {
      const character = String.fromCharCode(code);
      c[0].description = `before${character}after${character}`;
      c[1].inputSchema.fields[0].description = `${character}field${character}`;
      if (code >= 32) {
        c[0].name = `Observe${character}`;
        c[1].inputSchema.fields[0].name = `scope${character}`;
        c[1].inputSchema.fields[0].allowedValues = [`a${character}b`, `${character}c`];
      }
    });
  }
  add('combined-escaping', c => { c[0].description = '"\\&\'<+>`\t\r\n' + String.fromCharCode(...Array.from({ length: 95 }, (_, i) => i + 32)); });
  const result = spawnSync('dotnet', [probe!], { input: JSON.stringify(cases), encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const proof = JSON.parse(result.stdout);
  expect(proof.commit).toBe('d65fb5b7a5d4895921f8854054215b1d6279852e');
  expect(proof.assemblies).toHaveLength(3);
  expect(proof.results).toHaveLength(cases.length);
  const typed = JSON.parse(proof.results[0].typedJson);
  expect(typed[0]).not.toHaveProperty('durableHandoff');
  expect(typed[2].durableHandoff).toBe(true);
  expect(typed[3].durableHandoff).toBe(true);
  expect(typed[3].inputSchema.fields).toEqual([{ name: 'frontier', type: 'string', required: true,
    description: null, allowedValues: null, example: null, minimum: null, maximum: null }]);
  expect(typed[1].inputSchema.fields[1]).toEqual({ name: 'level', type: 'integer', required: false,
    description: null, allowedValues: null, example: null, minimum: 1, maximum: null });
  for (const [i, item] of cases.entries()) {
    expect(proof.results[i].name).toBe(item.name);
    expect(await mazeManifestDigest(item.capabilities), item.name).toBe(proof.results[i].digest);
  }
  if (process.env.MAZE_MANIFEST_PROBE_EVIDENCE) writeFileSync(process.env.MAZE_MANIFEST_PROBE_EVIDENCE,
    JSON.stringify({ ...proof, cases: cases.length, matched: true, providerCalls: 0, serviceStarted: false }, null, 2));
  console.info(`${cases.length} pinned-assembly manifest comparisons passed; baseline ${proof.results[0].digest}`);
});
