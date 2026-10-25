import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { readCanonicalQuestJournal, type QuestJournalCursor, type QuestJournalPage } from '../../persistence/canonical/content/journal';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';

export function QuestJournal({ snapshot, onClaimQuest }: { snapshot?: CanonicalSnapshot; onClaimQuest: (id: string) => void }) {
  if (!snapshot) return <p role="status">Quest journal unavailable: no canonical snapshot.</p>;
  return <JournalPage key={JSON.stringify(snapshot)} snapshot={snapshot} onClaimQuest={onClaimQuest} />;
}

function JournalPage({ snapshot, onClaimQuest }: { snapshot: CanonicalSnapshot; onClaimQuest: (id: string) => void }) {
  const [pinned] = useState(() => structuredClone(snapshot));
  const [request, setRequest] = useState<{ cursors: (QuestJournalCursor | undefined)[]; page: number; attempt: number }>(
    { cursors: [undefined], page: 0, attempt: 0 });
  const [view, setView] = useState<{ request: typeof request; value?: QuestJournalPage; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void readCanonicalQuestJournal(pinned, request.cursors[request.page], controller.signal).then(
      result => { if (!controller.signal.aborted) setView({ request, value: result.value }); },
      error => { if (!controller.signal.aborted) setView({ request, error: error instanceof Error && error.message ? error.message : 'Quest journal unavailable' }); });
    return () => controller.abort();
  }, [pinned, request]);
  const current = view?.request === request ? view : undefined;
  const busy = !current;
  return <div aria-label="Accepted quest journal" aria-busy={busy}>
    <nav className="guild-filters" aria-label="Journal pages">
      <button type="button" title="Previous page" aria-label="Previous page" disabled={busy || request.page === 0}
        onClick={() => setRequest({ ...request, page: request.page - 1 })}><ChevronLeft size={18} aria-hidden="true" /></button>
      <span>Page {request.page + 1}</span>
      <button type="button" title="Next page" aria-label="Next page" disabled={busy || !current?.value?.next}
        onClick={() => { if (current?.value?.next) setRequest({ ...request,
          cursors: [...request.cursors.slice(0, request.page + 1), current.value.next], page: request.page + 1 }); }}><ChevronRight size={18} aria-hidden="true" /></button>
    </nav>
    {busy && <p role="status">Loading quest journal...</p>}
    {current?.error && <div role="alert">{current.error} <button type="button" title="Retry journal" aria-label="Retry journal"
      onClick={() => setRequest({ ...request, attempt: request.attempt + 1 })}><RefreshCw size={18} aria-hidden="true" /></button></div>}
    <div className="guild-contract-list">
      {current?.value?.entries.map(quest => <article key={quest.id} className={`guild-contract is-${quest.status}`}>
        <div><strong>{quest.title}</strong><span>Floor {quest.floor}</span>
          <label className="quest-progress">{quest.progress}/{quest.required} {quest.noun}
            <progress aria-label={`${quest.title} progress`} value={quest.progress} max={quest.required} />
          </label></div>
        <small>{quest.status} - {quest.rewardGold}g</small>
        <button type="button" disabled={quest.status !== 'complete'} onClick={() => onClaimQuest(quest.id)}>
          {quest.status === 'complete' ? 'Claim' : quest.status === 'claimed' ? 'Claimed' : 'Active'}</button>
      </article>)}
      {current?.value?.entries.length === 0 && <p className="empty-state">No accepted quests.</p>}
    </div>
  </div>;
}
