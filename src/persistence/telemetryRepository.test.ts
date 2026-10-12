import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayTelemetry } from '../domain/telemetry/transitions';
import { loadTelemetry } from './telemetryRepository';

const storage = vi.hoisted(() => ({ getDatabase: vi.fn(), get: vi.fn(), openDB: vi.fn() }));
vi.mock('./saveRepository', () => ({ getDatabase: storage.getDatabase }));
vi.mock('idb', () => ({ openDB: storage.openDB }));

beforeEach(() => {
  vi.resetAllMocks();
  storage.getDatabase.mockResolvedValue({ get: storage.get });
});

describe('current database telemetry reads', () => {
  it('returns the current game telemetry without opening another database', async () => {
    const trace = createPlayTelemetry('current-game');
    storage.get.mockResolvedValue(trace);

    expect(await loadTelemetry(trace.gameId)).toBe(trace);
    expect(storage.get).toHaveBeenCalledExactlyOnceWith('telemetry', trace.gameId);
    expect(storage.openDB).not.toHaveBeenCalled();
  });

  it('leaves missing telemetry absent without opening another database', async () => {
    expect(await loadTelemetry('missing-game')).toBeUndefined();
    expect(storage.get).toHaveBeenCalledExactlyOnceWith('telemetry', 'missing-game');
    expect(storage.openDB).not.toHaveBeenCalled();
  });

  it('propagates current database read failures without opening another database', async () => {
    const failure = new Error('Telemetry read failed');
    storage.get.mockRejectedValue(failure);

    await expect(loadTelemetry('current-game')).rejects.toBe(failure);
    expect(storage.openDB).not.toHaveBeenCalled();
  });
});
