# Structural streaming exploration

Status: active; first isolated fixture qualified. Branch: `codex/streaming-exploration`.
Goal: S0-S5 below. The overall goal is not complete.

## Architecture

A maze node is refined into a bounded space of cells. A schematic expresses its
interior and preserves explicit connections at its boundary. Gameplay roles attach
to this structure; neither screen pages nor storage blocks define rooms.

Preserve classic and structured-v1/v2 saves. Introduce an isolated `spaces-v1`
expedition without touching the ordinary `maze-battle` save database. The first
fixture has a small, finite topology manifest and lazily materialized variable-size
spaces. This is a qualification step, not a claim of unbounded topology generation.
Later bounded macro expansion must replace the finite manifest behind the same
address/opening contract before claiming effectively unlimited floors.

Generated topology, resident cells, and discovered knowledge are independent.
Coordinates are space-local row/column; global placement is presentation metadata.
Openings are reciprocal and committed together. Geometry is immutable after commit;
loot and other changes are durable deltas. Missing resident data means load, not wall.
Recipes pin generator version and seed; regeneration cannot depend on cache order.

## Ticket board

| ID | Owner | Status | Acceptance |
| --- | --- | --- | --- |
| S0 | Integration lead | v2 expansion contracts added; gameplay binding pending | Typed identities, spaces, openings, observations, checkpoint and finite-scope completion contracts |
| S1 | Ptolemy / codex/streaming-generation | Bounded macro generator and adversarial gates passed | Deterministic variable room/passage schematics; reciprocal ports, reachability, bounded work, generation-order tests |
| S2 | Dewey / codex/streaming-storage | Durable action ledger integrated; paged topology in progress | Separate IndexedDB records, revision-checked checkpoint writes, bounded cell residency, unchanged loot after reload/eviction |
| S3 | Kant / codex/streaming-explorer | Observed-space route batches integrated; paged map pending | Knowledge-only waypoint decisions, nearby objective batching, frontiers, return route and resumable mapping |
| S4 | Integration lead | Durable local receipts and takeover integrated; transport pending | Browser-owned command boundary, epoch/revision/idempotency, takeover, allowlisted observations, scripted adapter qualification |
| S5 | Integration lead + workers | First fixture passed; remaining gates open | Playable isolated expedition, long seeded/reload tests, mobile/desktop screenshots, no ordinary-save mutation |

## First playable gate

Explore connected rooms and passages, collect all finite-scope chests, checkpoint,
evict earlier spaces, reload, and return to the original entry. Keep the live game
untouched. First prove this with local deterministic autoplay and a fake adapter;
provider calls are not authorized merely by opening the fixture.

Runtime work stays in small modules. Shared contracts and entrypoint wiring belong
to the lead. Workers use isolated branches/worktrees and commit only owned files.
No worker may change the live save or unrelated Agentica checkout.

## Remaining gates after the first fixture

- Incremental macro topology expansion with bounded placement, reservations,
  connectivity-preserving fallback, and an explicit exploration-order contract.
- Paged map/history and world records; manual saves reference immutable revisions.
  Account for IndexedDB quota and archiving instead of promising infinite storage.
- Level profiles scale connected complexity without increasing minimum cell size
  or resident-memory limits. Floors remain finitely completable by default.
- Room-aware camera and normal RPG quest/combat/inventory integration, through the
  same commands and observations, after the isolated fixture passes.
- Reconcile MB-A0 from the supplied Browser-Owned Streaming Adapter draft with
  space addresses, checkpoints, scope identity, and truthful completion. Then add
  the Agentica service host using its existing runner, not a second planner.
- Cross-runtime fake-provider qualification precedes live-provider qualification.
  Live-provider status must remain UNKNOWN until explicitly exercised.

## Evidence

- Planning/source review completed; no streaming implementation existed at start.
- Existing town tab changes checkpointed at `41ada57`; ordinary app remains on 5174.
- First test entry: `http://127.0.0.1:5174/?expedition=1`. It does not mount
  `useGameSession` or open the ordinary game database. Its database is
  `maze-battle-expeditions`, slot `structural-demo`.
- Integrated generation: `f90e1ce`; observed-map explorer: `34b7122`;
  persistence/residency: `28ba792`, corrected for sparse floor cells in `3931057`.
- PASS: 930 tests in 60 files (`npx vitest run --maxWorkers=2`). Worker runs exposed
  an existing equipment-heavy qualification timeout; the integrated suite passed
  without relaxing that timeout. Equipment evaluation cost remains a profiling lead.
