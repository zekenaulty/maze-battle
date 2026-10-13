import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AutoStatus } from './AutoStatus';

afterEach(cleanup);
const game = { dungeonLevel: 4, mode: 'manual' as const, activityLog: [],
  get maze(): never { throw new Error('Hidden maze read'); },
  get autopilot(): never { throw new Error('Legacy plan read'); } };

describe('explicit automation status', () => {
  it('shows host-supplied objectives and blocked reasons without reading legacy state', () => {
    render(<AutoStatus game={game} active status={{ floor: 4, blocked: true, objective: 'Guild cache', reason: 'No known route.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Auto blockedObjective: Guild cache. No known route.');
  });

  it('shows a supplied paused status, hides an absent one, and ignores a different floor', () => {
    const { rerender } = render(<AutoStatus game={game} active={false} status={{ reason: 'Stopped by host.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Auto pausedStopped by host.');
    rerender(<AutoStatus game={game} active={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<AutoStatus game={game} active={false} status={{ floor: 3, blocked: true }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<AutoStatus game={game} active status={{ floor: 3, blocked: true, reason: 'Stale reason' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Auto activePlanning next objective.');
    expect(screen.queryByText('Stale reason')).not.toBeInTheDocument();
  });
});
