import { useState } from 'react';
import type { GameView } from '../../services/game/GameView';

export function TownGuild({ game, onAcceptQuest, onClaimQuest }: {
  game: Pick<GameView, 'quests' | 'contracts'>;
  onAcceptQuest: (contractId: string) => void;
  onClaimQuest: (questId: string) => void;
}) {
  const [history, setHistory] = useState(false);
  const posted = game.contracts.filter((contract) => !game.quests.some((quest) => quest.id === contract.id));
  const quests = game.quests.filter(quest => (quest.status === 'claimed') === history)
    .sort((a, b) => Number(b.status === 'complete') - Number(a.status === 'complete') || b.floor - a.floor);
  return (
    <section className="town-card guild-card">
      <h2>{String.fromCodePoint(0x1f3f0)} Guild Hall</h2>
      <div className="guild-filters" role="group" aria-label="Guild contracts">
        <button type="button" aria-pressed={!history} onClick={() => setHistory(false)}>Current ({game.quests.filter(q => q.status !== 'claimed').length + posted.length})</button>
        <button type="button" aria-pressed={history} onClick={() => setHistory(true)}>History ({game.quests.filter(q => q.status === 'claimed').length})</button>
      </div>
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
        {!history && posted.map((contract) => <article key={contract.id} className={`guild-contract is-${contract.status}`}>
          <div><strong>{contract.title}</strong><span>Floor {contract.floor} - {contract.task.required} {contract.task.noun}</span><span>{contract.description}</span></div>
          <small>{contract.status} - {contract.rewardGold}g</small>
          <button type="button" onClick={() => onAcceptQuest(contract.id)}>Accept</button>
        </article>)}
        {quests.length === 0 && (history || posted.length === 0) && <p className="empty-state">{history ? 'No completed contracts.' : 'No current contracts.'}</p>}
      </div>
    </section>
  );
}
