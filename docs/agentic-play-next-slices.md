# Agentic Play: Dungeon Foundation and Next Slices

Status: D0/D1 and the A1 known-destination vertical qualified at their declared
bounded levels; A0 mapped. A2 has a checked earned-frontier approach primitive and
real-service query/choice/decision proof and explicit earned-corridor continuation;
bounded A3 retrieval/effect/recovery is now checked; whole-A2/Q remains outstanding.
2026-10-12. Revision 20. [D1 evidence](reviews/d1-qualification.md),
[A0 source map](reviews/a0-capability-authority-map.md).
[Findings](dungeon-d0-findings.md) and [D1 repair plan](dungeon-d1-repair-plan.md)
record the accepted amendments, implementation lanes and outstanding gates.
Initial planning Maze source: `codex/maze-live-launch` at `1f266a2`; remote `main` at
`b12a8c37df17612d249a48bf9f2d419c20363c4c`.
Agentica remote main verified at `977d0cab5421fd4e09fd33f1224f241b7e425abe`;
paired service source and SDK pin remain in [NS-6 integration](ns6-paired-integration.md).
D0 added offline diagnostics and review evidence only. D1's actual RPG repair is
qualified at `b237160`; the linked ledger records scale limits rather than
claiming infinite-world performance. A1's [explicit interaction / click travel
sub-slice](reviews/a1-interaction-controls.md) is checked at `e0be2f1`; its durable
controller/service qualification is recorded below; broader A2/Q work remains outstanding. A1's next checked
sub-slice adds [atomic internal command receipts and earned-knowledge functions](reviews/a1-command-custody.md)
at `58476db`. [Snapshot-bound source archival](reviews/a1-observation-archive.md)
is checked through reviewed repair `6bad40e`. [Scoped durable memory](reviews/a1-scoped-memory.md)
is checked through `ba8dc22`, including bounded cell/room reads beyond the resident
2,048-cell cap. [Durable actual-game travel](reviews/a1-durable-rpg-travel.md)
now reuses DestinationOperation and ordinary receipted game movement through
`2d7f177`. The subsequent [actual-game Agentica boundary](reviews/a1-rpg-agentica-boundary.md)
adds scoped SDK tools, atomic admission/results, immutable operation events and
GameSession entry points. Provider-free browser tests exercise unchanged SDK
dispatch against the real game, checked through `0716a94`. The subsequent
[ordinary-game controller and paired lifecycle](reviews/a1-rpg-controller.md)
adds compact controls, pause/Stop, explicit adoption, and real-service known
travel/decision/completion proofs. Its formerly failing pending-decision Stop
after restart is repaired by the [durable decision Stop slice](reviews/a1-decision-stop.md),
including exact replay after a lost Stop reply. [Explicit decision adoption](reviews/a1-decision-adoption.md)
now qualifies new-owner continuation against the real service, retaining the old
decision and a separate fresh scoped checkpoint. The linked bounded A1 acceptance
audit now passes, including actual generated-socket travel. Proceed to A2-A3 and Q;
these known-route tests do not replace those proofs.

A2 now adds [scoped frontier queries and explicit frontier approaches](reviews/a2-earned-frontiers.md)
to the ordinary game. Native cold-start A/B tests earn opposite junction evidence
and carry it into a second selected intention without collecting. The subsequent
[real-service discovery handoff](reviews/a2-service-discovery.md) proves public
frontier query/refinement, opposite evidence-driven selections and explicit
restart/adoption through Agentica; it also repairs transferred-epoch successors.
[Explicit corridor continuation](reviews/a2-corridor-continuation.md) now follows
reciprocal observed passages under the original intention/grant and yields on
new junction/object/changed evidence, including before the selected anchor.
The [A3 shared quest retrieval slice](reviews/a3-quest-retrieval.md), checked at
`3b54d9b`, now carries both authored A/B worlds through deliberate ordinary chest
collection and host-proven return. It preserves a durable interaction decision
across restart/lost replies and explicit adoption or Stop. This adds physical
collectibles to ordinary accepted fetch quests, not a harness-only inventory.
The full fixed-action information matrix, room-level exploration choices,
human/tool parity and generated/growing-world qualification remain outstanding.
The full unit run exposed a repeatable 60-second timeout in the unchanged
`spaces-v2` level-1000 diagnostic. Test-only repair `f28a157` removes assertion
bookkeeping overhead without changing seeds, predicates, generation or timeout.
The final aggregate passes all 2,563 tests; this does not claim faster gameplay.

