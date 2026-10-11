# D1 Repair Plan: Shared Socket-Connected Room Assembly

Status: **BOUNDED D1 QUALIFIED; A0/A1 NEXT**. 2026-10-11.
The [integrated qualification ledger](reviews/d1-qualification.md) records exact
source identity, combined test results and remaining eager-save latency limits.
Input: [D0 findings](dungeon-d0-findings.md), [compatibility audit](reviews/d0-compatibility.md),
[issue #3](https://github.com/zekenaulty/maze-battle/issues/3).
The owner explicitly resumed implementation after the second review. The numeric
policies below remain versioned provisional defaults, not accepted balance laws.
Review attachment SHA-256:
`d8fe6f7597d0e8fbac47d592eac60e3db917ec84494785554d2bd5d291ddb572`.

## Accepted Review Amendments

- Add ordinary structural rooms; retain a bounded special-role allocation. More
  modules must not multiply chest, boss or contract budgets.
- Require per-floor anti-chain checks as well as corpus medians, and report chain
  lengths, branch depths, path distances and actual maps.
- Measure eager projection cells, full RPG save bytes, drawing and traversal;
  capacity failure must occur before any partial floor reaches game state.
- Fix ordinary safe-room wandering encounters independently from global no-combat
  test policy. Use authoritative room membership, preserve explicit battles and
  legacy hostile-overlap priority, and qualify manual/Auto/reload/boundary cases.
- Extend the separately repaired canvas regression (`b91ac26`, integrated here as
  `dc44c77`) to same-session follow/manual camera, pointer mapping, dialogs and
  unchanged game state. This remains a D1.4 player-view gate.
- Defer rich room authoring, LLM room proposals, combat ownership and paid trials.

## Implementation Ownership

| Ticket | Owner / isolation | Status |
| --- | --- | --- |
| D1.1 policy, ordinary roles, acceptance | Integrator, `codex/dungeon-d1` | Policy/roles checked; geometry proof in D1.2 |
| D1.2 module assembly and joins | Integrator, same branch after D1.1 | 48-case corpus and independent 560-floor audit passed; three defensive API repairs qualified |
| D1.3 RPG projection and version preservation | Integrator after assembly proof | Shared RPG default integrated; focused projection/legacy/portal/capacity tests passed; browser qualification in D1.4 |
| D1.S safe-room wandering encounters | Isolated `codex/d1-safe-rooms`; narrow encounter services/tests | Integrated `34a12b2`; combined manual/Auto/new-version/native-reload proof passed |
| D1.V same-session resize qualification | Isolated UI test lane; no generator/state changes | Integrated `3bf4292`; combined DPR 1/2 rerun passed, uniform-unknown oracle corrected after issue #5 |
| D1.4 integrated measurements and compatibility | Integrator; all lanes must pass together | Bounded PASS; see qualification ledger, including residual archive write latency |

The live preview/save at port 5190 is not the implementation workspace. Checked
verticals are pushed promptly; no merge or paid-provider authorization is implied.

## Recommended Shape

Use one versioned module assembler, evolved from the existing streamed topology
machinery. A room owns a bounded cell footprint and explicit compatible sockets.
An expansion attaches a legal module; a connection may be a direct doorway or an
optional short passage. Spatial placement serves a branching room graph, not a
lattice score that silently reduces prime room counts to a chain.

Keep keyed seeds, stable identities, bounded candidate search, reservations,
non-overlap and atomic socket consumption. Add new-policy dispatch rather than
altering `spaces-v2`, `stone-room-v1` or historical structured layout semantics.
Do not introduce a Lab-only generator or third authoritative gameplay store.

The first delivery is a bounded finite-floor projection usable by the actual RPG.
Generate module-local cells, establish a stable floor origin, add reciprocal
door links, and project to the existing RPG floor/state/effect owners. New floor
creation must use this path; a nice diagnostic picture alone does not complete D1.
This is not yet arbitrary-size incremental RPG persistence. Keep that limitation
explicit rather than claiming an eager cell array can scale forever.

## Review Decisions and Proposed Defaults

These are candidate policies to review, not preexisting owner instructions.

1. **Growth:** separate desired room-module budget from historical `mazeMaxRooms`.
   Recommend `6 + 2 * level` as the first versioned comparison/default candidate:
   it already reached 8/46/126 modules at levels 1/20/60 in the streamed baseline.
   This is a provisional spatial progression policy, not a claim that linear
   growth is the final balance curve. Preserve saved legacy scalars; never treat
   the original cell-as-room budget as a one-to-one new room count.
2. **Rooms:** use bounded procedural rectangular modules first, with socket and
   role contracts that can later accept authored templates. Proposed side range
   5-15 cells; fixed shapes are unnecessary. No unbounded room inflation. Track
   minimum-size fallback prevalence: the current streamed cohort rises to 52.67%
   non-entry 5x5 rooms at level 60. Retaining reachability by squeezing most new
   modules into minimum footprints is a quality tradeoff, not free success.
3. **Connections:** try compatible direct joins and short passage alternatives
   under the same bounded placement policy. Candidate passage length 1-7 cells;
   direct join has no passage module. Do not enforce a cosmetic corridor quota.
   Test both modes explicitly; reject a default that can never produce direct joins.
4. **Branching:** select/retain multiple usable frontier sockets while preserving
   placement legality. Proposed corpus gate: every feasible graph of >=12 rooms
   has at least two degree-3-or-higher rooms; median fork fraction >=15% at 32+
   rooms. These are anti-chain review targets, not a mandated named algorithm.
   Loops remain optional; do not add them just to improve a statistic.
5. **Capacity:** separate desired world extent from an eager projection budget.
   Proposed first projection qualification: up to 256 modules and 65,536 output
   cells. If the request cannot be represented within authorized work/memory,
   stop with an explicit capacity result before committing a partial floor. Do
   not clamp the requested world to that size and call it fully generated. Large
   streamed adoption remains later work; this bound must not become a hidden
   permanent eight-room-style world ceiling.

The old unchecked exponential grid allocation is not retained for new-policy
floors. Growth/capacity remains provisional and can be configured/versioned
without a new game settings screen. It is not silently clamped on capacity failure.

D1.1 evidence: 83 focused tests passed (new module policy/role allocation plus
unchanged v2 ordinary and streamed generation), and `tsc --noEmit` passed. This
does not yet qualify new geometry or make it the ordinary game's default.

D1.2 initial evidence: 13 assembly tests passed, including six seeds at each of
7/11/13/16/32/64/128/256 modules (48 generated floors), explicit direct-only and
passage-only policies, incremental/eager equivalence and socket replay/fencing.
Every sampled floor met the per-floor fork and maximum unbranched-run checks,
25% room/envelope coverage and 65,536 projection-cell guardrail. These are test
results, not yet a measured performance report or native persistence proof.
New finite assembly uses `modules-v3` / `branching-v1`; `spaces-v2` generation and
its durable readers remain untouched. The compiler is transient, not a world store.

## Bounded Implementation Verticals

| Commit-sized vertical | Scope | Evidence before next vertical |
| --- | --- | --- |
| D1.1: policy and failing structural cases | Explicit recipe/layout versions, module/connection identities, bounded role allocator and agreed acceptance tests. Keep old default readers unchanged. | >8 roles total and valid, prime counts 7/11/13 not forced into chains, old recipe next expansion unchanged. |
| D1.2: assembly and joins | Evolve existing topology boundary for direct sockets/optional short passages and bounded branching placement. No RPG/Agentica state duplication. | Deterministic multi-seed module growth, no overlaps/invalid joins, direct-only and mixed fixtures, honest spatial exhaustion, proposal/commit replay and atomicity. |
| D1.3: ordinary game projection | Wire new floor creation and first entry to unseen floors to the new assembly. Preserve archives; update normalizer/renderer version predicates and stable IDs. | New layout is actually playable in the RPG; legacy geometry/loot/quests remain unchanged, mixed-version floors persist, stairs/portal return and chest targets remain reachable. |
| D1.4: integrated quality/compatibility | Repeat D0 sweeps plus new candidate corpus, native persistence tests and manual/auto traversal with encounters disabled in tests. | Signed-off structural/compatibility evidence, desktop/mobile screenshots, bounded work measurements, no providers or Agentica feature expansion. |

Full new-version stream save adoption is not required for the finite RPG repair.
If implementation exposes it, new-version readers/validators must use actual
spaces/connections/objectives rather than v2 passage arithmetic, and native-IDB
proof becomes mandatory. Existing v2 stream slots and known-destination fixtures
must continue under their original interpretation regardless.

## Acceptance Matrix for Review

The table below preserves the proposed acceptance; actual PASS/limits and exact
evidence are in the [integrated ledger](reviews/d1-qualification.md).
Numeric thresholds are provisional qualification policies under the approved
direction; D0 measured baselines are in a separate file.

| Category | Proposed acceptance |
| --- | --- |
| Growth | Explicit feasible budgets 8, 12, 16, 32, 64, 128 and 256; actual module count meets the accepted budget or reports explicit bounded infeasibility. No absolute eight-cap or silent shrinking. Include prime 7/11/13 and increasing/deep level mapping. |
| Structure | Connectivity, two forks at 12+ and median fork fraction >=15% at 32+ over the fixed corpus; endpoints/branch lengths/diameter reported so a star or identical repeated tree is not automatically accepted. Review actual maps alongside statistics. |
| Coverage | Proposed median room-footprint/envelope coverage >=25% at 32-128 rooms; median cannot fall by more than half between those bands. This is not ordinary-grid walkable coverage. Room size and passage lengths remain bounded independently of level. |
| Validity | Zero overlaps, nonreciprocal/dangling doors, invalid roles/IDs or unreachable required targets in feasible fixtures. Explicit tiny/impossible cases fail boundedly instead of inventing overlapping rooms. |
| Work | Declared bounded candidates per attachment, occupancy reads and projection cells; compare operation counts by scale. Proposed sweep timeout remains 180s/cohort, but is not a gameplay latency claim. Report reservation-array work separately if still uninstrumented. |
| Determinism | Same version/seed/policy has identical geometry and stable room/connection IDs; equivalent expansion demand orders cannot choose different placements. Eager projection and incrementally expanded assembly agree. |
| Persistence | Legacy original/classic/v1/v2 plus incomplete spaces-v2 retain geometry, discovery, receipts, opened chests and claimed quests. Preserve original-attempt reconciliation. New fields survive load/save; unsupported/corrupt versions fail explicitly, not regenerate silently. |
| RPG effects | Existing chest cap/reward rules, quest eligibility, inventory, portal resources and combat rules remain owners. More rooms do not imply new reward multipliers or an imported stream chest counter. No balance edits. |
| Player view | Direct doors and passages match walkability/wall drawing; no void painted as floor. Verify new layouts on desktop/phone, normal stairs and saved floor revisits, existing Auto traversal and immediate manual takeover. |
| Integration safety | Existing known-destination and provider-free durable cohorts remain regressions. Do not change the service/SDK or run paid tests to qualify geometry. |

## What D1 Will Not Claim

- No infinite-world proof from a 256-room sample, and no promise that an eager RPG
  save has the same storage/residency bounds as streamed topology.
- No Agentic Play parity from reusing a movement function. A0-A3 still have to
  bind real shared effects and gate every target, route and disclosure by knowledge.
- No new causality system, loot balance, full inventory/town integration or combat
  ownership. The two-dungeon corpus needs static visible obstructions, not a
  remote lever system. Combat stays disabled in the first integration tests.
- No forced change to existing saved layouts or their generator version.

After D1 review/approval and implementation, proceed through A0-A3 and the
[paired qualification](two-dungeon-qualification.md). Publish each checked
vertical promptly; do not hold the whole goal locally before review.
