import { useState } from 'react';
import { FlaskConical, PlugZap } from 'lucide-react';
import { checkLab, type LaunchConfiguration } from '../../services/agentica/launch/configuration';
import type { LaunchJournal } from '../../services/agentica/launch/journal';

export function LaunchSetup({ config, change, journal, selected, select, disabled, canPrepare, prepare }: {
  config: LaunchConfiguration; change(config: LaunchConfiguration): void; journal?: LaunchJournal;
  selected: number; select(index: number): void; disabled: boolean; canPrepare: boolean; prepare(): void;
}) {
  const [readiness, setReadiness] = useState('Not checked');
  const [checking, setChecking] = useState(false);
  const update = (patch: Partial<LaunchConfiguration>) => { change({ ...config, ...patch }); setReadiness('Not checked'); };
  const check = async () => {
    setChecking(true);
    try { setReadiness((await checkLab(config)).message); }
    catch (error) { setReadiness(error instanceof Error ? error.message : String(error)); }
    finally { setChecking(false); }
  };
  return <section className="launch-setup" aria-label="Launch configuration">
    <h2>Connection</h2>
    <fieldset disabled={disabled}>
      <label>Lab WebSocket<input aria-label="Lab WebSocket" value={config.url} onChange={e => update({ url: e.target.value })} spellCheck={false} /></label>
      <div className="launch-field-row">
        <label>Provider<select aria-label="Provider" value={config.provider} onChange={e => update({ provider: e.target.value as LaunchConfiguration['provider'] })}>
          <option value="openai">OpenAI (live)</option><option value="fixture">Fixture (no paid calls)</option>
        </select></label>
        <label>Model<input value={config.provider === 'fixture' ? 'fixture-model' : config.model} disabled={config.provider === 'fixture'} onChange={e => update({ model: e.target.value })} /></label>
        <label>Reasoning<select aria-label="Reasoning" value={config.thinkingEffort} disabled={config.provider === 'fixture'} onChange={e => update({ thinkingEffort: e.target.value })}>
          {['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(effort => <option key={effort}>{effort}</option>)}
        </select></label>
      </div>
      <button type="button" onClick={() => void check()} disabled={checking}><PlugZap size={17} />Check Lab</button>
      <p role="status">{readiness}</p>
    </fieldset>
    <h2>Destination Test</h2>
    <div className="launch-field-row">
      <button type="button" onClick={prepare} disabled={!canPrepare}><FlaskConical size={17} />Prepare test save</button>
      {!!journal?.destinations.length && <label>Known destination<select aria-label="Known destination" value={selected} onChange={e => select(Number(e.target.value))} disabled={disabled}>
        {journal.destinations.map((entry, index) => <option key={index} value={index}>{entry.label}</option>)}
      </select></label>}
    </div>
    <dl><dt>Objective</dt><dd>Travel, inspect on arrival, finish</dd><dt>Credential</dt><dd>Existing Lab service credential</dd>
      <dt>Paid execution</dt><dd>Explicit Start only</dd><dt>Save</dt><dd>{journal?.slot ?? 'Not prepared'}</dd></dl>
  </section>;
}