[Receipt-scoped perception regions](reviews/a2-perception-regions.md), checked
at `25b410d`, now provide bounded display queries from the same retained facts as
tool recall and a draw-only projection with native desktop/mobile pixel proofs.
The subsequent [actual-App perception adoption](reviews/a2-perception-ui.md),
checked at `10d9623`, now carries exact source heads through GameSession and
renders from bounded earned facts. Hidden wall/chest/extent mutations leave
actual desktop/mobile pixels unchanged until new sight; old-save load/reload
restores remembered state. The 2,667-unit, 196-native and 14-App-case aggregates
pass. This closes the live canvas integration gate, not the entire Q matrix.
Scoped room-map operations and room-level exploration remain next. Overview is
temporarily a bounded cell window, not the intended room graph. The query still
inherits the existing save-record fetch, so point-read bounds do not establish
bounded serialized world bytes or qualify large preparation backlogs.

This integrates Lumina's owner-approved *NS-6 Continuation Plan and Two-Dungeon
Qualification Design*, review draft v0.1 (2026-10-11), with the owner's additional
generator-first requirement and local source/receipt review. Attachment SHA-256:
`76dde1efefe58a6fdc331f1658969503b367d6ec63eb15963e4f85b0a8b7e8af`.
The consolidated paired-test specification is [here](two-dungeon-qualification.md).

Changes from Lumina's draft: D0/D1 precede new integration; already implemented
durable handoff is reused rather than rebuilt; current journey ceilings are
documented as hard grants, not renewable windows; broad inventory/town parity
follows the first paired proof rather than blocking it. The owner's subsequent
activation authorized D0 with a mandatory pre-D1 review pause, now satisfied by
the owner's explicit resumption. New paid trials still require separate authorization.

## Direction That Must Survive Every Slice

- One game, shared rules, saves and effects. Manual, auto and Agentic Play are
  controllers, not separate implementations of the RPG. Fixtures remain tests.
- A room is a bounded module containing cells. The map is a graph of rooms and
  connections, not a second full-resolution cell dump. Larger floors need more
  connected modules, not eight bigger rooms or longer corridors.
- Separate authoritative world state, permitted observations, remembered facts
  and delivered model context. Both tool outputs AND delegated target selection
  and pathfinding must respect actor knowledge. Hidden truth may resolve physics
  and effects, but must never quietly guide a route or choose unseen loot.
- Use scoped queries: local cells, nearby room connections, distant remembered
  summaries and deliberate retrieval. Fog should display this same knowledge
  policy; hiding pixels alone is not an information boundary.
- The agent chooses intentions and consequential exceptions. Shared local
  behaviors execute routine movement, observations and authorized interactions.
  Neither every step nor every new room automatically warrants a model call.
- Combat is last and outside this proposed goal. Disable encounters through an
  explicit test policy without rewriting normal game balance. Fully automatic
  combat is an optional later test mode when resource/loot pressure matters; do
  not design the user's future AI-owned combat scheme here.
- Existing geometry, saves, receipts and in-flight operations keep their original
  meaning. Version new generation; never regenerate an old floor in place.
- Stop/takeover, reconciliation, resumable intentions and cumulative usage remain
  required. A local execution window ending is not objective completion.

## What the First Test Proved

The live known-destination run used three model calls (`navigate`, `observe`,
`inspect`), with 25 local movement steps and no local replans. Preparation had
already discovered rooms without a provider. This proves a useful known-world
operation and arrival handoff, not autonomous exploration or full RPG parity.
Prepared actor knowledge is not itself evidence of a hidden-state leak, but it
cannot qualify an unknown-world discovery test. The final inspection retrieved
remembered evidence; it was not a complete environmental examination system.

## Sequence and Completion Gates

D0 is complete at the bounded offline diagnostic/review level; D1's finite RPG
repair has integrated qualification; A0 source mapping is reviewed. A1's shared
interaction/quest-policy cleanup, local durable SDK boundary and bounded
controller/service gate are checked; A2's native frontier and bounded service
handoff slices and bounded A3 retrieval are checked, but broader A2/Q remain
incomplete. Each produces
its own reviewable commit and evidence; none is permission
to declare later slices complete.

