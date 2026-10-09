# Structural streaming exploration

Status: active. Branch: `codex/streaming-exploration`. Goal: S0-S5 below.

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
| S0 | Integration lead | In progress | Typed identities, spaces, openings, observations, checkpoint and finite-scope completion contracts |
| S1 | Generation worker | Pending | Deterministic variable room/passage schematics; reciprocal ports, reachability, bounded work, generation-order tests |
| S2 | Persistence worker | Pending | Separate IndexedDB records, revision-checked checkpoint writes, bounded cell residency, unchanged loot after reload/eviction |
| S3 | Exploration worker | Pending | Knowledge-only waypoint decisions, nearby objective batching, frontiers, return route and resumable mapping |
| S4 | Integration lead | Pending | Browser-owned command boundary, epoch/revision/idempotency, takeover, allowlisted observations, scripted adapter qualification |
| S5 | Integration lead + workers | Pending | Playable isolated expedition, long seeded/reload tests, mobile/desktop screenshots, no ordinary-save mutation |

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
