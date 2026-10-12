import { changeOwnedSave, loadOwnedGame, readGameControl, updateOwnedGame } from '../../src/persistence/gameCustody';
import { readRpgPerceptionRegion } from '../../src/persistence/rpgMemory/perception';
import { getDatabase } from '../../src/persistence/saveRepository';

/** Authored environmental changes in the isolated browser fixture, never production controls. */
export async function perceptionChange(action: 'narrow' | 'unseen' | 'save' | 'load') {
  const state = await readGameControl();
  if (!state.control || !state.game || state.game.id !== 'click-navigation-fixture-v1') throw new Error('Fixture required');
  if (action === 'save') return changeOwnedSave(state.control, { type: 'create', label: 'Before unseen change' });
  if (action === 'load') {
    const db = await getDatabase();
    const saved = (await db.getAll('saves')).find(s => s.label === 'Before unseen change');
    if (!saved) throw new Error('Missing checkpoint');
    return loadOwnedGame(state.control, saved.slotId);
  }
  return updateOwnedGame(state.control, game => action === 'narrow' ? { ...game,
    maze: { ...game.maze, visibility: { radius: 1, explored: [] } },
  } : { ...game, chests: game.chests.map(c => ({ ...c, opened: true })),
    maze: { ...game.maze, rows: 31, columns: 31, end: { row: 30, column: 30 },
      visibility: { radius: 1, explored: Array.from({ length: 31 }, (_, column) => ({ row: 3, column })) },
      cells: game.maze.cells.map(cell => cell.row === 3 && (cell.column === 5 || cell.column === 6)
        ? { ...cell, links: cell.links.filter(d => d !== (cell.column === 5 ? 'east' : 'west')) } : cell),
      layout: { version: 'structured-v1', rooms: [], mainPath: [{ row: 3, column: 8 }], zones: [] },
    },
  });
}

export { readRpgPerceptionRegion };
