# Issue 11: Earned Frontier Approach

2026-10-18. Runtime/proof candidate `84f79cc`, on `codex/agentic-game-a1`.
This is a bounded approach primitive in the actual App, not completed A2/Q or
autonomous room exploration. Issue #11 and the umbrella goal remain open.

## Behavior and Authority

- `maze.inspect {scope: "frontiers"}` returns a byte-bounded page of current-sight
  boundary anchors/directions with exact observation source and publication-bound
  selection token. Ordering uses public coordinates/cardinals, not hidden utility.
  No world reads or history scans. A valid empty page means no boundary in this
  scope, not a fully explored floor. Existing room/map/cell scopes remain separate.
- `maze.explore {frontier}` explicitly selects one returned approach. The shared
  navigation admission transaction revalidates source membership and a nonzero
  earned route. The same GameSession performs ordinary local moves, accumulates
  legitimate sight, and stops exactly at the original anchor under its original
  time/step/replan limits. World geometry can veto a move, never suggest a route.
- Exact action, publication, source, direction and target remain bound through
  admission, custody confirmation, reload, takeover, terminal delivery and ACK.
  Arrival produces a decision, not objective completion. No automatic successor,
  chest opening, quest acceptance, inventory transfer or per-cell model call.
- Launch stays within 3072 bytes; observation pages adapt to 2800 bytes; frontier
  selection tokens have a 2048-byte/character limit. Escaped/multibyte objectives
  can exceed the launch byte bound even at 512 characters and are rejected, not
  truncated or silently granted a larger limit.

## Review Repairs and Format Policy

Independent review reproduced a missing cross-room spatial-index member being
misclassified as unknown. Each complete 4x4 spatial block now has a same-transaction
SHA-256 consistency commitment with record ID/revision. Existing evidence is
validated before reads or updates; missing/changed pairs fail closed. Synchronous
`@noble/hashes` 2.4.0 avoids async crypto closing an IndexedDB transaction. This
protects against inconsistent stored evidence, not coordinated hostile rewriting
of the database and all its commitments.

The companion payload is under 300 bytes; it does not duplicate the block body.
CanonicalPages/radix measurements for 113 radius-seven cells in 14 blocks add
28 reads / 11,516 logical bytes and 28 writes / 11,544 bytes versus no witness.
A deliberately sparse 113-block stress adds 93,912 write bytes. These are spatial
index deltas, not whole-action native timing or physical disk measurements.

Database version remains 9. Old knowledge without this evidence is unsupported:
no migration, fallback, automatic repair or automatic reset. The existing App
exposes map-evidence failure and Settings -> New game. Native checks prove
cancel leaves data untouched, confirmed reset creates/render/reloads fresh
evidence, and unresolved verified-host obligations still prohibit reset.
The owner's preview database was not reset.

## Qualification

- Full unit suite: **3680 PASS, one existing optional probe SKIP**, 247.3 seconds;
  `test-results/frontier-final-unit.json`.
- Canonical frontier: **33 native PASS**, 49.1 seconds; query/source rejection,
  hidden-state independence, exact approach/reload/replay, concurrent duplicates,
  Stop/adoption, original budgets and write-failure rollback.
- Actual App/manual/recovery: **15 native PASS**, 51.2 seconds, including the two
  new missing-integrity/reset cases; `test-results/app-recovery/results.json`.
- Existing destination regression: **56 native PASS**, 1.2 minutes, rerun on the
  final runtime including compact spatial integrity witnesses.
- Actual-App 1/8/16-floor native depth case: **PASS**, 29.5 seconds. Like-direction
  logical movement writes were 40,869/41,612/41,973 bytes upward and
  41,928/42,671/43,032 downward. No other floors rewritten; these are request
  payloads, not physical disk bytes or proof of arbitrary-depth cost.
- Production build and frontier/service fixture TypeScript: **PASS**. Bundle
  737.12 KB / 225.13 KB gzip; existing chunk-size warning remains.
- Complete actual browser-to-local-Agentica cohort: **30 PASS**, zero skipped,
  failed, flaky or retried cases, 267.35 seconds; retained evidence/provenance:
  `test-results/maze-start-service-d4Aypm/`. It pins Maze `84f79cc` and includes
  the new frontier case plus the previous 29 start/recovery/adoption checks.

The test-only generator seed is 2; production generation, startup sight and
persistence still run normally. Scripted offline planner choices per window:
inspect current frontiers, then select the first public token unchanged. Two
explicit windows perform **four actions and 14 local steps (7 + 7)**. No hidden
target/pre-discovery prelude is fed to the planner. Pack and world roots remain
unchanged; actual checkpoints equal selected anchors. Explicit recovery delivers
the child's final progress/decision before root Stop can finish, preserving both
reserves while unresolved and leaving zero after exact acknowledgements.
Session-wide remote clearance still reports UNKNOWN: zero local allocations are
not proof that every remote action has been cleared. Planner-counter assertions
use per-window deltas, not the aggregate counts from earlier tests in the cohort.

Agentica is pinned to clean `27cb2ce9717438edfe19487e3920faa183112c97`;
alternate .NET 10.0.401 is not repository SDK-pin or live-provider qualification.
No paid calls. This scripted integration does not measure LLM decision quality.

## Intermediate Failures

The first native cohort passed 32/33: its hidden-state test constructed an invalid
opened chest with empty loot. It now uses the existing loot generator/encoder.
Service runs `7XgXI5` and `0Qr7kM` reached a legitimate empty frontier page after
the first approach (random world, then seed 1). The two-approach oracle incorrectly
assumed every view has another frontier. Seed 2 was qualified independently;
empty-page behavior was not changed. `PkNSo3` exposed another oracle assumption:
root ACK cannot precede delivery/settlement of the pending child's final prefix.
The corrected cleanup test follows that actual protocol; `DovMIW` passes.

## Next Bounded Work

1. Define canonical continuation through observed room/corridor geometry with
   material-observation stops, retained original limits and no automatic objective
   selection. Include lawful return from a locally exhausted scope to a remembered
   region; do not inflate every cell junction into a model decision.
2. Expose explicit ordinary quest inspection/acceptance/collection through shared
   game commands and exact item/quest evidence, followed by host-proven return.
   Current-cell chest opening can reuse `commitContentCommand`, but requires a
   genuine retained interaction result: the mounted operation driver currently
   expects navigation progress. Do not disguise an interaction as navigation or
   expose raw quest records containing unobserved target locations.
3. Port and qualify the authored two-dungeon corpus against current generation,
   radius-seven sight, canonical persistence and recovery. Historical radius-two
   fixtures and this single generated seed are not Q. Run the final sustained
   depth/revisit/capacity/multicontroller matrix; paid-model gate remains separate.
