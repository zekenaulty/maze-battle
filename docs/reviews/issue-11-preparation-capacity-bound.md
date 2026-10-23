# S4 Floor Preparation Capacity Bound

Base: `d6c495301ab4e3e93ccc5baab8f18cb987395d4b`. This increment adds only a
pure calculator, focused tests and this report. No kernel, schema, preparation,
App or SDK hookup; no native/service/provider run. It does not close S4.

## Exported Contract

`src/persistence/canonical/world/preparationCapacity.ts` exports:

```ts
preparationCapacity({ version: 'modules-v3', level, roomBudget, policy })
// { version: 'canonical-floor-preparation-v1', budgetBytes, allocationBytes,
//   phases: { bootstrap, generation, quality, roles, content } }
// Each phase: { calls, recordsBytes, nodesBytes, receiptsBytes, budgetBytes }
```

Inputs are copied, exact-field checked and validated against the public module
policy. Seed, world identity, realized joins/geometry and any other extra fields
are rejected. Unsafe coordinate or budget arithmetic refuses. Policy dimensions
may be smaller than their supported maxima; v1 conservatively uses the maxima.
Phase byte figures are **whole-phase totals**, not fresh allowances per call.
`budgetBytes = allocationBytes + sum(phases[*].budgetBytes)`.

The head is deliberately outside this API. Parent admission must replace the
actual serialized head charge with its fixed, validated head allowance **once per
game**, not add that allowance to raw usage or charge it once per floor. The
reported prospective 12-KiB parent policy leaves 20,578,062 ordinary bytes after
16 floors and the unchanged 8-MiB recovery reserve.

`allocationBytes` is a prospective **one immutable unindexed execution anchor**
contract, not an existing ledger implementation: encoded value including proof
<=4,096 bytes; key <=96 non-escaping ASCII characters; one additional birth
receipt <=128 KiB including store/key wrapper. It charges every possible node on
the entire 103-character `record/` path with all **95** children, plus record and
receipt wrappers. Additional progress/proof rows or indexes need a revised bound
before hookup. Current writers generate UUID36 row/node references; game,
generation and owner/fence widths are bounded at 128 ASCII characters, and all
revision/epoch counters at the safe-integer maximum.

## Source Derivation

Let N be the public room budget, D its decimal width, L the level's decimal
width, and C the width of `ceil(22*(N+1)/16)`. This is a producer-specific bound,
not a bound on arbitrary `pages.set` data or imported generic memory trees.

| Retained component | Bound and source |
| --- | --- |
| Bootstrap | One header/floor/space/ports, <=4 sockets, occupancy, preparation; upper-floor stairs for level >1. `world/generation.ts:createWorldFloor`. |
| Generation | N-1 advances; each <=2 spaces + indexes, 3 ports, 3 new sockets, 2 connections, 1 join, floor + index, preparation, occupancy. Deleting the resolved socket still incurs COW path work. Last call adds quality anchor/progress. `generation.ts:expandWorldFloor`, module `step.ts`. |
| Quality | `ceil(N/4)` calls, <=4 2-KiB node values per call, 4-KiB progress + preparation. Last call starts roles. `world/quality.ts`, `qualityRecords.ts`. |
| Roles | `ceil(N/8)` calls, 4-KiB state + preparation. Last call starts content. `world/roles.ts`. |
| Content | `ceil(N/2)` calls, <=2 room-content values + progress + preparation. Entire floor has <=2 unopened chests and <=6 contracts, each with one index; these are NOT charged anew on every content batch. `content/preparation.ts`, `moduleRolePlan.ts:SPECIALTIES`. |
| Receipts | <=4,096 complete stored bytes per progressing preparation call, including canonical fingerprint escaping, maximal fences and timestamp width. The generic 16-KiB result allowance is not used: this operation returns only `{level,phase}`. |

