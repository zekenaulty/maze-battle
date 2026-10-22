import { useEffect, useMemo, useRef, useState } from 'react';
import { readCanonicalRoomAnchor, readCanonicalRooms } from '../persistence/canonical/knowledge/roomMap';
import type { KnownAnchor, KnownNode, KnownPage } from '../persistence/canonical/knowledge/graph';
import type { CanonicalSnapshot } from '../persistence/canonical/types';

interface Request { root: string; cursor?: string; number: number; attempt: number }
interface View { key: string; page?: KnownPage<KnownNode>; error?: string; selecting?: boolean }

export function useKnownRooms(snapshot: CanonicalSnapshot, enabled: boolean) {
  const root = JSON.stringify(snapshot);
  const pinned = useMemo(() => JSON.parse(root) as CanonicalSnapshot, [root]);
  const [request, setRequest] = useState<Request>({ root, number: 1, attempt: 0 });
  const current = request.root === root ? request : { root, number: 1, attempt: 0 };
  const { cursor, number, attempt } = current;
  const key = JSON.stringify([root, enabled, cursor, attempt]);
  const live = useRef(key); live.current = key;
  const selection = useRef<AbortController | null>(null);
  const [view, setView] = useState<View>({ key: '' });
  useEffect(() => {
    const controller = new AbortController();
    if (enabled) void (async () => {
      try {
        const result = await readCanonicalRooms(pinned, cursor, controller.signal);
        if (!controller.signal.aborted && live.current === key) setView({ key, page: result.value });
      } catch {
        if (!controller.signal.aborted && live.current === key) setView({ key, error: 'Room evidence unavailable' });
      }
    })();
    return () => { controller.abort(); selection.current?.abort(); selection.current = null; };
  }, [pinned, cursor, enabled, key]);
  const retained = enabled && view.key === key ? view : undefined;
  const busy = enabled && (!retained || !!retained.selecting);
  const first = () => {
    if (!enabled || busy) return;
    setRequest({ root, number: 1, attempt: attempt + 1 });
  };
  const next = () => {
    if (!enabled || busy || !retained?.page?.next) return;
    setRequest({ root, cursor: retained.page.next, number: number + 1, attempt: attempt + 1 });
  };
  const select = async (spaceId: string, onSelected: (anchor: KnownAnchor) => void) => {
    const node = retained?.page?.items.find(item => item.kind === 'room' && item.spaceId === spaceId);
    if (!enabled || busy || !node || selection.current) return;
    const controller = new AbortController(); selection.current = controller;
    setView({ ...retained, key, selecting: true });
    try {
      const result = await readCanonicalRoomAnchor(pinned, node, controller.signal);
      if (!controller.signal.aborted && live.current === key) {
        setView({ ...retained, key, selecting: false });
        onSelected(result.value);
      }
    } catch {
      if (!controller.signal.aborted && live.current === key) setView({ key, error: 'Room anchor unavailable' });
    } finally { if (selection.current === controller) selection.current = null; }
  };
  return { page: retained?.page, error: retained?.error, busy, number, first, next, select };
}
