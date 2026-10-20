// @vitest-environment node
import { expect, it } from 'vitest';
import { pendingRecoveryEntry } from './pendingRecovery.wire';
import { cap, noEffect, pendingAction, remoteEntry } from './pendingRecovery.test-support';

it('recovers the exact eight-field inspection capability including quest selectors', () => {
  expect(cap.inputSchema.fields).toHaveLength(8);
  const entry = remoteEntry(true);
  expect(pendingRecoveryEntry(entry, pendingAction, 'objective', cap, noEffect, true))
    .toEqual({ requestHash: entry.requestHash, capabilityHash: entry.capabilityHash });
});

it('refuses a ninth inspection field even when both supplied descriptors match', () => {
  const entry = remoteEntry();
  entry.capability.inputSchema.fields.push({ name: 'ungranted', type: 'string', required: false });
  expect(() => pendingRecoveryEntry(entry, pendingAction, 'objective', entry.capability, noEffect))
    .toThrow('invalid recovery capability fields');
});

it('does not extend other capability schemas beyond six fields', () => {
  const entry = remoteEntry();
  entry.capability.id = 'maze.observe'; entry.request.capabilityId = 'maze.observe';
  entry.capability.inputSchema.fields.length = 7;
  expect(() => pendingRecoveryEntry(entry, entry.request, 'objective', entry.capability, noEffect))
    .toThrow('invalid recovery capability fields');
});

it('does not silently grant changed quest scope choices during recovery', () => {
  const entry = remoteEntry();
  entry.capability.inputSchema.fields.find(field => field.name === 'scope')!.allowedValues!.push('hidden-quests');
  expect(() => pendingRecoveryEntry(entry, pendingAction, 'objective', cap, noEffect))
    .toThrow('binding changed');
});
