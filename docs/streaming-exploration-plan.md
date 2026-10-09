# Structural streaming exploration

Status: active; v1 and incremental v2 isolated play qualified. Branch: `codex/streaming-exploration`.
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
| S0 | Integration lead | v2 gameplay binding integrated; public adapter identity in review | Typed identities, spaces, openings, observations, checkpoint and finite-scope completion contracts |
| S1 | Ptolemy / codex/streaming-generation | Bounded macro generator and adversarial gates passed | Deterministic variable room/passage schematics; reciprocal ports, reachability, bounded work, generation-order tests |
| S2 | Dewey / codex/streaming-storage | Atomic gameplay/knowledge pages integrated; discovered-map query and immutable history pending | Separate IndexedDB records, revision-checked checkpoint writes, bounded cell residency, unchanged loot after reload/eviction |
| S3 | Kant / codex/streaming-explorer | One-room bounded planner integrated; map UI pending | Knowledge-only waypoint decisions, nearby objective batching, frontiers, return route and resumable mapping |
| S4 | Integration lead | Typed browser planning gate implemented; adversarial review and transport pending | Browser-owned command boundary, epoch/revision/idempotency, takeover, allowlisted observations, scripted adapter qualification |
| S5 | Integration lead + workers | v2 playable, reload and viewport gates passed; service gates open | Playable isolated expedition, long seeded/reload tests, mobile/desktop screenshots, no ordinary-save mutation |

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
v2 macro generator now expands one reserved frontier per bounded transaction and
is connected to the separate `?expedition=2` screen. The loaded-cell budget is 512; total
resident bytes, persisted history and map growth need separate later budgets.
The v1 fixture writes a finite checkpoint per action. V2 writes a compact checkpoint,
at most two room-local knowledge pages, and a compact original-action receipt in
the same transaction as topology. It does not copy the discovered world per move.
The browser now uses observed-space waypoint batches with exact local routes,
bounded caches and complete host change sets. It prefers fewer door crossings,
then distance, not a globally optimal tour. No combat, equipment, floor descent
or ordinary quest migration is enabled in the fixture. Action receipts persist
with checkpoint effects in IndexedDB, with an explicit 4,096-action slot budget.
There is no receipt eviction/archive protocol yet. A reload fences the old owner
and cancels an uncommitted local-only reservation by its original identity; this
does not generalize to unconfirmed external effects.
No provider or cross-runtime Agentica service was exercised. See
[MB-A0 browser adapter contract](planning-adapter-contract.md) for the current packet.

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
- `746c586`: paged topology database with atomic reciprocal links, reserved-socket
  resolution, original expansion receipts and an explicit logical UTF-8 byte quota.
  PASS: twelve actual-IDB tests including 321 spaces, reload, races, quota rollback,
  and rollback of topology when a later composed transaction phase fails.
  Expansion reads 25 occupancy pages rather than all existing spaces. Byte accounting
  includes stored keys and records, not browser-engine disk overhead.
- `a53f3dc` hardens point reads against corrupt stored undefined/null/primitives.
  PASS: twenty paged-topology browser tests, including 49 corrupt-record cases.
  Instrumentation counts actual exact-key reads: 25 occupancy pages and at most
  34 records per expansion at 321 spaces. No scans or full-world copies occur.
- Three additional control-race regressions now pass: a cancelled receipt cannot
  publish a tentative checkpoint; superseded keys cannot cancel newer input; an old
  route decision cannot be stamped with a new checkpoint revision. Nine expedition
  browser cases and production build passed again after those fixes.
- Final integrated milestone PASS: 1,071 unit tests in 68 files, all 78 browser
  tests, production build and whitespace checks. Browser assertions verify route
  reuse, one post-reload map audit, and exactly one durable receipt per committed
  fixture action. Original RPG save isolation remains covered. The goal is active;
  this evidence does not qualify v2 gameplay or an Agentica service.

Next integration order:

1. Bind observed pending sockets to bounded generation work. Unresolved sockets
   are not traversable doors; missing generation is not a wall or completed scope.
   Preparation must be a bounded, observable state transition, not a phantom move.
2. Add a v2 gameplay checkpoint/knowledge-page transaction and durable command
   receipts. Finishing requires the sealed topology revision and complete objectives.
   These records share the topology database/transaction, not a second commit domain.
3. Enable a separately saved v2 playable expedition. Preserve v1 records unchanged.
4. Page discovered maps, add RPG systems through the same host commands, then
   qualify the browser/service adapter against a fake Agentica provider.

The next gameplay checkpoint needs two distinct revisions: canonical topology
and observed gameplay. A pending doorway can request preparation only after it
has been observed. One preparation command advances a bounded canonical batch;
it does not assert that the player moved or reveal unrelated generated rooms.
The checkpoint, changed knowledge pages and original command receipt join the
topology transaction. Cancellation must reconcile that receipt, not regenerate
under a different ID. Existing `spaces-v1` records remain on the sealed-fixture
runtime; no migration silently changes their geometry or loot.

## Third milestone: incremental playable rooms

- `e6d7077`: atomic v2 gameplay, current/destination knowledge-page reads and
  command receipts share the topology database and quota accounting. Preparation
  is an explicit visible-frontier action, not movement or an unbounded generation loop.
- `6d96c7c`, `5c6a240`, `1975622`: a planner consumes one saved room page, batches
  nearby objectives with exact local BFS, and persists parent/completed-exit
  waypoints. Geometry is a tree in this version; this is not a globally optimal
  tour and a future cyclic generator requires a corresponding navigation contract.
- `1cc987f`: separately saved playable v2 at `http://127.0.0.1:5174/?expedition=2`.
  Database `maze-battle-topology-v2`, slot `streamed-demo`; normal game and v1 saves
  remain untouched. Narrow passages retain the same minimum camera scale.
- PASS: 72 focused domain/storage unit tests; 11 actual-IDB gameplay tests. A full
  15-space / 7-chest fixture took 2,697 qualification commands with at most 41 point
  reads per command. Indexed room lookup remains bounded at 321 generated spaces.
- PASS: six v2 browser/UI tests: complete actual autoplay, stop/reload/resume,
  all loot, home return, stale-tab fencing and keyboard takeover. Layout/canvas
  checks cover 1280x800, 320x640, 390x780 and 844x390. Desktop and 320x640 screenshots
  inspected. Production build passed. Full combined regression follows integration.
- `68b4953`: two further race fixes plus 16 focused tests: planner admission is
  synchronous after the control barrier; rejected takeover also clears playback.
- `9fafd78`: browser-owned planning contract, explicit projection and local action
  gate. Twelve tests include full observed-only fake-planner completion, duplicate
  delivery, stale revision, cancellation, unknown acknowledgement and bounded progress.
  This is same-runtime qualification, not an Agentica service or network test.
- Adapter review found internal scope IDs serialize the recipe seed. Public adapter
  bindings use a persisted random UUID; internal scope IDs must never be sent.

Next: integrate adversarial persistence/adapter fixes and public identity, qualify
the real-IDB adapter, add bounded discovered-map queries/UI, then cross-runtime
service implementation. Manual immutable save references and receipt archival are
still separate open gates; logical quotas are explicit, not infinite-storage claims.
