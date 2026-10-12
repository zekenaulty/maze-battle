import { vi } from 'vitest';

// Transaction contract fixture, not native IndexedDB atomicity proof.
export function resetStorage() {
  const names = ['saves', 'meta', 'observations', 'telemetry', 'gameCommands', 'rpgMemoryNodes', 'rpgMemoryHeads',
    'rpgTravels', 'rpgTravelActions', 'rpgAgenticaRuns', 'rpgAgenticaActions', 'rpgAgenticaOperations',
    'rpgAgenticaEvents', 'rpgAgenticaAdvances'];
  const tables = new Map(names.map(name => [name, new Map<string, unknown>()]));
  const get = vi.fn((name: string, key: string) => structuredClone(tables.get(name)!.get(key)));
  let failure: string | undefined;
  const transaction = vi.fn(() => {
    const before = structuredClone(tables);
    return {
      objectStore(name: string) {
        const write = async (value: Record<string, unknown>) => {
          if (name === failure) throw new Error('Injected storage failure');
          const key = value.slotId ?? value.key ?? value.id ?? value.gameId;
          tables.get(name)!.set(String(key), structuredClone(value));
        };
        return { get: async (key: string) => get(name, key), put: write, add: write,
          clear: async () => { tables.get(name)!.clear(); } };
      },
      done: Promise.resolve(),
      abort: vi.fn(() => { tables.clear(); for (const [name, table] of before) tables.set(name, table); }),
    };
  });
  return { tables, get, transaction, objectStoreNames: names, failWrites: (name: string) => { failure = name; } };
}
