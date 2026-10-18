import type { recoverGameNavigation } from '../../services/agentica/game/navigationRecovery';

export function navigationRecoveryStatus(result: Awaited<ReturnType<typeof recoverGameNavigation>>) {
  const message = result.status === 'navigation-stopped' ? 'Navigation stopped locally.'
    : result.status === 'terminal-acknowledged' ? `Navigation acknowledged (${result.disposition}).`
      : result.status === 'terminal-prefix-delivered' ? `Navigation terminal prefix delivered through sequence ${result.sequence}.`
        : result.status === 'navigation-acknowledged' ? 'Navigation acknowledged.'
          : result.status === 'awaiting-service' ? 'Navigation is awaiting the service.'
            : 'Navigation recovery remains unresolved.';
  return message + ' Session clearance remains unknown.';
}
