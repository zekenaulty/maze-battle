import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listDiscoveredSpaces, readDiscoveredSpace, StreamMapError } from '../../persistence/streamMapRepository';
import { ensureStreamPublicScope } from '../../persistence/streamPublicScope';
import { StreamMapPanel } from './StreamMapPanel';
import { deferred, listing, publicScope, savedPage } from './StreamMapPanel.testSupport';

vi.mock('../../persistence/streamPublicScope', () => ({ ensureStreamPublicScope: vi.fn() }));
vi.mock('../../persistence/streamMapRepository', async original => ({ ...await original<typeof import('../../persistence/streamMapRepository')>(),
  listDiscoveredSpaces: vi.fn(), readDiscoveredSpace: vi.fn() }));
const props = { slot: 'slot', current: { spaceId: 'current', row: 0, column: 0 }, revision: 10 };
beforeEach(() => {
  vi.mocked(ensureStreamPublicScope).mockResolvedValue(publicScope);
  vi.mocked(listDiscoveredSpaces).mockResolvedValue(listing('room', 10, 'next'));
  vi.mocked(readDiscoveredSpace).mockImplementation(async (_slot, id, options) => savedPage(id, options.expectedView.revision));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const shown = (id: string) => screen.findByRole('img', { name: new RegExp(`Observed map of ${id}`) });

it('loads only one saved page and at most 12 summaries; preserves cell provenance and unknown space', async () => {
  const { container } = render(<StreamMapPanel {...props} />);
  await shown('current');
  expect(listDiscoveredSpaces).toHaveBeenCalledExactlyOnceWith('slot', { cursor: undefined, limit: 12 });
  expect(ensureStreamPublicScope).toHaveBeenCalledTimes(1); expect(readDiscoveredSpace).toHaveBeenCalledTimes(1);
  expect(container.querySelector('section')).toHaveAttribute('data-summary-count', '12');
  expect(container.querySelector('section')).toHaveAttribute('data-room-page-count', '1');
  expect(container.querySelectorAll('[data-map-cell]')).toHaveLength(2);
  expect([...container.querySelectorAll('[data-map-cell]')].map(cell => cell.getAttribute('data-observed-at'))).toEqual(['3', '4']);
  expect(container.querySelectorAll('.stream-map-link')).toHaveLength(3);
  expect(container.querySelectorAll('.stream-map-chest,.stream-map-door,.stream-map-frontier')).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
});

it('replaces summaries on Next and reads Current room directly without retaining page history', async () => {
  const { container } = render(<StreamMapPanel {...props} />); await shown('current');
  vi.mocked(listDiscoveredSpaces).mockResolvedValueOnce(listing('later'));
  fireEvent.click(screen.getByRole('button', { name: 'Next page' })); await shown('later-0');
  expect(screen.queryByRole('button', { name: 'Show saved room room-0' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Current room' })); await shown('current');
  expect(listDiscoveredSpaces).toHaveBeenCalledTimes(2);
  expect(container.querySelector('section')).toHaveAttribute('data-room-page-count', '1');
  expect(container.querySelector('section')).toHaveAttribute('data-summary-count', '12');
  fireEvent.click(screen.getByRole('button', { name: 'First page' })); await shown('room-0');
});

it('ignores a late selected-room response after a newer selection', async () => {
  const pending = deferred<ReturnType<typeof savedPage>>();
  vi.mocked(readDiscoveredSpace).mockReturnValueOnce(pending.promise);
  render(<StreamMapPanel {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Show saved room room-1' })); await shown('room-1');
  await act(async () => pending.resolve(savedPage('current')));
  expect(screen.queryByRole('img', { name: /Observed map of current/ })).toBeNull();
  expect(await shown('room-1')).toBeInTheDocument();
});

it.each(['STALE_VIEW', 'CORRUPT_RECORD'] as const)('shows %s without retaining stale map data, and supports explicit refresh', async code => {
  vi.mocked(readDiscoveredSpace).mockRejectedValueOnce(new StreamMapError(code));
  render(<StreamMapPanel {...props} />);
  await screen.findByText(code === 'STALE_VIEW' ? 'Map changed since this checkpoint.' : 'Saved map is inconsistent.');
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh map' })); await shown('current');
});

it('exposes unavailable and unknown states without rendering raw errors or making up cells', async () => {
  vi.mocked(readDiscoveredSpace).mockRejectedValueOnce(new Error('private scope seed=1234'));
  render(<StreamMapPanel {...props} />);
  await screen.findByRole('alert'); expect(screen.queryByText(/1234/)).toBeNull();
  vi.mocked(readDiscoveredSpace).mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Show saved room room-0' }));
  await screen.findByText('No saved observations for this room.'); expect(screen.queryByRole('img')).toBeNull();
});

it('rejects an API view newer than the supplied checkpoint without reading its room', async () => {
  vi.mocked(listDiscoveredSpaces).mockResolvedValueOnce(listing('room', 11));
  render(<StreamMapPanel {...props} />);
  await screen.findByText('Map changed since this checkpoint.'); expect(readDiscoveredSpace).not.toHaveBeenCalled();
});

it('fences old slot/revision reads and unmounted work', async () => {
  const pending = deferred<ReturnType<typeof savedPage>>(); vi.mocked(readDiscoveredSpace).mockReturnValueOnce(pending.promise);
  const { rerender, unmount } = render(<StreamMapPanel {...props} />);
  await waitFor(() => expect(readDiscoveredSpace).toHaveBeenCalledTimes(1));
  vi.mocked(listDiscoveredSpaces).mockResolvedValueOnce(listing('new', 11));
  rerender(<StreamMapPanel {...props} slot="other" revision={11} current={{ ...props.current, spaceId: 'new-current' }} />);
  await shown('new-current');
  await act(async () => pending.resolve(savedPage('current')));
  expect(screen.queryByRole('img', { name: /Observed map of current/ })).toBeNull();
  const scope = deferred<string>(); vi.mocked(ensureStreamPublicScope).mockReturnValueOnce(scope.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh map' }));
  const calls = vi.mocked(listDiscoveredSpaces).mock.calls.length;
  unmount(); await act(async () => scope.resolve(publicScope));
  expect(listDiscoveredSpaces).toHaveBeenCalledTimes(calls);
});

it('ignores a late listing after a checkpoint change', async () => {
  const pending = deferred<ReturnType<typeof listing>>(); vi.mocked(listDiscoveredSpaces).mockReturnValueOnce(pending.promise);
  const { rerender } = render(<StreamMapPanel {...props} />);
  await waitFor(() => expect(listDiscoveredSpaces).toHaveBeenCalledTimes(1));
  vi.mocked(listDiscoveredSpaces).mockResolvedValueOnce(listing('new', 11));
  rerender(<StreamMapPanel {...props} revision={11} />); await shown('current');
  await act(async () => pending.resolve(listing('old', 10)));
  expect(screen.queryByRole('button', { name: 'Show saved room old-0' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Show saved room new-0' })).toBeInTheDocument();
  expect(readDiscoveredSpace).toHaveBeenCalledTimes(1);
});

it('keeps map keyboard navigation from reaching window-level movement handlers', async () => {
  render(<StreamMapPanel {...props} />); await shown('current');
  const movement = vi.fn(); window.addEventListener('keydown', movement);
  try {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Current room' }), { key: 'ArrowRight' });
    expect(movement).not.toHaveBeenCalled();
  } finally { window.removeEventListener('keydown', movement); }
});
