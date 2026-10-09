import '../../src/styles.css';
import '../../src/components/expedition/expedition.css';
import { createRoot } from 'react-dom/client';
import { StreamMapPanel } from '../../src/components/expedition/StreamMapPanel';
import './stream-persistence-review';

async function mount() {
  await window.stream.setup();
  let snapshot = await window.stream.api.loadStreamSnapshot('stream');
  for (let step = 0; step < 2000 && snapshot.checkpoint.phase !== 'complete'; step++) {
    snapshot = (await window.streamReview.step()).after;
  }
  if (snapshot.checkpoint.phase !== 'complete') throw new Error('Fixture floor did not complete');
  createRoot(document.getElementById('panel-fixture')!).render(<div className="expedition-screen" style={{ display: 'block', height: 'auto', overflow: 'visible' }}>
    <StreamMapPanel slot="stream" current={snapshot.checkpoint.position} revision={snapshot.checkpoint.revision} />
  </div>);
}
void mount().catch(error => { document.getElementById('panel-fixture')!.textContent = String(error); });
