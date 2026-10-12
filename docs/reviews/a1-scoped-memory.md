# A1: Snapshot-Scoped Durable Memory

2026-10-11 local date. Implementation `aed9d54` / `690f2b1`, reviewed repairs
`ba8dc22`, on `codex/agentic-game-a1`. A1 remains partial. Provider-free evidence
only; no live Agentica binding or model trial is claimed.

## Delivered Boundary

The real `maze-battle` IndexedDB upgrades from v4 to v5 by adding derived memory
nodes and heads. It does not replace the game, inventory, source archive or
control record. Existing saves/source evidence remain unchanged. Every indexed
observation has an immutable copy-on-write radix root, so selecting an older
manual save or creating a new branch cannot borrow later remembered facts.

Only archived permitted observations feed the index. The shared cell-merge
function preserves provenance for cropped edges and replaces facts when newly
observed. Selected cell facts are checked against their original source records
and the selected branch's ancestry before return. Neither preparation nor queries
refresh unseen facts from live dungeon geometry, legacy visited cells or fog.

Internal repository operations:

- `prepareRpgMemory`: default four source records per batch, maximum sixteen;
  explicit `partial`, `ready`, or no-observation result. A partial root is not
  exposed as the complete selected snapshot.
- `readRpgCells`: at most 64 explicitly requested addresses, with known facts and
  unknown addresses kept separate.
- `readRpgRoom`: paged remembered cells for one floor/room, at most 32 per page.
- `readRpgRooms`: paged room summaries/counts without room interiors, at most 32
  per page. Counts mean remembered cells, not authoritative room dimensions.

Page continuations require the same source snapshot. Both queries and preparation
have read/write budgets (8,192 defaults, configurable up to 65,536 per call) and
cancellation. Over-budget, corrupt/missing evidence, quota errors and cancelled
transactions fail closed. A failed derivation batch leaves no partial cache
writes and does not mutate gameplay/source/control. Existing cache roots are
validated before reporting preparation ready, including the cached-head path.

This cache has no 2,048-total-cell limit. The separate pure resident projection
retains that working-set bound. Old source receipts and historical roots are
retained; this is not an infinite-storage or eviction policy. Witnesses detect
accidental record corruption, not authenticated protection against a database
owner rewriting all witnesses and data. Validation of deeper nodes is lazy.

## Qualification

| Check | Result |
| --- | --- |
| Full Vitest before review repairs | 2,180 tests / 145 files PASS |
| Focused memory/knowledge before repairs | 264 tests / 6 files PASS |
| Native command/archive/memory suite after repairs | 58 cases PASS, 35.14s, no skips/retries |
| Existing D1 regression before repairs | 33 cases PASS |
| Independent controls recheck at `690f2b1` | 83 units and 8 desktop/mobile-emulated browser cases PASS |
| Production build after repairs | TypeScript + Vite PASS, 2,082 modules |

Native tests cover current-sight-only knowledge, cropped-edge equivalence with
the shared pure reducer, room membership changes, floor isolation, manual-save
branch/reload/cursors, bounded reads/writes, mid-operation cancellation, injected
quota failures, missing/malformed sources and corrupted cache records. Hidden
world twins with identical earned receipts produce identical scoped results and
work counts. A genuine v4 database with existing game/control/source records
upgrades and indexes without rewriting those records.

Independent review reproduced two defects: preparation could report ready after
its root record was deleted, and early unprepared paths could miss cancellation
during an awaited lookup. `ba8dc22` fixes both and adds five native regression
cases. The review's seventeen small-history differential comparisons found no
cell/edge/membership/branch mismatch. Final repair qualification is the parent
native suite/build, not an assertion that the reviewer reran those repairs.

### Bounded Scale Sample

The native fixture contains 3,072 observed cells in 128 rooms, with 97 immutable
sources. It uses controlled actual-game state transitions to construct history;
it does not qualify the destination executor. IDB `getAll` is prohibited.

- Preparation: 25 batches, at most 112 reads / 338 writes in a batch, 7,804 stored
  radix nodes. Measured total preparation: 1.794 seconds.
- Three selected cells: 20 reads. Eight cells from a distant room: 65 reads.
  Sixteen room summaries: 25 reads.
- Five scoped queries together: 39.6 ms, 23,189 JSON bytes. Game/control/source
  state remains unchanged.

These are one-machine fixture measurements, not network or model latency. The
line-shaped radius-16 fixture has at most 33 cells per source, not the maximum
two-dimensional sight payload. No full map/history scan is needed for these
queries, but selecting a save still reads its full existing serialized game
record. The separate 128-room/16-floor regression still writes about 19.5 MB per
save and took roughly 0.80-1.12 seconds per persisted move. Whole-save serialization
and accumulated history storage cost remain unresolved, not hidden by this cache.

Local evidence: `test-results/rpg-commands/results.json`, attachment
`scoped-memory-scale`, and `test-results/d1-regression`. Native tests use isolated
origins with external requests blocked. The owner's port 5190 was untouched.

## Next Gate

These APIs are internal; they are not tool envelopes, Agentica admissions or
automatically mounted context. No model receives the full index. Next, connect
bounded remembered navigation to the existing DestinationOperation and the real
GameSession/receipted commands, then bind durable SDK admission/results/events
atomically with effect custody. Preserve grants, usage, Stop, reload/adoption,
original-attempt reconciliation and explicit voluntary interaction authority.

A2 frontier discovery and human/tool perception parity, A3 ordinary quest
collection/return, and Q two-dungeon cross-runtime recovery remain outstanding.
The known-destination paired suite was not rerun for this cache-only change. A
fresh paired Agentica source build still needs its SDK/toolchain readiness check;
previous fixture evidence is not a new cross-runtime pass. Paid trials remain
separately authorized. The umbrella goal stays active.
