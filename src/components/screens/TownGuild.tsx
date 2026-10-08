import type { GameState } from '../../domain/types';
import { guildContractsForFloor } from '../../domain/guild/contracts';

export function TownGuild({ game, onAcceptQuest, onClaimQuest }: {
  game: GameState;
  onAcceptQuest: (contractId: string) => void;
  onClaimQuest: (questId: string) => void;
}) {
  const contracts = guildContractsForFloor(game);
  const posted = contracts.filter((contract) => !game.quests.some((quest) => quest.id === contract.id));
  const quests = [...game.quests].sort((a, b) => Number(b.status === 'complete') - Number(a.status === 'complete') || b.floor - a.floor);
  return (
    <section className="town-card guild-card">
      <h2>{String.fromCodePoint(0x1f3f0)} Guild Hall</h2>
      <div className="guild-contract-list">
        {quests.map((quest) => <article key={quest.id} className={`guild-contract is-${quest.status}`}>
          <div>
            <strong>{quest.title}</strong>
            <span>Floor {quest.floor} - {quest.targetRoomName}</span>
            <span>{quest.description}</span>
            <label className="quest-progress">{quest.task.progress}/{quest.task.required} {quest.task.noun}
              <progress aria-label={`${quest.title} progress`} value={Math.min(quest.task.progress, quest.task.required)} max={Math.max(1, quest.task.required)} />
            </label>
          </div>
          <small>{quest.status} - {quest.reward.gold}g</small>
          <button type="button" disabled={quest.status !== 'complete'} onClick={() => onClaimQuest(quest.id)}>{quest.status === 'complete' ? 'Claim' : quest.status === 'claimed' ? 'Claimed' : 'Active'}</button>
        </article>)}
        {posted.map((contract) => <article key={contract.id} className={`guild-contract is-${contract.status}`}>
          <div><strong>{contract.title}</strong><span>Floor {contract.floor} - {contract.task.required} {contract.task.noun}</span><span>{contract.description}</span></div>
          <small>{contract.status} - {contract.rewardGold}g</small>
          <button type="button" onClick={() => onAcceptQuest(contract.id)}>Accept</button>
        </article>)}
        {quests.length === 0 && posted.length === 0 && <p className="empty-state">No contracts posted.</p>}
      </div>
    </section>
  );
}
