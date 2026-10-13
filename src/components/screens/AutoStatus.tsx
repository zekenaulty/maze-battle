import type { RosterState } from '../../domain/party/roster';
import './screens.css';

export interface AutoStatusDetail {
  floor?: number;
  blocked?: boolean;
  objective?: string;
  reason?: string;
}

export function AutoStatus({ game, active, status }: {
  game: Pick<RosterState, 'dungeonLevel' | 'mode' | 'activityLog'>;
  active: boolean;
  status?: AutoStatusDetail;
}) {
  const detail = status?.floor === undefined || status.floor === game.dungeonLevel ? status : undefined;
  if (!active && !detail) return null;
  return (
    <div className="screen-auto-status" role="status">
      <strong>{detail?.blocked ? 'Auto blocked' : active ? 'Auto active' : 'Auto paused'}</strong>
      <span>{detail?.objective ? `Objective: ${detail.objective}. ` : ''}{detail?.reason || (active ? 'Planning next objective.' : 'No current objective.')}</span>
    </div>
  );
}
