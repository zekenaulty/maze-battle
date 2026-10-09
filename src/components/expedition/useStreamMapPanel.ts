import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureStreamPublicScope } from '../../persistence/streamPublicScope';
import { listDiscoveredSpaces, readDiscoveredSpace, StreamMapError, type StreamMapPage,
  type StreamMapSummary, type StreamMapView } from '../../persistence/streamMapRepository';

export type MapStatus = 'loading' | 'ready' | 'unknown' | 'stale' | 'corrupt' | 'unavailable';
interface MapState {
  context: string; summaries: StreamMapSummary[]; selectedId: string; page?: StreamMapPage;
  view?: StreamMapView; cursor?: string; nextCursor?: string; listStatus: MapStatus; pageStatus: MapStatus;
}
const initial = (context: string, selectedId: string): MapState => ({ context, selectedId, summaries: [], listStatus: 'loading', pageStatus: 'loading' });
const failure = (error: unknown): MapStatus => error instanceof StreamMapError
  ? error.code === 'STALE_VIEW' ? 'stale' : ['CORRUPT_RECORD', 'MISSING_SLOT'].includes(error.code) ? 'corrupt' : 'unavailable'
  : 'unavailable';

/** No page cache or cursor history. Superseded IDB results never enter React state. */
export function useStreamMapPanel(slot: string, currentSpaceId: string, revision: number) {
  const context = JSON.stringify([slot, currentSpaceId, revision]);
  const generation = useRef(0);
  const [state, setState] = useState(() => initial(context, currentSpaceId));

  const readRoom = useCallback(async (base: MapState, ticket: number) => {
    try {
      const summary = base.summaries.find(value => value.spaceId === base.selectedId);
      const page = await readDiscoveredSpace(slot, base.selectedId, {
        expectedView: base.view!, expectedPageRevision: summary?.pageRevision,
      });
      if (generation.current === ticket) setState({ ...base, page, pageStatus: page ? 'ready' : 'unknown' });
    } catch (error) {
      if (generation.current !== ticket) return;
      const status = failure(error);
      setState(status === 'stale' || status === 'corrupt'
        ? { ...initial(context, base.selectedId), listStatus: status, pageStatus: status }
        : { ...base, pageStatus: status });
    }
  }, [slot, context]);

  const loadList = useCallback(async (cursor?: string, selectCurrent = false) => {
    const ticket = ++generation.current;
    setState(initial(context, selectCurrent ? currentSpaceId : ''));
    try {
      const scopeId = await ensureStreamPublicScope(slot);
      if (generation.current !== ticket) return;
      const listing = await listDiscoveredSpaces(slot, { cursor, limit: 12 });
      if (generation.current !== ticket) return;
      if (listing.view.scopeId !== scopeId || listing.view.revision !== revision) throw new StreamMapError('STALE_VIEW');
      if (listing.summaries.length > 12) throw new StreamMapError('CORRUPT_RECORD');
      const selectedId = selectCurrent ? currentSpaceId : listing.summaries[0]?.spaceId ?? currentSpaceId;
      const base: MapState = { context, summaries: listing.summaries, selectedId, cursor,
        nextCursor: listing.nextCursor, view: listing.view, listStatus: 'ready', pageStatus: 'loading' };
      setState(base);
      await readRoom(base, ticket);
    } catch (error) {
      if (generation.current === ticket) {
        const status = failure(error);
        setState({ ...initial(context, currentSpaceId), listStatus: status, pageStatus: status });
      }
    }
  }, [slot, revision, currentSpaceId, context, readRoom]);

  useEffect(() => {
    void loadList(undefined, true);
    return () => { generation.current++; };
  }, [loadList]);

  const visible = state.context === context ? state : initial(context, currentSpaceId);
  const select = (spaceId: string) => {
    if (visible.listStatus !== 'ready' || !visible.view) return;
    const ticket = ++generation.current;
    const base = { ...visible, selectedId: spaceId, page: undefined, pageStatus: 'loading' as const };
    setState(base);
    void readRoom(base, ticket);
  };
  return { ...visible, select, first: () => void loadList(), next: () => {
    if (visible.nextCursor) void loadList(visible.nextCursor);
  }, refresh: () => void loadList(undefined, true), current: () => select(currentSpaceId) };
}
