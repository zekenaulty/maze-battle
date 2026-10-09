# Structural streaming exploration

Status: S0-S5 foundation acceptance is qualified, including isolated v2 play,
paged discovered maps, a separate level-19 fixture and provider-free Agentica
first-chest/recovery/takeover proof. Branch: `codex/streaming-exploration`.
This closes the bounded exploration foundation, not the entire RPG migration.
Post-foundation work is listed separately below. Live-provider status is UNKNOWN.
Historical test counts belong to their recorded milestones.

## Architecture

A maze node is refined into a bounded space of cells. A schematic expresses its
interior and preserves explicit connections at its boundary. Gameplay roles attach
to this structure; neither screen pages nor storage blocks define rooms.

Preserve classic and structured-v1/v2 saves. The isolated `spaces-v1`
expedition does not touch the ordinary `maze-battle` save database. The first
fixture has a small, finite topology manifest and lazily materialized variable-size
spaces. This is a qualification step, not a claim of unbounded topology generation.
Bounded macro expansion is now implemented separately as `spaces-v2`, behind the
space-address/opening model. It still seals a finite scope and obeys explicit
memory/storage/work limits; this is not an infinite-world or infinite-history claim.

Generated topology, resident cells, and discovered knowledge are independent.
Coordinates are space-local row/column; global placement is presentation metadata.
Openings are reciprocal and committed together. Geometry is immutable after commit;
loot and other changes are durable deltas. Missing resident data means load, not wall.
Recipes pin generator version and seed; regeneration cannot depend on cache order.

## Ticket board

| ID | Owner | Status | Acceptance |
| --- | --- | --- | --- |
| S0 | Integration lead | v2 contracts and persisted opaque public UUID integrated | Typed identities, spaces, openings, observations, checkpoint and finite-scope completion contracts |
| S1 | Ptolemy / codex/streaming-generation | Bounded macro generator and adversarial gates passed | Deterministic variable room/passage schematics; reciprocal ports, reachability, bounded work, generation-order tests |
| S2 | Dewey / codex/streaming-storage | Foundation acceptance passed; immutable manual saves/archival are follow-up work | Separate IndexedDB records, revision-checked checkpoint writes, bounded cell residency, unchanged loot after reload/eviction |
| S3 | Kant / codex/streaming-explorer | One-room route batches and paged map UI integrated; level-19 oracle run recorded | Knowledge-only waypoint decisions, nearby objective batching, frontiers, return route and resumable mapping |
| S4 | Integration lead | Internal full-floor harness and external first-chest/recovery/takeover gates passed | Browser-owned command boundary, epoch/revision/idempotency, takeover, allowlisted observations, scripted adapter qualification |
| S5 | Integration lead + workers | Isolated playable, persistence, layout and provider-free integration gates passed | Playable isolated expedition, long seeded/reload tests, mobile/desktop screenshots, no ordinary-save mutation |

## First playable gate

Explore connected rooms and passages, collect all finite-scope chests, checkpoint,
evict earlier spaces, reload, and return to the original entry. Keep the live game
untouched. First prove this with local deterministic autoplay and a fake adapter;
provider calls are not authorized merely by opening the fixture.

Runtime work stays in small modules. Shared contracts and entrypoint wiring belong
to the lead. Workers use isolated branches/worktrees and commit only owned files.
No worker may change the live save or unrelated Agentica checkout.

## Post-first-fixture gate status

- Implemented: bounded macro placement, reservations, connectivity-preserving
  fallback and canonical exploration-order-independent expansion.
- Implemented: paged world records and revision-fenced discovered-map reads/UI.
  Still open: immutable manual-save references and receipt/history archival.
  IndexedDB logical quotas are enforced; no infinite-storage claim is made.
- Implemented: level profiles and a separate level-19 save without increasing
  minimum cell size or the 512-cell residency budget. Scopes remain finite.
- Implemented: room-aware camera. Still open: normal RPG quest/combat/inventory
  integration through the same commands and observations.
- Implemented: MB-A0 local gate and actual-IDB host, plus an Agentica HostProtocol
  v1 client using the existing generic SDK. `maze-planning/1` remains an internal
  harness contract, not the external wire protocol.
- Qualified: actual cross-runtime first-chest fixture, exact-source reads after
  compaction, original-result replay and takeover/new-epoch continuity. Whole-floor
  service orchestration and live-provider qualification remain separate future gates.

