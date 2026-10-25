import { useId, useState } from 'react';
import { Activity, Settings } from 'lucide-react';
import type { ActorState, AutopilotState, BattleState, SkillId } from '../domain/types';
import { AutoThrottleControl } from './AutoThrottleControl';
import { BattleActions } from './BattleActions';
import { VitalBar } from './VitalBar';
import { Dialog } from './Dialog';
import './screens/screens.css';
import './screens/battle.css';

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
  onStopAutomation?: () => void;
  onDiagnostics?: () => void;
  autopilot?: AutopilotState;
  controlsDisabled?: boolean;
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
  onStopAutomation,
  onDiagnostics,
  autopilot,
  controlsDisabled = false,
}: BattleScreenProps) {
  const [activeTab, setActiveTab] = useState<BattleTab>('skills');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelId = useId();

  return (
    <main className="game-screen battle-screen refined-screen">
      <div className="screen-bar">
        <div>
          <h1>Battle {battle.wave}</h1>
          <span className="screen-status">
            Round {battle.round} - {battle.status}
          </span>
        </div>
        <nav aria-label="Battle actions">
          <button disabled={controlsDisabled} className={autoActive ? 'is-active' : ''} type="button" aria-pressed={autoActive} onClick={autoActive && onStopAutomation ? onStopAutomation : onAutoToggle}>
            {autoActive ? 'Stop Auto' : 'Auto'}
          </button>
          <button disabled={controlsDisabled} className={wavesActive ? 'is-active' : ''} type="button" aria-pressed={wavesActive} onClick={wavesActive && onStopAutomation ? onStopAutomation : onWavesToggle}>
            {wavesActive ? 'Stop Waves' : 'Waves'}
          </button>
          <button disabled={controlsDisabled} className="screen-icon" type="button" title="Battle settings" aria-label="Battle settings" onClick={() => setSettingsOpen(true)}><Settings size={18} aria-hidden="true" /></button>
          <button type="button" onClick={onRound} disabled={controlsDisabled || battle.status !== 'active'}>
            Round
          </button>
          <button type="button" onClick={onCharacters}>
            Party
          </button>
          <button type="button" onClick={onSaves}>
            Saves
          </button>
          <button disabled={controlsDisabled} type="button" onClick={onEnd}>
            End
          </button>
          {onDiagnostics && <button className="screen-icon" type="button" title="Diagnostics" aria-label="Diagnostics" onClick={onDiagnostics}><Activity size={18} aria-hidden="true" /></button>}
        </nav>
      </div>
      {autopilot && (autoActive || autopilot.phase === 'blocked') && <div className="screen-auto-status" role="status"><strong>{autopilot.phase === 'blocked' ? 'Auto blocked' : 'Auto active'}</strong><span>{autopilot.reason}</span></div>}
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
      <section className={`battle-bottom ${activeTab === 'log' ? 'show-log' : ''}`}>
        <div className="battle-tabs" role="tablist" aria-label="Battle panel" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'skills' : event.key === 'End' ? 'log' : activeTab === 'skills' ? 'log' : 'skills';
          setActiveTab(next);
          document.getElementById(`${panelId}-${next}`)?.focus();
        }}>
          <button id={`${panelId}-skills`} aria-controls={panelId} tabIndex={activeTab === 'skills' ? 0 : -1} className={activeTab === 'skills' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'skills'} onClick={() => setActiveTab('skills')}>
            Skills
          </button>
          <button id={`${panelId}-log`} aria-controls={panelId} tabIndex={activeTab === 'log' ? 0 : -1} className={activeTab === 'log' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'log'} onClick={() => setActiveTab('log')}>
            Log
          </button>
        </div>
        <div className="battle-panel-content" role="tabpanel" id={panelId} aria-labelledby={`${panelId}-${activeTab}`}>
          <BattleActions party={party} active={battle.status === 'active'} now={now} onSkill={onSkill} onAutoBattleChange={onAutoBattleChange} skillsVisible={activeTab === 'skills'} controlsDisabled={controlsDisabled} />
        {activeTab === 'log' && (
          <ol className="battle-log" aria-label="Battle log">
            {battle.log.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        )}
        </div>
      </section>
      {settingsOpen && <Dialog title="Battle settings" onClose={() => setSettingsOpen(false)}><div className="screen-settings"><AutoThrottleControl value={autoThrottleMs} onChange={onAutoThrottleChange} /></div></Dialog>}
    </main>
  );
}