- PASS: full 35-case browser suite, then final seven-case expedition suite including
  two new cases for keyboard takeover and invalid saved geometry. Ordinary-save
  bytes remained unchanged through the complete isolated expedition.
- PASS: final production build and focused action-session tests. Result queries
  return defensive copies, including after human takeover.
- Visual checks: 1280x800 desktop and 320x640 mobile screenshots inspected; browser
  canvas-pixel/layout checks also cover 390x780 and 844x390.

## Current limitations and next packet

The playable v1 fixture has six rooms and five passages on an authored layout.
`STRIDE` is fixture placement only, not the target world partition. The separate
v2 macro generator now expands one reserved frontier per bounded transaction;
it is not yet connected to the playable expedition. The loaded-cell budget is 512; total
resident bytes, persisted history and map growth need separate later budgets.
One complete finite checkpoint is written per action; records are not yet paged.
The browser now uses observed-space waypoint batches with exact local routes,
bounded caches and complete host change sets. It prefers fewer door crossings,
then distance, not a globally optimal tour. No combat, equipment, floor descent
or ordinary quest migration is enabled in the fixture. Action receipts persist
with checkpoint effects in IndexedDB, with an explicit 4,096-action slot budget.
There is no receipt eviction/archive protocol yet. A reload fences the old owner
and cancels an uncommitted local-only reservation by its original identity; this
does not generalize to unconfirmed external effects.
No provider or cross-runtime Agentica service was exercised.

Implemented S0/S1 packet:

1. Add a separately versioned macro manifest with per-space schematic versions,
   unresolved sockets, topology revision and explicit finite-scope sealing.
2. Derive identities from scope/parent socket/child ordinal, not coordinates,
   materialization order or retries. Derive candidate seeds independently.
3. Expand a canonical frontier queue with bounded candidate attempts and reserved
   fallback space. Visibility/prefetch requests must not decide collision winners.
4. Commit both endpoints, reservations and resolution together; no dangling open
   door may point at promised-but-uncommitted topology. Preserve visited geometry.
5. Qualify reverse request order, collision exhaustion, reload around commit,
   duplicate expansion requests, quota exhaustion and eventual scope sealing.
6. Preserve spaces-v1 as sealed legacy scopes. Do not regenerate any saved floor.

## Second milestone evidence and remaining integration

- `57bf907` adds `spaces-v2`: versioned stone schematics, variable footprints,
  canonical FIFO sockets, independently keyed candidates, reserved 5x5 fallback
  rooms and explicit budget/spatial-limit sealing. Committed interiors never change.
- `99cfa09` protects reservation ownership and bounds the spatial index. Its 16-cell
  bins are lookup pages only, not room boundaries. A proposal tests at most eight
  candidates and twenty occupancy queries; each query has at most nine buckets and
  2,304 entry checks. Actual reviewed proposals peaked at 208 checks.
- Worker review: 64 seeds each at levels 19, 80 and 1,000 reached 44, 166 and 2,006
  rooms respectively. The quota is a ceiling; a genuinely enclosed frontier may
  seal as `spatial-limit`. It must not be reported as reaching the requested quota.
- The in-memory topology host is a reference/qualification host, not durable world
  storage. It has an explicit receipt budget, and cannot justify an infinite world.
- `bc08b5b`: additive v2 expedition DB migration, pending action reservations,
  atomic checkpoint/effect/result settlement, epoch-CAS takeover and exact replay.
- `7b75dfc`: bounded observed-space route batches. On the 6,000-known-cell fixture,
  512 moves required four plans; 508 reused steps performed no BFS/map audit when
  the host supplied complete changes. Real domain-transition tests verify those
  change sets include both endpoints of a newly traversed opening.
- Browser integration passes full exploration/loot/home, stop/reload/resume,
  manual takeover, interrupted local reservation recovery and stale-tab fencing.
  PASS: full integrated 1,061-test / 66-file unit suite, 58 browser tests and
  production build. The subsequently added singleton-cell completion regression
  is qualified separately. Mobile 320x640 expedition screenshot inspected.

Next integration order:

1. Persist topology headers, spaces, sockets, links, occupancy pages and original
   expansion receipts atomically, with bounded read/write sets and byte quotas.
2. Bind observed pending sockets to bounded generation work. Unresolved sockets
   are not traversable doors; missing generation is not a wall or completed scope.
3. Add a v2 gameplay checkpoint/knowledge-page transaction and durable command
   receipts. Finishing requires the sealed topology revision and complete objectives.
4. Enable a separately saved v2 playable expedition. Preserve v1 records unchanged.
5. Page discovered maps, add RPG systems through the same host commands, then
   qualify the browser/service adapter against a fake Agentica provider.
