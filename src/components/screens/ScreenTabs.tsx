import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

interface TabOption<T extends string> { id: T; label: string; icon: LucideIcon }

export function ScreenTabs<T extends string>({ id, label, tabs, selected, onSelect }: {
  id: string; label: string; tabs: readonly TabOption<T>[]; selected: T; onSelect: (tab: T) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex(tab => tab.id === selected);
    const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(tabs[next].id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <div className="town-tabs" role="tablist" aria-label={label} onKeyDown={navigate}>
    {tabs.map(({ id: key, label: name, icon: Icon }) => <button type="button" role="tab" key={key}
      id={`${id}-tab-${key}`} aria-controls={`${id}-panel-${key}`} aria-selected={selected === key}
      tabIndex={selected === key ? 0 : -1} onClick={() => onSelect(key)}>
      <Icon size={16} aria-hidden="true" /><span>{name}</span>
    </button>)}
  </div>;
}
