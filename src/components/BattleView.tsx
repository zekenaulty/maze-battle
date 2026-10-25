import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import type { InventoryState } from '../domain/types';
import { getEffectiveActor } from '../domain/items/equipment';
import { BattleScreen } from './BattleScreen';

type Props = Omit<ComponentProps<typeof BattleScreen>, 'now'> & { inventory: InventoryState };

/** Presentation time never advances a round or writes a combat timer. */
export function BattleView({ party, inventory, ...props }: Props) {
  const [now, setNow] = useState(Date.now);
  const effectiveParty = useMemo(() => party.map(actor => getEffectiveActor(actor, inventory)), [party, inventory]);
  useEffect(() => {
    setNow(Date.now());
    if (props.battle.status !== 'active') return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [props.battle.id, props.battle.status]);
  return <BattleScreen {...props} party={effectiveParty} now={now} />;
}
