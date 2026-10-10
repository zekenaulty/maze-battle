import { useState } from 'react';
import { FileSearch } from 'lucide-react';
import type { PresentedContext } from '../../domain/directed/types';

export function DirectedSources({ ids, context, busy, load }: {
  ids: string[]; context?: PresentedContext; busy: boolean; load: (id: string) => unknown;
}) {
  const [selected, setSelected] = useState('');
  const id = ids.includes(selected) ? selected : ids[0] ?? '';
  return <details><summary>Observation records ({ids.length})</summary>
    <div className="directed-actions">
      <label>Source<select aria-label="Observation source" value={id} onChange={event => setSelected(event.target.value)}>
        {ids.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button aria-label="Retrieve observation" title="Retrieve observation" disabled={busy || !id} onClick={() => void load(id)}><FileSearch size={18} /></button>
    </div>
    {context && <pre aria-label="Observation record">{context.json}</pre>}
  </details>;
}
