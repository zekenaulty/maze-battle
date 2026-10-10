import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ScanSearch } from 'lucide-react';
import type { DirectedCommand } from '../../domain/directed/operationTypes';
import { PERCEPTION_PROFILES, type InspectionDirection } from '../../domain/directed/perceptionTypes';
import type { DirectedViewModel } from '../../viewModels/directedViewModel';

const directions = [
  ['north', ArrowUp], ['west', ArrowLeft], ['here', ScanSearch], ['east', ArrowRight], ['south', ArrowDown],
] as const;

export function DirectedInspection({ view, disabled, dispatch }: {
  view: DirectedViewModel; disabled: boolean; dispatch: (command: DirectedCommand) => unknown;
}) {
  const changeProfile = (profile: string) => {
    const url = new URL(window.location.href);
    if (profile) url.searchParams.set('perception', profile); else url.searchParams.delete('perception');
    window.location.assign(url);
  };
  const inspect = (direction: InspectionDirection) => void dispatch({ type: 'inspect', direction });
  return <div role="tabpanel" aria-label="Inspect" className="directed-inspection">
    <div className="directed-actions">
      <label>Perception fixture<select aria-label="Perception fixture" value={view.perception?.value.profileId ?? ''}
        onChange={event => changeProfile(event.target.value)} disabled={disabled}>
        <option value="">Legacy visibility</option>
        {Object.entries(PERCEPTION_PROFILES).map(([profile, score]) => <option key={profile} value={profile}>{profile} ({score})</option>)}
      </select></label>
      <div className="directed-inspect-directions" role="group" aria-label="Inspection direction">
        {directions.map(([direction, Icon]) => <button key={direction} title={`Inspect ${direction}`} aria-label={`Inspect ${direction}`}
          disabled={disabled || !view.perception} onClick={() => inspect(direction)}><Icon size={18} /></button>)}
      </div>
    </div>
    <div className="directed-inspection-results" aria-live="polite">
      {view.cues?.value.map(cue => <p key={cue.direction}>{cue.direction}: {cue.message} ({view.cues!.status})</p>)}
      {view.examinations?.map(entry => <p key={entry.value.featureId}>
        {view.features.find(feature => feature.value.id === entry.value.featureId)?.value.name ?? 'Previously examined feature'}: {entry.value.detail} ({entry.status})
      </p>)}
      {view.inspection && <dl><div><dt>Last inspection</dt><dd>{view.inspection.value.direction}, {view.inspection.value.depth}</dd></div>
        <div><dt>Coverage</dt><dd>{view.inspection.value.coveredCells.length} cell; {view.inspection.value.limitation}</dd></div>
        <div><dt>Source</dt><dd>{view.inspection.observationId}</dd></div></dl>}
    </div>
  </div>;
}
