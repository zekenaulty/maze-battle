import type { GameState } from '../../domain/types';
import './screens.css';

export function AutoStatus({ game, active }: { game: GameState; active: boolean }) {
  const plan = game.autopilot?.floor === game.dungeonLevel ? game.autopilot : undefined;
  if (!active && !plan) return null;
  const questId = plan?.targetId?.replace(/^quest:/, '');
  const quest = game.quests.find((candidate) => candidate.id === questId);
  const room = game.maze.layout?.rooms.find((candidate) => candidate.id === plan?.targetId);
  const objective = quest?.title ?? room?.name
    ?? (plan?.targetId?.startsWith('chest:') ? 'Treasure chest' : plan?.targetId?.startsWith('exit:') ? 'Descent stairs'
      : plan?.targetId?.includes(':') ? undefined : plan?.targetId);
  return (
    <div className="screen-auto-status" role="status">
      <strong>{plan?.phase === 'blocked' ? 'Auto blocked' : active ? 'Auto active' : 'Auto paused'}</strong>
      <span>{objective ? `Objective: ${objective}. ` : ''}{plan?.reason || (active ? 'Planning next objective.' : 'No current objective.')}</span>
    </div>
  );
}