Record value ceilings are: header/room-content/join/unopened-chest 512 B;
space/ports/connection/stairs 1 KiB; socket 2 KiB; floor/quality-progress/role/content
progress 4 KiB; preparation 128 B; contract 4,096 B plus its 44-B wrapper ceiling.
Quality nodes have an explicit 2-KiB source validator. Other small ceilings are
derived from their concrete bounded producer shapes; max-width shape tests and
every generated retained value check them. No opened-chest loot or roster rows
are included. `accounting.ts:storedBytes` supplies the complete logical JSON
record/node/store/key charge, not physical IndexedDB size.

### Occupancy And COW

`modules/policy.ts` bounds room sides at 15 and passage length at 7.
`placement.ts` reserves one <=22-by-15 rectangle per pending room; a room occupies
<=4 16-cell bins, a passage <=2, and a reservation <=6. With R placed rooms,
P<=R-1 passages and Q<=N-R pending rooms, total duplicated current bin entries are
`4R + 2P + 6Q <= 6N-2`. Bootstrap needs <=28. Across the entire floor, **including
empty bins left after reservation removal**, there are at most
`4N + 2(N-1) + 6(N-1) = 12N-8` distinct bucket keys.

The complete bucket key `dungeon/<level>/bucket/<row>,<column>` is bounded by
`8 + L + 8 + 2*(C+1) + 1` characters, including both possible negative signs
and the comma. The same bound prices record keys and, with the seven-character
`record/` prefix, tree nodes. Independent review found that the original formula
omitted the comma: actual seed-0, level-1, room-budget-3 bootstrap writes
`dungeon/1/bucket/-1,-1` (22 characters), exceeding the former 21-character bound.
The actual-writer regression reproduced that failure before correction. No
aggregate overrun was demonstrated; the primitive bound was nevertheless wrong.

`topology/buckets.ts:neighborhood` loads five by five bins; `PagedOccupancy.stage`
only rewrites dirty bins. Bootstrap's bounded entry/reservations also fit five
rows by five columns. Dirty keys therefore share <=5 row-coordinate paths,
not 25 independent row paths. Each signed coordinate allows C+2 branch positions.
This gives <=25 leaf/value nodes and <=30(C+2) internal path nodes. Independently,
a compressed radix tree on B keys has <=2B-1 nodes and <=2B-2 child edges.
The bucket calculation takes both node and edge minima and charges escaped
witness duplication; it does not multiply every node by maximal fanout.

The other world paths use only the current writer grammar:
`record/dungeon/<level>/...`, `record/game/preparation/<level>`,
`record/contract/floor-<level>:...`, and `index/{floors,spaces,chests,contracts}/...`.
The shared allowance covers <=32 static namespace/family forks plus eight
decimal level paths (the seven listed namespace paths plus upper-floor stairs),
with <=12 children. This overcovers namespace ancestors, current-floor family
forks (`c/con`, `s`, quality/content prefixes), and the upper-floor stairs path.
An ordinary changed entity key adds <=D numeric forks (<=11 children), <=3 local
entry/socket or connection/space-suffix forks (<=3 children), and its leaf.
Special chest/contract keys allow two ordinal fields plus five delimiter/suffix
forks; their whole-floor record/index count is <=16. Key/prefix lengths include
level/ordinal/sign widths, duplicated chest identities and the `record/` wrapper.
Internal nodes are conservatively priced with a value even when valueless.

`rpgMemory/tree.ts:flush` emits only reachable pending nodes. Superseded transient
paths are not retained; immutable nodes from earlier commits remain charged.
All per-call path unions are counted once, including transition-to-next-phase
writes. Next-floor bootstrap and the first expansion are deliberately priced
and measured as separate flushes, which overcounts their actual combined commit.
These assumptions are tied to v1: new producer namespaces, key grammar, persisted
IDs, record shapes or additional phase writes require review/versioning.
An authored fixture that directly stages another topology/content batch is not
covered merely because its header says `modules-v3`; its public writer bounds
must be proved separately or it must use this preparation producer.

## Measurements

