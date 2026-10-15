import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SaveSummary } from '../domain/types';
import { SavesDialog } from './SavesDialog';
import { MAX_MANUAL_SAVES } from '../persistence/canonical/game/saveLimits';

afterEach(cleanup);
it('exposes the exact manual count, disables creation at capacity and keeps deletion available', () => {
  const saves: SaveSummary[] = Array.from({ length: MAX_MANUAL_SAVES }, (_, i) => ({ slotId: `save-${i}`, label: `Camp ${i}`,
    kind: 'manual', updatedAt: '2026-10-15T00:00:00.000Z', dungeonLevel: 1, partyLevels: { warrior: 1, mage: 1, healer: 1 } }));
  const props = { onClose: vi.fn(), onCreateSave: vi.fn(), onLoadSave: vi.fn(), onDeleteSave: vi.fn() };
  const view = render(<SavesDialog {...props} saves={saves} />);
  const create = screen.getByRole('button', { name: 'New save' });
  expect(create).toBeDisabled(); expect(create).toHaveAccessibleDescription('16 / 16 manual saves. Limit reached.');
  fireEvent.click(create); expect(props.onCreateSave).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: 'Delete' })[0]).toBeEnabled();
  view.rerender(<SavesDialog {...props} saves={saves.slice(1)} />);
  expect(create).toBeEnabled(); expect(create).toHaveAccessibleDescription('15 / 16 manual saves');
});
