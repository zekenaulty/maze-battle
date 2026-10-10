# Original JavaScript Save Fixtures

Source: `legacy-final`, pinned to `b5b91cdc2fded213b19319fd55c21259b608067e`.
`tests/e2e/original-producer.mjs` serves that commit's unmodified JavaScript from
Git to a disposable Chromium context. It runs `GameLevel.begin(true)`, the real
maze generator, `GameLevel.saveState()` and `SaveData.save()`. No user profile,
network service, paid provider, or installed legacy runtime is used.

Regenerate with `node tests/e2e/original-producer.mjs`. The browser regression
also executes the producer and compares its output to both checked-in fixtures.
The seeded random generator is test setup, not a rewritten serializer.

- `fresh.json`: original newly generated 6x6 maze and all three fresh heroes.
- `advanced.json`: original `loadState` seeds dungeon level 7 with the same saved
  topology. Original `move`, `ActorLevel.levelUp`, `buyAttribute`, `recover`,
  `takeDamage`, `spendMp`, and `ActorInventory.addGold` produce advanced state.
  Hero levels are 25/20/17; base HP/MP/damage are modified before saving to test
  permanent bonuses. The original actors' own derived getters supply `expected`.
  Party gold 137/91/137 models a hero missing rewards while dead.

## Conversion Decisions

Original `Actor.saveState` does not save the level-bonus fields. Reconstruct from
the three original hero classes, then flatten effective strength/intellect,
max HP/MP and base damage into the modern model. Preserve XP, current vitals,
unspent points, base bonuses, actor gold, autoBattle and randomBattles. Preserve
the warrior's level-25 charge upgrade. Start in manual mode; original autopilot
and fight running state were not serialized. Modern future progression rules
apply; `toTiny`, `roomGrowthFactor` and `pointsPerLevel` have no modern runtime
equivalents. Legacy inventory items/cooldowns/equipment were not serialized.

`battle/ui/spawner.js` credits each living hero the same gold for a defeated
enemy. Shared wallet = maximum actor gold, NOT sum and NOT modern starter gold.
Unequal balances cannot reveal the unique historical reward total because the
save has no reward ledger. Maximum is a conservative mapping; preserve all three
actor balances as well. Do not add starter items. Modern derived visibility and
new chest content use normal modern initialization, without regenerating cells.

Reject malformed saves without replacing their topology. Bounds: 1024 rows or
columns, 16384 cells total, 65536 visited entries, hero/dungeon levels up to 10000,
saved scalar values up to 1e9, source strings up to 8 Mi characters, keys up to
1024 characters and up to 1024 sources per startup. No React development-schema
compatibility is provided.

## Import Contract

`importLegacyLocalStorageSaves()` always resolves `{ imported, warnings }`.
`imported` counts newly completed imports (including resumed cleanup), not merely
created destinations. Warnings are capped at 24 plus an omission notice.

Identity is exact source key plus SHA-256 of JSON-encoded source bytes. Sanitized
labels never identify a source. Create the destination with `add` and a string-JSON
meta marker atomically using the existing `saves`/`meta` stores with strict IDB
durability requested. Commit, read back,
hash the entire saved slot, and recheck that snapshot under a write transaction
before durably recording verification. Only then consume source/index entries.
The phases are just committed, verified and cleaned. Keep the small cleaned
identity marker to prevent re-crediting an identical source that reappears.

All importer cleanup check/delete/index edits run synchronously under the same
native IndexedDB write lock, serializing even different tabs without Web Locks.
No ordinary save custody API or `maze-battle:auto` Web Lock is used. Compatible
with unchanged saves/meta stores in ordinary DB v1 and the lead's v2 upgrade.

Verified restart cleanup does not reconvert or rewrite the destination, which
may already have progressed. A malformed index leaves verified cleanup pending
and the source intact until the index is repaired. Missing indexes are recovered
by scanning original keys. The obsolete global imported flag is ignored.

IndexedDB and localStorage cannot commit atomically. A failure after verified
source deletion can leave index cleanup pending; the durable marker recovers it.
Conversion/commit/verification failures never delete a source. The source is
rechecked immediately before deletion; concurrent modern importers serialize.
An old executable still actively writing localStorage does not participate in
that lock; simultaneous uncooperative legacy writes cannot be made atomic with
IndexedDB. Close the old game during one-way conversion.

Browser tests use real IDB/localStorage, native aborts, injected boundary failures,
tab-close recovery, same-context concurrent pages, and readback races on port
5181. Final GameSession/UI integration and ordinary custody qualification belong
to the lead; this branch does not edit those modules.
