import { addressKey } from '../../../domain/expedition/address';
import type { PlanningFrame } from '../../expedition/planning/contracts';

/** Keep planning local; complete observations remain in host storage for inspection. */
export function scopeDirectedFrame(frame: PlanningFrame, destination: PlanningFrame['checkpoint']['position']) {
  const position = frame.checkpoint.position;
  const distance = (cell: typeof position) => Math.abs(cell.row - position.row) + Math.abs(cell.column - position.column);
  const visibleCells = [...frame.observation.visibleCells].sort((a, b) => distance(a) - distance(b)
    || a.row - b.row || a.column - b.column).slice(0, 24);
  const keys = new Set(visibleCells.map(addressKey));
  keys.add(addressKey(position)); keys.add(addressKey(destination));
  for (const entries of [frame.knowledge.openings, frame.knowledge.frontiers, frame.knowledge.chests]) {
    for (const entry of Object.values(entries)) keys.add(addressKey(entry));
  }
  const cells = Object.fromEntries(Object.entries(frame.knowledge.cells).filter(([key]) => keys.has(key)));
  return { ...frame, observation: { ...frame.observation, visibleCells }, knowledge: { ...frame.knowledge, cells },
    view: { kind: 'local-window' as const, roomKnownCells: Object.keys(frame.knowledge.cells).length,
      roomVisibleCells: frame.observation.visibleCells.length,
      omittedKnownCells: Object.keys(frame.knowledge.cells).length - Object.keys(cells).length,
      omittedVisibleCells: frame.observation.visibleCells.length - visibleCells.length } };
}
