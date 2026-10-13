import type { RosterState } from '../../domain/party/roster';
import { getEffectiveActor } from '../../domain/items/inventory';

export function TownInn({ game, onRest }: { game: Pick<RosterState, 'party' | 'inventory'>; onRest: () => void }) {
  const rested = game.party.every(actor => {
    const effective = getEffectiveActor(actor, game.inventory);
    return effective.hp === effective.maxHp && effective.mp === effective.maxMp;
  });
  return <section className="town-card town-inn">
    <h2>{String.fromCodePoint(0x1f6cf)} Inn</h2>
    <span>{rested ? 'The party is fully rested.' : 'Restore the party to full HP and MP.'}</span>
    <button type="button" disabled={rested} onClick={onRest}>Rest - Free</button>
  </section>;
}
