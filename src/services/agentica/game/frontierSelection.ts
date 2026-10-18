import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { equal, snapshotReference } from '../../../persistence/canonical/agentica/validation';
import { frontierSelection, type FrontierSelection } from '../../../persistence/canonical/knowledge/frontiers';
import { fields } from '../../../persistence/canonical/roster/codec';
import { check, jsonBytes } from '../../../persistence/canonical/validation';
import { canonicalJson } from '../sdk/agentica-host.mjs';

// Both UTF-16 character count and UTF-8 envelope bytes are bounded; this is not an authority token.
export const MAX_FRONTIER_TOKEN_LENGTH = 2048;
export function encodeFrontier(publication: ProtocolRef, selection: FrontierSelection): string {
  const value = { schema: 1, publication: snapshotReference(publication), selection: frontierSelection(selection) };
  jsonBytes(value, MAX_FRONTIER_TOKEN_LENGTH);
  const token = canonicalJson(value);
  check(token.length <= MAX_FRONTIER_TOKEN_LENGTH, 'frontier token exceeds bound'); return token;
}
export function parseFrontier(input: unknown, publication: ProtocolRef): FrontierSelection {
  const expected = snapshotReference(publication);
  check(typeof input === 'string' && input.length <= MAX_FRONTIER_TOKEN_LENGTH, 'invalid frontier token');
  const parsed: unknown = JSON.parse(input); jsonBytes(parsed, MAX_FRONTIER_TOKEN_LENGTH);
  const value = fields(parsed, 'schema publication selection');
  const ref = snapshotReference(value.publication as unknown as ProtocolRef);
  check(value.schema === 1 && equal(ref, expected), 'stale or foreign frontier publication');
  return frontierSelection(value.selection);
}
