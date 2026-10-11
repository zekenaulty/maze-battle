# Two-Dungeon Qualification: Earned Knowledge and Intentional Play

Status: proposed acceptance specification, NOT RUN. Integrated revision 1,
2026-10-11. Derived from Lumina's owner-approved NS-6 continuation draft v0.1;
sequenced behind the dungeon repair in [the next-slices plan](agentic-play-next-slices.md).
This is a game-owned scenario configuration, not a separate game implementation.

## Question and Evidence Levels

Can an agent select and revise intentions using only legitimately acquired
evidence while the existing game executes routine work locally?

Prove two different things separately:

1. Information integrity: a deterministic fixed-action comparison of paired
   hidden worlds, independent of any model's behavior.
2. Model competence: a separately authorized live run in each world, showing
   choices from incomplete evidence and appropriate adaptation after discovery.

The successful known-destination smoke run proves neither gate. Reusing its
durable navigation mechanics is appropriate; reusing its discovery prelude for
this test is not. Scripted provider success is not live model competence.

## Shared Start and Objective

Objective shown to the actor: **Locate the survey seal in an ordinary chest,
retrieve it, then return to the entrance.**

Both worlds have the same starting cell, normal actor stats, initial knowledge,
allowed tools, grants and observation policy. Only the entrance and a short
corridor segment have been observed. A fixed corridor leads to a junction beyond
initial perception. The first frontier must be chosen from observed affordances.

Do not reveal seeds, hidden room counts, chest locations, reserved socket IDs,
secret routes or ideal-route distances. A quest description must not accidentally
expose the internal target-room ID or coordinates. The survey objective must use
the game's existing item/quest rules where possible; any missing support is an
explicit shared-domain prerequisite, not a harness-only inventory or quest flag.

Combat is disabled. Exclude permanently lethal hazards, artificial time-pressure
victory conditions and tight resource rationing. Explicit operational safety
ceilings are permitted, but never derive them from the privileged ideal route.
Future pressure/economy tests are separate extensions.

## World Variants

| World | First consequential junction observation | Later discovery |
| --- | --- | --- |
| A | North is visibly obstructed; east is passable but unexplored. | Ordinary perception beyond the east bend reveals the survey chest. |
| B | East is visibly obstructed; north is passable but unexplored. | Ordinary perception beyond the north bend reveals the survey chest. |

Before the junction, the permitted surfaces are equivalent. Arrange comparable
exploration complexity without passing the solved route to the actor. Hidden
irrelevant passages or chest contents may differ, but must not affect disclosed
pre-discovery costs, recommendations, warnings or work estimates.

A static obstruction is sufficient: this corpus does not require the deferred
remote-lever system. If actual game primitives cannot express the junction or
objective, record the missing primitive and narrow/extend the shared domain
explicitly; never substitute an isolated simulation and label it RPG parity.

## Stages and Receipts

| Stage | Required behavior | Evidence |
| --- | --- | --- |
| T0: cold start | Equal actor-visible starts and tool surfaces; no pre-exploration or full-map context. | Exact delivered context/schema bytes, knowledge provenance and starting checkpoint. |
| T1: frontier | Agent chooses an observable frontier; host admits bounded local travel. | Selected tool/arguments, original admission, local steps using learned/perceived traversability. |
| T2: junction | Ordinary perception earns the opposite blockage evidence in A/B; this is a real decision boundary. | Source observation, presented context and durable decision-wake reason. |
| T3: adaptation | Agent selects the viable continuation from the newly supplied evidence. | New intention/tool choice; audit against available evidence, not inaccessible model reasoning. |
| T4: collection | Explicitly authorize approach and open/collect; arrival is not collection. | One canonical game item/quest effect and receipt; duplicate action returns original outcome without another grant. |
| T5: return | Known-path movement runs locally; entrance arrival plus actual objective state establishes completion. | Host-evidenced result, durable usage and any honest blocked/incomplete outcome. |
| T6: recovery | Repeat selected checkpoints with reload/suspension, duplicate progress, lost acknowledgment and takeover. | Original identity reconciliation; no unauthorized movement, repeat effect or automatic paid wake loop. |

No fixed count of model calls is a pass criterion. There must be a genuine
frontier selection and subsequent evidence-driven adaptation. A local executor
may follow the forced corridor but cannot make the strategic fork decision using
an oracle, nor force a particular model response to manufacture competence.
Do not automatically invoke the model at every cell, room or timer checkpoint.