| Slice | Deliverable | Gate before proceeding |
| --- | --- | --- |
| D0: creation/scaling baseline | Seeded diagnostics for ordinary `structured-v2` and streamed `spaces-v2`, measured separately; record the source SHA and reproducible defects. | Explain cap/role failures and actual graph/placement quality; select and record a shared module-assembly direction with explicit measurable acceptance. |
| D1: versioned dungeon repair | Bounded room modules, compatible sockets, meaningful branching and scale-aware module growth; valid roles at higher counts. Reuse qualified streaming machinery where it fits, not a third generator just for Lab. | Multi-seed early/deep-floor evidence, >8-room cases, legal traversability/placement and bounded work; new layouts usable by the game, old floors/saves unchanged. |
| A0: exact-head capability/authority map (Lumina A) | Map Manual/Auto/Directed/Agentica entry points, real RPG domain owners, receipt paths, privileged reads and remaining dependencies. Pin both repositories, SDK hash, observation policy and test manifest. | A reviewed matrix distinguishes reusable implementation from missing integration and records exact provider-free commands. No speculative protocol rewrite. |
| A1: shared-game destination host (Lumina B) | Bind observation, known travel, status/cancel and bounded recall to the actual game save/commands using the existing directed executor and Agentica durable protocol. | Multi-cell known-route/doorway proof, no per-cell calls, no implicit collection, Stop/reload/takeover and original-attempt reconciliation; same semantic intention across technical windows, subject to its hard grant. |
| A2: bounded discovery intentions (Lumina C) | Start without a discovery prelude; expose known frontiers and scoped room/map memory; locally execute an admitted exploration intention until earned evidence requires judgment. | No hidden target selection or costs, no per-cell calls, and a genuinely different observation produces a subsequent model-selected intention. Human fog and tools obey the same perception policy. |
| A3: first ordinary gameplay effect (Lumina D) | Open/collect an ordinary chest and apply the smallest real quest-objective transition through existing domain services and browser save. | Explicit effect authority separate from arrival; equivalent manual/auto/agent results, one reward under duplicate delivery, durable quest/item receipts and host-proven completion. |
| Q: paired-dungeon qualification (Lumina E) | Implement the [A/B corpus](two-dungeon-qualification.md) using shared game primitives. Run fixed-action hidden-world equivalence and deterministic cross-runtime proof before a separately authorized live paired trial. | Earned opposite junction evidence, lawful adaptation, real collection/return, recovery and bounded-context growth pass. Offline boundary integrity and live model competence are separate gates. |

D0 and D1 precede new Agentic Play feature implementation. The current launcher
stays a regression fixture, not the destination architecture. A0 can consume the
source mapping collected during D0; it is not permission to implement A1 early.
The D1 map/room identity contract must serve actual RPG consumers and streamed
execution without creating a third authoritative world store.

After Q, extend the same capability ledger to full quest workflows,
inventory/equipment, consumables, shared portal resources and town/vendor/stash
care in separate verticals. Cover quest-item protection, equipment-aware sales,
stack/capacity behavior and portal accounting. These remain required direction,
not implied coverage of the first goal. Combat and full causal mechanisms remain
separate later work.

## D0 Scope and the Pending D1 Repair

