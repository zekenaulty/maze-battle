import { useState } from 'react';
import type { ActorState, BattleState, SkillId } from '../domain/types';
import { AutoThrottleControl } from './AutoThrottleControl';
import { BattleActions } from './BattleActions';
import { VitalBar } from './VitalBar';

interface BattleScreenProps {
  battle: BattleState;
  party: ActorState[];
  now: number;
  onRound: () => void;
  onSkill: (actorId: string, skillId: SkillId) => void;
  onAutoBattleChange: (actorId: string, enabled: boolean) => void;
  autoActive: boolean;
  wavesActive: boolean;
  autoThrottleMs: number;
  onAutoToggle: () => void;
  onWavesToggle: () => void;
  onAutoThrottleChange: (value: number) => void;
  onEnd: () => void;
  onCharacters: () => void;
  onSaves: () => void;
}

type BattleTab = 'skills' | 'log';

export function BattleScreen({
  battle,
  party,
  now,
  onRound,
  onSkill,
  onAutoBattleChange,
  autoActive,
  wavesActive,
  autoThrottleMs,
  onAutoToggle,
  onWavesToggle,
  onAutoThrottleChange,
  onEnd,
  onCharacters,
  onSaves,
}: BattleScreenProps) {
  const [activeTab, setActiveTab] = useState<BattleTab>('skills');

  return (
    <main className="game-screen battle-screen">
      <div className="screen-bar">
        <div>
          <h1>Battle {battle.wave}</h1>
          <span className="screen-status">
            Round {battle.round} - {battle.status}
          </span>
        </div>
        <nav aria-label="Battle actions">
          <button className={autoActive ? 'is-active' : ''} type="button" onClick={onAutoToggle}>
            Auto
          </button>
          <button className={wavesActive ? 'is-active' : ''} type="button" onClick={onWavesToggle}>
            Waves
          </button>
          <AutoThrottleControl value={autoThrottleMs} onChange={onAutoThrottleChange} />
          <button type="button" onClick={onRound} disabled={battle.status !== 'active'}>
            Round
          </button>
          <button type="button" onClick={onCharacters}>
            Party
          </button>
          <button type="button" onClick={onSaves}>
            Saves
          </button>
          <button type="button" onClick={onEnd}>
            End
          </button>
        </nav>
      </div>
      <section className="battlefield" aria-label="Enemies">
        {battle.enemies.map((enemy) => (
          <article className="enemy-card" key={enemy.id}>
            <strong>{enemy.token}</strong>
            <span>{enemy.displayName}</span>
            <small>Level {enemy.level}</small>
            <VitalBar label="HP" value={enemy.hp} max={enemy.maxHp} tone="health" />
          </article>
        ))}
        {battle.enemies.length === 0 ? <p className="empty-state">No enemies remain.</p> : null}
      </section>
      <section className="battle-bottom">
        <div className="battle-tabs" role="tablist" aria-label="Battle panel">
          <button className={activeTab === 'skills' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'skills'} onClick={() => setActiveTab('skills')}>
            Skills
          </button>
          <button className={activeTab === 'log' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'log'} onClick={() => setActiveTab('log')}>
            Log
          </button>
        </div>
        {activeTab === 'skills' ? (
          <BattleActions party={party} active={battle.status === 'active'} now={now} onSkill={onSkill} onAutoBattleChange={onAutoBattleChange} />
        ) : (
          <ol className="battle-log">
            {battle.log.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