Tests use the actual domain writers, `CanonicalPages`, default work limits and
`MemoryTree.flush`, backed by an in-memory map. Serialized append costs use the
real accounting functions. World ID is `capacity-world`; IDs are ordinary UUIDs;
receipt timestamp is fixed. Seed for floor L is base seed + L - 1. Between floors
the test checkpoint is placed at the actual prior exit, exactly to qualify
preparation sizing rather than walking. No claim of native IDB, App journey,
ledger enforcement, recovery or public outcome noninterference follows.

| Retained floors | Reserved total B | Actual B, seed 42 | Actual B, seed 781 |
| --- | ---: | ---: | ---: |
| 1 | 5,126,496 | 312,551 | 296,956 |
| 1-8 | 75,820,633 | 5,705,559 | 5,748,583 |
| 1-16 | 239,456,498 | 20,265,526 | 20,154,138 |

The 16-floor reservation is 228.36351203918457 MiB, approximately
**11.815953x / 11.881257x** actual retention:
loose but sufficient for the declared finite cohort at unchanged 256 MiB. Even
using the current 128-KiB stored-head ceiling once leaves room for the unchanged
8-MiB recovery reserve (20,459,278 ordinary bytes remain with that larger head
ceiling). This is not a useful-unbounded-depth claim. The sampled
direct-only/passage-only floor-1 policies retain 293,196 / 343,981 B against the
same 5,126,496-B allowance; both use 32 placement attempts. All 700 phase calls
per 16-floor sequence, each record-value family and every emitted bucket-key
width are checked, not only totals.

The comma repair increases reservations by exactly 2,520 B for floor 1,
37,800 B for floors 1-8 and 115,920 B for floors 1-16. Ordinary headroom falls
by the same 115,920 B, from 20,693,982 to 20,578,062 B with the 12-KiB head.
Rerun per-call measurements are identical to the prior artifacts for both
16-floor seeds and both join-policy samples; actual retention has not changed.

## Qualification And Hookup Limits

- Focused tests: **24 PASS**, 23.67 s. Root `tsc --noEmit`: PASS; no emitted build.
- Evidence: `test-results/private-capacity-comma-repair.json` and
  `test-results/private-capacity-comma-repair/{seed-42,seed-781,policy-direct,policy-passage}.json`
  retain per-call record/node/receipt bytes, counts and value sizes. Failed first
  bounds (300/279 MiB), the initial typecheck failure and prior successful
  `private-capacity-final*` artifacts were not erased. The pre-fix negative-bucket
  regression is retained in `test-results/private-capacity-comma-red.json`.
- Command: `node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-capacity.unit.config.ts src/persistence/canonical/world/preparationCapacity.test.ts src/persistence/canonical/world/preparationCapacity.shapes.test.ts src/persistence/canonical/world/preparationCapacity.tree.test.ts src/persistence/canonical/world/preparationCapacity.generated.test.ts --reporter=default --reporter=json --outputFile=test-results/private-capacity-comma-repair.json`.
- Parent must reserve before bootstrap, bind the exact producer/recipe/allocation
  lineage, measure actual retained private writes and refuse an overrun atomically.
  Keep raw `usedBytes` and real IO telemetry truthful. Closed unused slack remains
  charged; it must not become ordinary gameplay/recovery headroom.
- Roster/settings initialization, knowledge, gameplay, fresh already-ready calls,
  Stop/ACK and their funded recovery are outside this floor allowance. Exact
  receipt replay adds nothing. Invalid/failed preparation rolls back; this budget
  does not guarantee every recipe will generate or qualify successfully.
- `auto/command.ts:85` calls preparation and then writes ordinary Auto state;
  crediting that entire transaction is invalid. Make preparation exclusive or
  enforce bounded explicit attribution, including shared tree nodes and receipt.
- Snapshot restore must not recycle an old floor lineage's allowance. Either deny
  fresh continuation on the consumed lineage or allocate a separately funded new
  lineage. Missing old-format capacity proof refuses fresh work without resealing,
  backfill, quota release, owner reset or loss of original funded cleanup.
- Parent still owns native ledger integration, threshold-neighbor/varied-hidden-
  topology outcome tests, complete rollback, reload/replay, and mixed-Auto checks.
  The finite cohort fit here is arithmetic + writer-size evidence, not those gates.
