// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createLaunchBinding, launchBinding, launchGuardId } from './launch.validation';
import { launchStart, launchStarted } from './launch.wire';
import { launchStartFixture, launchStartedFixture } from './launch.test-support';

describe('bounded exact launch contracts', () => {
  const input = () => ({ launchId: 'launch', endpoint: 'ws://127.0.0.1:5000/host', publication: { key: 'agentica/publications/pub', id: 'pub' }, start: launchStartFixture() });
  it('owns exact start manifests and sources, without a new authority store or digest-only comparison', () => {
    const value = input(), binding = createLaunchBinding(value); value.start.capabilities[0].name = 'Changed'; value.publication.id = 'changed';
    expect(launchBinding(binding).start).toEqual(launchStartFixture()); expect(launchBinding(binding).publication.id).toBe('pub');
    expect(launchGuardId('launch')).toBe('agentica-launch:launch');
  });
  it.each(['ws://example.com/host', 'wss://user:secret@example.com/host', 'wss://example.com/?key=secret', 'https://example.com/host'])('rejects endpoint %s', endpoint => {
    expect(() => createLaunchBinding({ ...input(), endpoint })).toThrow();
  });
  it.each(['objective', 'capabilities', 'provider', 'limits', 'observation'])('rejects malformed %s', field => {
    expect(() => launchStart({ ...launchStartFixture(), [field]: null })).toThrow();
  });
  it('rejects excess payload, accessors, duplicate capabilities and invented effects', () => {
    const start = launchStartFixture(); start.observation.data.text = 'x'.repeat(3072); expect(() => launchStart(start)).toThrow('3072 bytes');
    const duplicate = launchStartFixture(); duplicate.capabilities.push(duplicate.capabilities[0]); expect(() => launchStart(duplicate)).toThrow('manifests');
    const effect = launchStartFixture(); effect.capabilities[0].effect = 'writesLocalState'; expect(() => launchStart(effect)).toThrow('effect');
    let reads = 0; const accessor = launchStartFixture(); Object.defineProperty(accessor, 'objective', { enumerable: true, get: () => { reads++; return 'x'; } });
    expect(() => launchStart(accessor)).toThrow(); expect(reads).toBe(0);
  });
  it.each(['sessionId', 'sessionEpoch', 'scopeId', 'objectiveId', 'manifestHash'])('validates announced %s', field => {
    const start = launchStartFixture(), run = launchStartedFixture(start); expect(launchStarted(run, start)).toEqual(run);
    expect(() => launchStarted({ ...run, [field]: 'changed' }, start)).toThrow();
  });
});
