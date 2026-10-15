import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import { createStartRecovery } from './launchRecovery.shared';

/** Initial-only recovery. No grant, automatic resume, wake, or replacement start. */
export function createLaunchRecovery(port: CanonicalHostPort & CanonicalRecoveryPort, launchId: string,
  fetchImpl: typeof fetch = fetch) {
  return createStartRecovery(port, launchId, 'initial', fetchImpl);
}

/** Inspect or Stop a granted root after closing its action transport. Never adopts or resumes historical grants. */
export function createGrantedLaunchRecovery(port: CanonicalHostPort & CanonicalRecoveryPort, launchId: string,
  fetchImpl: typeof fetch = fetch) {
  return createStartRecovery(port, launchId, 'granted', fetchImpl);
}
