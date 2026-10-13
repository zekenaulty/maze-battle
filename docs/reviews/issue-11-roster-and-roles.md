# Canonical Roster and Room Roles

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-13.
P2b room-role preparation and P3a roster commands are checked at their storage
boundary. **The playable App has not switched writers. #11 remains open.**
No original or prior React save format is read by these new modules.

## Shared Rules and Records

The actual game's item, equipment, inventory policy and town reducers now accept
`RosterState`: party, pack, stash and current action context, without a maze or
floor history. `createInitialParty` is shared with the current game factory.
There is no dummy `GameState`, separate item algorithm or legacy-save adapter.

New canonical world records are independently addressable:

- `roster/party`: at most three ordered actor IDs; `roster/actor/<id>` holds each
  actor's attributes, resources, skills and equipment references.
- `roster/pack` and `roster/stash`: capacity, bounded record count and insertion
  counter; pack also holds gold. No item array is stored in either header.
- `roster/item/<id>`: item/stack, explicit pack/stash/equipped ownership and stable
  insertion order. Indexes serve carried stock, stash, equipped slot and quest ID.
- `roster/policy`: the existing inventory automation settings, not a new policy.

The bounded projection includes worn items in the inventory display, but they
do not consume pack slots. Actor references and item ownership must agree.
Three party members and 256 records per container are explicit read/work bounds,
not a change to ordinary 36/96 slot capacities. Over-limit writes abort; no stock
is dropped or clamped. Existing per-command/quota limits still apply.
Party-only reads load four entity records and need neither inventory nor rooms.

`executeRosterCommand` uses the same canonical transaction/receipt host for
equip, unequip, buy, partial/full-stack sell, stash/withdraw, consume, portal,
return, rest, locks and explicitly requested inventory automation. Nothing in
loading or navigation invokes town care. Portal toolbar and item use call the
same domain resource rule, retain the exact return position and require that
position to remain established before travel. Unrelated actor/item records are
not rewritten. Current checkpoint support is explicitly noncombat.

## Room Roles

The full-floor role assigner and new incremental preparation share one pure
planner. It retains one hub candidate and six seeded specialty candidates,
then emits at most eight special-room IDs. Ordinary rooms need no entry in that
plan. Pinned outputs, shuffled traversal and a 100,000-room bounded-state test
cover the planner; this is not a generated 100,000-room gameplay benchmark.

`dungeon/<level>/roles` stores a generation-bound cursor, accumulator and final
plan. Each advance visits at most eight rooms, not all retained rooms/floors.
Restart, exact attempt retry, atomic failures and stale bindings are checked.
Direct, mixed and passage layouts retain existing role assignments. A missing
room cannot silently become ordinary. These records are engine metadata, not
player/agent knowledge. Role preparation **does not qualify D1 structure** or
finish chest, encounter, quest or perception content.

## Review Repairs

Independent review reproduced a stale secondary-index pointer that could revive
an old stack quantity and duplicate sale proceeds. The canonical page scanner
now requires every index result to match the primary pointer in the same
snapshot. Historical snapshots still work; corrupt current indexes abort.

The facade validates the original request before cloning/dispatch, rejecting
accessor-bearing operation changes. New-value codecs reject lossy arrays,
accessors, symbols and unknown fields, including unknown undefined fields.
Only schema-named optional fields may be omitted, matched by structural path
segments so literal dotted property names cannot bypass validation. Stored
records are strictly validated, never normalized on read.

## Evidence

- Focused combined unit run: **821 passed / 46 files**. Final codec refinements
  additionally passed their **27-test** focused rerun.
- Combined native canonical suite: **132 passed**; final roster rerun covers
  **30 tests**. Includes real IDB atomicity, quota rollback, exact replay,
  takeover fencing, snapshots, corruption, ownership and shared portal stock.
- Separate offline room-role native suite: **20 passed** on isolated port 5210.
- TypeScript production/fixture checks and production build passed. Existing
  556.82 KB main-chunk warning remains; no paid provider or paired-service gate.

One shared selling command, three starting supply records, eight real generated
rooms per retained floor; actor remains on floor one. Native IDB requests are
instrumented, including payload serialization. These are single samples, not
a throughput benchmark or a full-App movement measurement:

| Retained floors | Native reads | Read payload | Write payload | Measured latency | Browser usage estimate before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 94 | 46,827 B | 6,102 B | 17.3 ms | 311,296 / 319,488 B |
| 16 | 94 | 46,830 B | 6,113 B | 18.3 ms | 4,136,960 / 4,145,152 B |

Only `roster/pack` gained a new entity record; the consumed item's index entries
were removed. New index nodes, head and receipt account for the other writes.
No whole-world enumeration or unrelated floor writes occur inside the command.
Logical payload and `navigator.storage.estimate()` are **not physical disk I/O**.
Raw local evidence: `test-results/canonical-roster-final-combined-results.json`
and `test-results/canonical-roles/results.json` (ignored generated artifacts).

## Remaining Cutover

Persist and qualify room content/quests; bring mandatory movement effects,
earned perception/history and Agentica execution onto these same records.
Replace `GameSession`'s whole-save transitions, refresh and manual saves with
bounded projections/checkpoints. Then wire the incompatible opener, remove all
old runtime stores/entrypoints, and run actual-App deep travel, recovery and Q.
The old preview remains on its old writer until that coherent replacement.
