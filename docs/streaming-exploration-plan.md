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
| S0 | Integration lead | Fixture contracts qualified; expansion contract next | Typed identities, spaces, openings, observations, checkpoint and finite-scope completion contracts |
| S1 | Ptolemy / codex/streaming-generation | Fixture integrated; macro expansion pending | Deterministic variable room/passage schematics; reciprocal ports, reachability, bounded work, generation-order tests |
| S2 | Dewey / codex/streaming-storage | Fixture storage qualified; paging pending | Separate IndexedDB records, revision-checked checkpoint writes, bounded cell residency, unchanged loot after reload/eviction |
| S3 | Kant / codex/streaming-explorer | Knowledge-only baseline qualified; hierarchy pending | Knowledge-only waypoint decisions, nearby objective batching, frontiers, return route and resumable mapping |
| S4 | Integration lead | Local action boundary qualified; transport pending | Browser-owned command boundary, epoch/revision/idempotency, takeover, allowlisted observations, scripted adapter qualification |
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

The fixture has six rooms and five passages on an authored layout. `STRIDE` is
fixture placement only, not the target world partition. Materialization is lazy;
macro topology is not yet incremental. The loaded-cell budget is 512; total
resident bytes, persisted history and map growth need separate later budgets.
One complete finite checkpoint is written per action; records are not yet paged.
The baseline planner traverses observed cells per decision, not a hierarchical
route cache. No combat, equipment, floor descent or ordinary quest migration is
enabled in the fixture. Action receipts currently survive within a session only;
durable reconnect reconciliation must precede a remote service connection.
No provider or cross-runtime Agentica service was exercised.

Next S0/S1 packet:

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