## Counterfactual Information-Boundary Gate

Run without an LLM. Hold actor knowledge, public input, requested action sequence
and relevant deterministic clocks constant. Change only unobserved world data.
Compare every actor-visible surface until legitimate observations differ:

- Observation fields, tool availability and schemas, affordances and chosen local
  route proposals, distance/cost estimates, refusals and interruption reasons.
- UI room/map/fog, bounded memory recall, operation status/progress, warnings and
  exact model-presented context; omissions/counts must describe known coverage,
  not total hidden-world cardinality.
- Public timing/work hints and scheduling decisions. Compare logical work under
  controlled clocks; do not claim equal real network latency on nondeterministic
  machines. Audit concealed-state-dependent work where it could influence actor
  choices, and record any timing boundary not yet qualified.

Specify a field-by-field normalization allowlist before comparison. Normalize
only nonsemantic run identities, designated monotonic timestamps and internal
storage keys as needed. Preserve identity consistency across a trace. Do not
strip all IDs, reorder meaningful decisions, erase freshness or normalize away
coordinates, tool differences, counters, errors, costs or missing facts. Preserve
the unnormalized original payloads alongside comparison artifacts.

Before T2, differences outside that allowlist fail the gate. At T2, differing
source observations explain lawful divergence. Reachability/solvability audits
may use a privileged solver offline, but its path, hidden counts, costs or answer
must not enter preparation of actor knowledge, grants or frontier ranking.

## Shared-Game Authority and Scaling Gates

- Manual, Auto and Agentic execution of the same authorized command from equivalent
  preconditions produce the same canonical game-world effect. Controller-specific
  receipts/identities may differ; game rules, item effects and quest state do not.
- Existing Auto's privileged target enumeration must not bypass perception through
  a helper. Share validated effects and safe local behaviors, not omniscience.
- Exactly-once applied effects, stale-epoch refusal, original-result replay and
  transactional custody survive interruptions. Unknown delivery is not permission
  for a new action ID, a second reward or a replacement provider run.
- Grow total topology substantially while retaining bounded room detail, paged
  known-room graph and deliberate distant recall. Measure read work and payloads,
  not merely a sliced final JSON object after reading the entire dungeon.
- Qualify representative generated layouts separately from the authored A/B
  fixture. Two good small layouts cannot qualify the generator's depth scaling.

## Execution Manifest and Reporting

Before implementation qualification, record Maze/Agentica SHAs, SDK hash, scenario
and generation version, seed, actor/knowledge genesis, objective, perception
policy, allowed capabilities, custody and journey policy, cumulative provider
policy if applicable, and exact commands/fixture environment. Keep audit-only
seeds and world truth out of model context and any readable actor evidence store.

Record immutable source events, legal observations, memory revisions, exact
delivered contexts, tools/arguments, receipts, local steps, simulation ticks,
model calls, input/output bytes, tokens when available and wall time. Distinguish
setup, transport/provider turnaround, local execution and persistence; do not
attribute unmeasured time to slow networking or model reasoning. Retain failures
and repetition counts, not only the successful trajectory.

Order: focused domain tests -> real Chromium/IndexedDB -> SDK/.NET deterministic
provider fixture -> separately authorized live A/B trials. Preserve the existing
known-destination/recovery cohorts as regression checks. Desktop/mobile checks
must inspect the same perception projections, without altering the user's saves
or current preview.

Pin model/config and owner-approved cumulative bounds for live tests. Do not
require identical stochastic tool choices across worlds before divergence;
fixed-action replay proves equivalence, while live trajectories test judgment.
No new paid run, merge or deployment is authorized by this plan.

## Acceptance Receipt

For each gate report PASS / FAIL / NOT RUN, exact source and scenario identities,
commands, evidence location and remaining gaps. Required categories:
information integrity; shared gameplay authority; meaningful choices/delegation;
effect custody; durable recovery; bounded-context growth; and live competence
only when actually tested. A completion flag, fixture pass or pushed commit alone
does not qualify the integrated game.

Deferred: full inventory/town parity, resource-pressure balance, remote causal
mechanisms, anchored content materialization, Dungeon Master authoring, broader
NS-7 proof and the user's later combat ownership design.
