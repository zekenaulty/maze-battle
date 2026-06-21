import { fromLegacyState } from '../domain/gameFactory';
import { getMeta, saveGame, setMeta } from './saveRepository';

const LEGACY_SLOT_LIST_KEY = 'DC-GAME-SAVE-SLOTS';
const LEGACY_IMPORT_META_KEY = 'legacy-local-storage-imported';

export async function importLegacyLocalStorageSaves() {
  const alreadyImported = await getMeta(LEGACY_IMPORT_META_KEY);
  if (alreadyImported?.value === 'true') {
    return 0;
  }

  const slots = readJson<string[]>(LEGACY_SLOT_LIST_KEY) ?? [];
  let imported = 0;

  for (const slot of slots) {
    const legacyState = readJson<unknown>(legacySlotKey(slot));
    if (!legacyState) {
      continue;
    }

    const game = fromLegacyState(slot, legacyState);
    await saveGame(`legacy-${safeSlotId(slot)}`, cleanSlotLabel(slot), 'imported', game);
    imported++;
  }

  await setMeta(LEGACY_IMPORT_META_KEY, 'true');
  return imported;
}

function readJson<T>(key: string): T | undefined {
  const value = localStorage.getItem(key);
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function legacySlotKey(slot: string) {
  return `DC-GAME-${slot.toUpperCase()}`;
}

function cleanSlotLabel(slot: string) {
  const withoutTags = slot.replace(/<[^>]+>/g, ' ');
  const label = withoutTags.replace(/\s+/g, ' ').trim();
  return label.length > 0 ? label : 'Imported Save';
}

function safeSlotId(slot: string) {
  return cleanSlotLabel(slot).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'save';
}
