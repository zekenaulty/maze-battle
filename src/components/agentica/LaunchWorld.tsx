import { useMemo } from 'react';
import { SpaceResidency } from '../../domain/expedition/residency';
import { materializeSpace } from '../../domain/expedition/schematic';
import { STREAM_CELL_BUDGET } from '../../services/expedition/streamRuntime';
import type { StreamSnapshot } from '../../persistence/streamRepository';
import { streamExpeditionViewModel } from '../../viewModels/streamExpeditionViewModel';
import { ExpeditionCanvas } from '../expedition/ExpeditionCanvas';
import { StreamMapPanel } from '../expedition/StreamMapPanel';

export function LaunchWorld({ snapshot, slot, map }: { snapshot: StreamSnapshot; slot: string; map: boolean }) {
  const cache = useMemo(() => new SpaceResidency(STREAM_CELL_BUDGET, materializeSpace), [slot]);
  const projection = streamExpeditionViewModel(snapshot);
  return map ? <StreamMapPanel slot={slot} current={snapshot.checkpoint.position} revision={snapshot.checkpoint.revision} />
    : <ExpeditionCanvas checkpoint={projection.canvasCheckpoint} spec={projection.spec} geometry={cache.get(snapshot.room.space.spec)} facing="south" frontiers={projection.frontiers} minimumViewCells={9} />;
}
