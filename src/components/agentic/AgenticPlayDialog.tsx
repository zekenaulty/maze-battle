import { useState } from 'react';
import { Link, Play, Square, UserCheck } from 'lucide-react';
import { Dialog } from '../Dialog';
import type { RpgAgenticaView } from '../../services/agentica/rpg/client';
import type { RpgAddress } from '../../domain/agentic/knowledge/types';
import './agentic.css';

interface Props {
  position: RpgAddress;
  entrance: RpgAddress;
  quests: readonly { id: string; title: string; itemName: string }[];
  view: RpgAgenticaView;
  busy: boolean;
  canStop: boolean;
  controlled: boolean;
  error?: string;
  endpoint: string;
  onEndpointChange: (value: string) => void;
  onStart: (url: string, target: RpgAddress, mode?: 'exploration' | 'quest', questId?: string) => void;
  onReconnect: (url: string, target: RpgAddress) => void;
  onAdopt: () => void;
  onStop: () => void;
  onClose: () => void;
}

export function AgenticPlayDialog({ position, entrance, quests, view, busy, canStop, controlled, error,
  endpoint, onEndpointChange, onStart, onReconnect, onAdopt, onStop, onClose }: Props) {
  const [row, setRow] = useState(String((view.target ?? position).row + 1));
  const [column, setColumn] = useState(String((view.target ?? position).column + 1));
  const [mode, setMode] = useState<'destination' | 'exploration' | 'quest'>(view.mode ?? 'destination');
  const [questId, setQuestId] = useState(view.questId ?? '');
  const selectedQuest = quests.find(quest => quest.id === questId);
  const target = { floor: position.floor, row: Number(row) - 1, column: Number(column) - 1 };
  const valid = mode === 'quest' ? Boolean(selectedQuest) : mode === 'exploration'
    || [row, column].every(value => value.trim() && Number.isSafeInteger(Number(value)) && Number(value) >= 1);
  const disabled = busy || !controlled;

  return <Dialog title="Agentic play" onClose={onClose}>
    <section className="agentic-play" data-agentic-play>
      <form onSubmit={event => { event.preventDefault(); if (valid && !disabled) {
        if (mode === 'quest' && selectedQuest) onStart(endpoint, entrance, mode, selectedQuest.id);
        else if (mode === 'exploration') onStart(endpoint, position, mode); else onStart(endpoint, target);
      } }}>
        <div className="agentic-heading"><span>Fixture provider</span><span>Floor {position.floor}</span></div>
        <label>Host endpoint<input type="url" required value={endpoint} onChange={event => onEndpointChange(event.currentTarget.value)} spellCheck={false} /></label>
        <fieldset className="agentic-target" disabled={disabled}>
          <legend>Intention</legend>
          <label><input type="radio" name="agentic-mode" checked={mode === 'destination'} onChange={() => setMode('destination')} />Known destination</label>
          <label><input type="radio" name="agentic-mode" checked={mode === 'exploration'} onChange={() => setMode('exploration')} />Explore</label>
          <label><input type="radio" name="agentic-mode" checked={mode === 'quest'} disabled={!quests.length} onChange={() => setMode('quest')} />Retrieve quest item</label>
        </fieldset>
        {!quests.length && <p className="agentic-detail">No accepted fetch quests on this floor.</p>}
        {mode === 'quest' && <label>Accepted fetch quest
          <select value={selectedQuest?.id ?? ''} disabled={disabled || !quests.length} required
            onChange={event => setQuestId(event.currentTarget.value)}>
            <option value="">Choose a quest</option>
            {quests.map(quest => <option key={quest.id} value={quest.id}>{quest.title} - {quest.itemName}</option>)}
          </select>
        </label>}
        {mode === 'destination' && <fieldset className="agentic-target">
          <legend>Known target</legend>
          <label>Row (1-based)<input type="number" min="1" step="1" required value={row} onChange={event => setRow(event.currentTarget.value)} /></label>
          <label>Column (1-based)<input type="number" min="1" step="1" required value={column} onChange={event => setColumn(event.currentTarget.value)} /></label>
        </fieldset>}
        <dl className="agentic-status" aria-live="polite">
          <div><dt>Status</dt><dd>{view.state}</dd></div>
          <div><dt>Connection</dt><dd>{view.connected ? 'Connected' : 'Disconnected'}</dd></div>
          <div><dt>Run</dt><dd>{view.runId ?? 'None'}</dd></div>
          {view.operationId && <div><dt>Operation</dt><dd>{view.operationId}</dd></div>}
          <div><dt>Steps / replans</dt><dd>{view.steps} / {view.replans}</dd></div>
          {view.target && <div><dt>{view.mode === 'quest' ? 'Entrance' : view.mode === 'exploration' ? 'Origin' : 'Run target'}</dt><dd>Floor {view.target.floor}, row {view.target.row + 1}, column {view.target.column + 1}</dd></div>}
        </dl>
        {view.detail && <p className="agentic-detail">{view.detail}</p>}
        {error && <p className="agentic-error" role="alert">{error}</p>}
        <div className="agentic-actions">
          <button type="submit" disabled={disabled || !valid || !endpoint.trim()}><Play size={16} aria-hidden="true" />Start</button>
          <button type="button" disabled={disabled || !endpoint.trim()} onClick={() => onReconnect(endpoint, position)}><Link size={16} aria-hidden="true" />Reconnect</button>
          <button type="button" disabled={disabled || !view.runId} onClick={onAdopt}><UserCheck size={16} aria-hidden="true" />Adopt</button>
          <button type="button" disabled={!canStop} onClick={onStop}><Square size={16} aria-hidden="true" />Stop</button>
        </div>
      </form>
    </section>
  </Dialog>;
}
