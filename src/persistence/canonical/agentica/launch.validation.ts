import { fields } from '../roster/codec';
import type { JsonObject } from '../types';
import { check, validId } from '../validation';
import { snapshotJson, snapshotReference } from './validation';
import { launchStart } from './launch.wire';
import type { LaunchBinding } from './launch.types';

export function launchGuardId(id: string) { check(validId(id) && id.length <= 64, 'invalid launch ID'); return `agentica-launch:${id}`; }
export function launchSessionId(gameId: string, id: string) {
  launchGuardId(id); check(validId(gameId) && validId(`${gameId}:${id}`), 'invalid launch session identity'); return `${gameId}:${id}`;
}
export function launchKey(id: string, suffix = 'state') { launchGuardId(id); return `agentica/launches/${id}/${suffix}`; }
export function launchBinding(input: unknown): LaunchBinding {
  const value = snapshotJson(input, 4096) as LaunchBinding;
  fields(value, 'schema kind launchId endpoint publication start');
  check(value.schema === 1 && value.kind === 'agentica-launch', 'invalid launch binding'); launchGuardId(value.launchId);
  check(typeof value.endpoint === 'string' && value.endpoint.length <= 512, 'invalid launch endpoint');
  const url = new URL(value.endpoint);
  check(!url.username && !url.password && !url.search && !url.hash && (url.protocol === 'wss:'
    || url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'unsafe launch endpoint');
  value.publication = snapshotReference(value.publication); value.start = launchStart(value.start); return value;
}
/** First vertical: exact start/manifests fit the kernel's 4 KiB operation binding, with no blob side store. */
export function createLaunchBinding(input: Omit<LaunchBinding, 'schema' | 'kind'>): JsonObject {
  return launchBinding({ ...input, schema: 1, kind: 'agentica-launch' }) as unknown as JsonObject;
}