## Historical first-fixture evidence

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

## Current implementation and limits

The playable v1 fixture has six rooms and five passages on an authored layout.
`STRIDE` is fixture placement only, not the target world partition. The separate
v2 macro generator now expands one reserved frontier per bounded transaction and
is connected to the separate `?expedition=2` screen. The loaded-cell budget is 512.
Map reads/UI are paged and v2 storage has an explicit logical UTF-8 byte quota;
these do not bound browser-engine disk overhead or provide historical archival.
The v1 fixture writes a finite checkpoint per action. V2 writes a compact checkpoint,
at most two room-local knowledge pages, and a compact original-action receipt in
the same transaction as topology. It does not copy the discovered world per move.
The v1 graph planner reuses waypoint batches and complete host change sets. The
current v2 `StreamPlanner` instead consumes one observed room page: nearest local
loot/internal frontiers first, then visible-frontier preparation, uncleared child
exits, parent backtracking and finally home/finish. Learned ports, parentOpeningId
and completedExits support this paged tree traversal without a whole-world graph.
Exact local paths are bounded by 512 cells, four room ports/two passage ports and
128 cached route steps. Normal movement reuses batches; discovery, objective change,
deviation, control change or reload invalidates them. Neither planner promises a
globally optimal tour. A future cyclic generator needs a different navigation contract.

No combat, equipment, floor descent or ordinary quest migration is enabled in the
fixture. V1 retains its explicit 4,096-action slot budget; v2 records participate
in topology-database byte accounting, including Agentica reservations and full
original results. There is no receipt eviction/archive protocol yet. Local reload
recovery fences the old owner and reconciles original reservations; it is not
blanket authority to cancel unknown external effects.

Agentica integration now retains immutable original observation/result evidence
atomically with effects and offers non-executing settlement for provably abandoned
pending attempts. Ordinary disconnect alone does not prove abandonment. The actual
cross-runtime first-chest, replay and takeover fixture gates now pass. See the
[planning adapter contract](planning-adapter-contract.md) for the separate internal
harness and external HostProtocol v1 boundaries.

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

## Historical second-milestone evidence

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
  fixture action. Original RPG save isolation remained covered. At that milestone,
  this evidence did not yet qualify v2 gameplay or an Agentica service; later local
  v2 evidence is recorded separately below.

Historical next integration order (items 1-3 and map paging are now implemented;
ordinary RPG integration and service qualification remain open):

1. Bind observed pending sockets to bounded generation work. Unresolved sockets
   are not traversable doors; missing generation is not a wall or completed scope.
   Preparation must be a bounded, observable state transition, not a phantom move.
2. Add a v2 gameplay checkpoint/knowledge-page transaction and durable command
   receipts. Finishing requires the sealed topology revision and complete objectives.
   These records share the topology database/transaction, not a second commit domain.
3. Enable a separately saved v2 playable expedition. Preserve v1 records unchanged.
4. Page discovered maps, add RPG systems through the same host commands, then
   qualify the browser/service adapter against a fake Agentica provider.

The implemented v2 gameplay checkpoint has two distinct revisions: canonical topology
and observed gameplay. A pending doorway can request preparation only after it
has been observed. One preparation command advances a bounded canonical batch;
it does not assert that the player moved or reveal unrelated generated rooms.
The checkpoint, changed knowledge pages and original command receipt join the
topology transaction. Cancellation must reconcile that receipt, not regenerate
under a different ID. Existing `spaces-v1` records remain on the sealed-fixture
runtime; no migration silently changes their geometry or loot.

## Historical third milestone: incremental playable rooms

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
  inspected. Production build passed. At that milestone, combined regression was
  still pending; these passes are scoped to the listed tests.
- `68b4953`: two further race fixes plus 16 focused tests: planner admission is
  synchronous after the control barrier; rejected takeover also clears playback.
- `9fafd78`: browser-owned planning contract, explicit projection and local action
  gate. Twelve tests include full observed-only fake-planner completion, duplicate
  delivery, stale revision, cancellation, unknown acknowledgement and bounded progress.
  This is same-runtime qualification, not an Agentica service or network test.
- Adapter review found internal scope IDs serialize the recipe seed. Public adapter
  bindings use a persisted random UUID; internal scope IDs must never be sent.

