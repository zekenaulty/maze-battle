import type { KeyboardEvent } from 'react';
import { Backpack, ChartNoAxesColumn, HeartPulse, Shield, Sparkles, Sword, WandSparkles } from 'lucide-react';
import type { ActorState } from '../../domain/types';

const ROLE_ICONS = { warrior: Sword, mage: WandSparkles, healer: HeartPulse };
const VIEWS = [{ name: 'Stats', icon: ChartNoAxesColumn }, { name: 'Equipment', icon: Shield }, { name: 'Skills', icon: Sparkles }, { name: 'Inventory', icon: Backpack }] as const;
export type SheetView = typeof VIEWS[number]['name'];

function navigate(event: KeyboardEvent<HTMLElement>, current: number, count: number, select: (index: number) => void) {
  const next = event.key === 'ArrowRight' ? (current + 1) % count
    : event.key === 'ArrowLeft' ? (current - 1 + count) % count
    : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : undefined;
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  select(next);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
}

export function CharacterNavigation({ party, selectedId, onSelect }: { party: ActorState[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="character-grid character-selector" role="group" aria-label="Character selection" onKeyDown={(event) => navigate(event, party.findIndex((actor) => actor.id === selectedId), party.length, (index) => onSelect(party[index].id))}>
      {party.map((actor) => {
        const Icon = ROLE_ICONS[actor.role];
        return <button type="button" key={actor.id} aria-pressed={actor.id === selectedId} onClick={() => onSelect(actor.id)}>
          <Icon aria-hidden="true" />
          <span><strong>{actor.displayName}</strong><small>Lv {actor.level} {actor.role}{actor.hp <= 0 ? ' - Fallen' : ''}</small></span>
        </button>;
      })}
    </div>
  );
}

export function SheetNavigation({ view, onChange }: { view: SheetView; onChange: (view: SheetView) => void }) {
  return (
    <div className="character-view-tabs" role="tablist" aria-label="Character sheet" onKeyDown={(event) => navigate(event, VIEWS.findIndex(({ name }) => name === view), VIEWS.length, (index) => onChange(VIEWS[index].name))}>
      {VIEWS.map(({ name, icon: Icon }) => <button key={name} id={`character-tab-${name}`} type="button" role="tab" aria-selected={view === name} aria-controls={`character-${name.toLowerCase()}`} tabIndex={view === name ? 0 : -1} onClick={() => onChange(name)}>
        <Icon aria-hidden="true" /><span>{name}</span>
      </button>)}
    </div>
  );
}