[Issue #3](https://github.com/zekenaulty/maze-battle/issues/3) is the generator
anchor. Its earlier deferral protected NS-6; the owner now prioritizes this repair
before new agent-play integration. D0 has now run; D1 implementation is underway.

Confirmed ordinary-game defects: `structuredRooms.ts` caps the target at eight;
`nameRooms()` has only five specialty entries. Removing the cap alone breaks role
assignment and does not establish good topology. The streamed generator instead
has a `6 + 2 * level` room budget and socket reservations, but currently creates a
passage for each attachment. Its growth and spatial quality require separate
measurement; neither implementation is assumed to be the final solution.

1. Add reproducible measurement over a fixed seed set, floors 1-10 and selected
   deeper floors. Include small/impossible placement and >8-room role fixtures.
   Bound every sweep and record early termination rather than hanging on growth.
2. Report room count and sizes, valid roles, socket use, connected components,
   degree distribution, forks, branch depth, endpoints, loops, route distances,
   passage dependence, traversable coverage, overlaps, generation work and memory.
   Pair representative maps with metrics so a technically connected chain does
   not qualify as a branching dungeon. Keep combat pressure out of this slice.
3. Select a versioned module-assembly/progression policy from that evidence.
   Compatible direct door joins must be supported; passages are optional joins,
   not the organizing structure. Do not assume recursive division, mandatory
   prefabs, a fixed density, mandatory loops or a linear floor-growth formula.
4. Commit the acceptance ranges and structural regressions before judging D1.
   D1 must prove scale increases module coverage without unbounded individual
   rooms, sparse corridor inflation or collapsing into a long chain. Include
   deterministic replay/expansion-order checks, saved-world compatibility and
   manual desktop/mobile traversal of representative new layouts.

The goal is not complete at a diagnostics report: D0 establishes evidence for
D1, the actual repair. The owner explicitly requires pausing here for review.
After resumption, continue the remaining slices. Selecting a generation strategy
never authorizes unrelated combat balance changes or reinterpreting saved worlds.

## Adopted Two-Dungeon Design

Lumina v0.1 is now supplied and approved by the owner. Both dungeons start with
equivalent limited knowledge and the objective: locate the survey seal in an
ordinary chest, retrieve it, and return to the entrance. Beyond initial sight, a
junction exposes north blocked/east viable in A, and east blocked/north viable in
B. The agent selects a known frontier, reacts to newly earned evidence, explicitly
collects, then returns over learned paths. No encounters or oracle-sized resource
budget. Exact stages, information invariants and recovery variants are in the
[paired corpus](two-dungeon-qualification.md); this is not a pre-solved path script.

Deterministic authored layouts are valid fixtures if they exercise the same game
rules; they do not replace generation sweeps. If the design needs new mechanisms,
scope them explicitly in shared domain code. [Issue #2](https://github.com/zekenaulty/maze-battle/issues/2)
still distinguishes independent lever/door fixtures from a functioning causal
puzzle. Do not silently turn those historical fixtures into different worlds.

## Goal: G-NS6-INTENTIONAL-PLAY -- D1 Implementation

> Repair and qualify scalable, branching, socket-connected dungeon construction,
> then deliver the first noncombat Agentic Play vertical in the actual Maze Battle
> game and its browser-owned persistence. Progress through D0, D1, A0-A3 and Q:
> start with only earned knowledge, select and explore a bounded unknown frontier,
> revise an intention after a meaningful observation, explicitly collect an
> ordinary quest objective, and return under host-proven completion. Use the shared
> game mechanics, existing Agentica durable protocol, scoped room/map tools and
> lawful local execution without hidden-world guidance or per-cell model calls.
> Qualify Lumina's two-dungeon corpus provider-free with exact evidence and recovery
> checks; conduct the live-model gate only under separately confirmed provider
> limits/authorization and report it separately. Preserve old saves and the known-
> destination regression, disable combat, push each checked vertical promptly,
> and do not build a parallel game. Full RPG parity and combat are later goals.

The owner activated this goal with an explicit instruction to pause before D1.
That review gate was satisfied and explicitly lifted after the second review.
D1 now proceeds under the amended repair plan; later acceptance gates still apply.
The goal's provider-free completion gate
does not include an unapproved paid run; lack of such approval is not failure of
offline wiring, nor may an offline pass be reported as live paired qualification.

## Temporal and Policy Decisions to Preserve

- Owner clarification after A0: Auto chooses voluntary interactions because it
  is Auto. Manual and Agentic Play must not inherit chest opening, quest handling
  or town errands from a shared movement routine or normalization. A1 must split
  game-owned movement consequences from validated voluntary commands, and offer
  a discoverable manual chest action. Auto may explicitly select the same command
  under its own policy. Preserve real mandatory movement consequences (eligible
  encounters and, when implemented, traps/plates/thresholds). Actor navigation
  alone cannot grant loot or optional interaction authority. This supersedes
  A0's earlier suggestion to preserve manual chest-on-arrival convenience.

- Simulation time, objective lifetime, attempt/custody deadlines and observation/
  provider windows are separate. Retain the qualified admission/park/progress/
  transfer/wake protocol and the original immutable action/event identities.
- Current defaults (64 steps, four replans, 120 seconds) are snapshotted journey
  hard grants; real elapsed time includes suspension. Finite larger values and
  `none`/`unlimited` are already supported. Adoption does not reset accumulated
  usage or renew a grant. Do not silently reinterpret them as rolling windows.
  Any future renewal policy must be explicit; an expired action request does not
  by itself erase an already admitted intention.
- Initial exploration may traverse a forced corridor under the grant; the first
  consequential observed junction requires choice in this corpus. Later broader
  routine-interaction policies must use public evidence and explicit authority,
  not hidden engine labels. Arrival alone never grants a chest reward.
- A0 must choose the exact shared chest/quest integration path and document any
  missing primitive. Inspection of remembered evidence, current observation and
  active examination are distinct; do not claim the former implements the latter.
- No fixed monetary or model-call budget is invented here. Confirm provider/model
  settings and cumulative limits before a new live trial; do not replay uncertain
  paid requests to obtain a cleaner result.

## Review and Measurement Cadence

- Commit and push each cohesive, checked sub-slice: baseline diagnostics, chosen
  policy/regressions, repair, compatibility proof, and each shared capability
  vertical. Do not wait for the umbrella goal to finish before publishing.
- Preserve isolated branches/worktrees for implementation lanes; one integrator
  owns shared schema changes and the acceptance ledger. Use ordinary pushes,
  never rewrite main or disturb the active preview to make a review available.
- Record PASS/FAIL/NOT RUN with SHA, seed/fixture revision and evidence level.
  Offline tests, live-provider success and actual RPG integration are different
  claims. A pushed commit is not completion or authorization to merge.
- Capture model calls, context/request/response bytes, token usage when available,
  local actions, wake reasons, retries, completion and player-visible waiting.
  Separate preparation, network/provider turnaround, local execution and durable
  receipt handling. Mark timing components unknown where instrumentation cannot
  distinguish them. Test slow/disconnected transport without automatically
  issuing new paid requests. Optimize useful decisions, not merely fewest calls.