Those subsequent local packets are now integrated; they do not constitute an
external-service qualification. The following milestone records their scope.

## Fourth milestone: paged maps and Agentica host client

- `6001731`, `2077d3c`: persisted public scope UUID and bounded discovered-map reads.
  `listDiscoveredSpaces` reads at most 12 saved room summaries plus one lookahead;
  `readDiscoveredSpace` reads one saved page. Public scope and gameplay/topology
  revisions fence the view; each entry retains its observedAt provenance. No hidden
  geometry, generation, observation refresh or historical reconstruction occurs.
- `42c3dbb`, `ae38158`: paged map UI with one selected saved page, explicit
  stale/unknown/corrupt states and superseded-read guards. It does not accumulate
  the discovered world in a browser map cache. The level-19 fixture is available at
  `?expedition=2&level=19`, in slot `streamed-demo-level-19`, floor `floor-19`, seed
  `20261008`. Runtime/hook configuration keeps it separate from `streamed-demo`,
  v1 and normal RPG saves; changing level does not rewrite an existing slot recipe.
- Recorded level-19 worker oracle PASS: 1,971 commands (1,884 moves, 43 collects,
  43 prepares, one finish), 172 crossings and 861 reused route steps; all 43 chests,
  87 visited/cleared spaces and return home. This was the real seeded `StreamHarness`
  with an unbounded in-memory oracle used only by the test. It is not a level-19
  IndexedDB/browser performance result or an Agentica service run. The explicit
  qualification test also asserts bounded planner work/cache sizes.
- `23f24d7`, `2634e6f`, `7288f2d`: adversarial internal planning gate and durable
  repository host. Recorded PASS: two actual-IDB browser tests; the observed-only
  scripted planner completed 535 actions, all seven chests and home return, then
  recovered the exact original finish result after reload. Protocol
  `maze-planning/1` is internal-only; its separately read current frame is not an
  immutable original Agentica observation.
- `a503e39`, `61deb13`: actual Agentica HostProtocol `protocolVersion: 1` helpers
  and fixture-only browser client. Five bounded capabilities require topologyRevision.
  A persisted public UUID, new durable control epoch, stable objectiveId and
  service-created runId/manifestHash are bound before any SDK action admission.
  Both `outcome` and `run.terminated` are handled; reconnect/reconciliation does not
  execute a replacement attempt. No paid-provider default is enabled.
- `93c6687`: IndexedDB reservation/binding APIs and atomic Agentica execution.
  The full immutable original result, including observation and completion evidence,
  commits with the gameplay/topology effect and original domain receipt. Projection
  or quota failure rolls the transaction back; replay never regenerates evidence.
- `7ac70ac`, `26dab01`: non-executing pending settlement and client adoption.
  Original receipt lookup comes first. Settlement requires an exact pending identity,
  no effect receipt and proven epoch revocation or deadline expiry under consistent
  ownership. Missing/corrupt history and valid-owner disconnects stay unresolved;
  recovery of a proven-unstarted action does not restore the old owner's authority.
- `ba5aa1c`: unmodified SDK pin
  `4291c7ff38a7466fb1f57c99fed97a6de8ff65c3`. Recorded PASS: 53 focused client tests
  with one worker and TypeScript checking. Tests use the real SDK/domain but mocked
  repository/transport. This is local client evidence, not service qualification.

## Foundation qualification

See [Agentica qualification](agentica-qualification.md) for exact versions, commands,
named scenario evidence and limits. The normal RPG and v1 saves remain untouched.
The level-19 map uses the available screen height at desktop and 320px mobile sizes;
opening it pauses exploration and suppresses movement controls. Screenshots inspected.

Recorded regression: 1,318 unit tests, 124 standard browser cases, 21 actual-IDB
Agentica cases and the three separately enabled real-service browser cases passed.
Six fixture parser tests cover current-user prompt selection and exact/receipt-linked
evidence. Production build passed. See qualification notes for final SDK delta tests.

## Post-foundation work

Manual immutable save references, receipt/history archival and normal RPG
quest/combat/inventory integration remain open. Future topology/navigation changes
must retain bounded work and truthful finite-scope completion; none of the current
milestones supports an infinite-world, infinite-storage or global-optimality claim.
