# Issue 11: S2 Causal Wire Comparison

2026-10-23. Docs-only analysis on `2d2c923`, based on `77e149c`.
Pinned Agentica: clean `27cb2ce9717438edfe19487e3920faa183112c97` in
`C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`.
No production/test changes, new native/service runs, providers or listeners.

## Decision

S2 does **not** require identical total WebSocket receive order for the specific
independent status/ACK deliveries below. It does require identical substantive
content, identities, multiplicity, source sequences and required causal order
through the common earned prefix. The plan explicitly excludes equal physical
timing (`docs/canonical-persistence-plan.md:674,690`); the protocol specifies
separate delivery paths, not a combined cross-producer sequence.

Use an explicit, bounded frame-correspondence witness, not a sorted transcript.
The strict ordered audit in [the prior report](issue-11-s2-reconciliation.md)
remains **FAIL**. This note proposes a more precise acceptance contract; it does
not change that audit or declare S2/final-candidate qualification complete.

## Source Basis

Paths in the first four rows are in the pinned Agentica checkout above. Maze
paths are at `2d2c923`; these consumer paths are unchanged by that test commit.

| Source | Consequence |
| --- | --- |
| `docs/external-host-browser.md:171-176,395-405,427` | Direct `action.accepted {actionId,duplicate}` and acceptance telemetry with disposition/evidence are distinct. Neither is another effect. `action.pending` is observational; `action.request` invokes. Progress and awaited control/action/terminal messages have separate send paths. `outcome`/`run.terminated` are terminal, not interchangeable telemetry. |
| `Agentica.Lab.Web/Runtime/HostRun.cs:205-239,411-423,445-484`; `Context/HostThoughtTesting.cs:48-84` under `Agentica.Lab.Web` | The original result is validated, context/result linkage recorded and custody resolved before the action task completes. Its continuation publishes `running` and constructs the receipt/observation from that result. Acceptance telemetry is published after task completion. Planner evidence is not reconstructed from browser receipt order. |
| `Agentica.Lab.Web/LabWebApplication.cs:239-244`; `Transport/HostSocket.cs:19-24,30-51,79-93` under `Agentica.Lab.Web` | The direct ACK follows `AcceptResult`; queued telemetry and the direct ACK compete for a send semaphore. `running` and acceptance telemetry can also be enqueued by different continuations. FIFO within the progress queue is not a promised total production order across these continuations. No hidden world field selects this delivery order. |
| `Agentica/Execution/AgenticaRunner.cs:2124-2129,2160-2165,2188-2205`; `docs/durable-host-operations.md:133-145` | Core events have a per-run sequence assigned under the event delivery gate. Durable operation events separately require the next sequence and immutable retry identity. These are real sequences, unlike an invented global WebSocket sequence. |
| `src/services/agentica/sdk/agentica-host.mjs:572-623,673-727` | The three affected frame forms enter the bounded message history/display callback. With no matching pending `requestId`, they do not resolve controls, install bindings, queue actions, change operations or stop a run. Wire `status` is not SDK `onStatus`. The current result send has no `requestId` and does not await either ACK form. |
| `src/services/agentica/game/transport.ts:44-59`; `decisionChannel.ts:36-46` | Maze consumes correlated start binding and terminal/transport-failure notices, not the affected status/ACK frames. These frames neither dispatch gameplay nor publish fresh context. Terminal notices, disconnects and protocol errors do withdraw authority and cannot be commuted under this exception. |

The underlying accepted result is a causal prerequisite of all three notices.
The two ACK *production* sites are not arbitrary independent operations: the
telemetry is enqueued before the direct-send call. Their **delivery** order is
not guaranteed because the pump and direct path share the send gate. This
distinction does not relax result/custody ordering.

The SDK message ring and a generic display observer can see the chronology.
Therefore this is not byte-identical display-history or universal timing-channel
noninterference. Current Maze does not feed that ring or those notices into its
action policy or planner context. Changed consumers require a new audit.

## Retained Pair, Explicit Correspondence

Original input remains parent `test-results/maze-start-service-Wl7MZr/results.json`,
SHA-256 `01978b77303ea4c4bc615c8b11e9e4cc6d17fdb7ef05df4498e0d29b96805c3c`.
The unchanged strict report is isolated
`test-results/s2-public-wire-Wl7MZr-final.json`, SHA-256
`15eee4d3738e2c0d17eb88005690e17afef896f55118875104ffd1bc4b57794c`.

A read-only Node analysis explicitly paired these zero-based receive indices;
every other index mapped to itself. No raw frame was rewritten or discarded.

| A index | B index | Matched form |
| --- | --- | --- |
| 11 | 13 | `status {status:running}` |
| 12 | 11 | First action's acceptance telemetry |
| 13 | 12 | First action's direct ACK |
| 22 | 23 | Second action's direct ACK |
| 23 | 22 | Second action's acceptance telemetry |
| 33 | 34 | Third action's acceptance telemetry |
| 34 | 33 | Third action's direct ACK |

Both sides contain 89 incoming frames, 9 outgoing frames and 8 progress
request/reply pairs. Whole-frame comparison through this bijection, using only
the existing declared identity/clock allowances, has **zero incoming residual
content differences**. Its only residuals are the 20 already-qualified frontier
leaves in outgoing frame 8. This is a correspondence result, not an ordered PASS.
The analysis asserted that the report bytes remained unchanged.

The three blocks remain after their own `action.pending` and before their own
`observation.made`; no action, core event or terminal boundary changes position.
All 16 statuses retain their within-run order. All 39 core events retain their
positions and sequences (initial run 1-24, successor 1-15). Progress sequences
remain 1-8. The initial outcome at index 53 remains `partiallyComplete/partial`,
with four receipts and four observations. No `telemetry.gap` or `error` occurs
in this selected stream. The cut includes the first acceptance of the divergent
frontier result, **not** the successor's final outcome or all later traffic.

## Smallest Comparison Contract

1. **Keep two products.** Retain original serialized evidence, timestamps,
   receive indices and strict comparison. Separately emit a complete bijection
   of raw indices with identity, producer/form and the reason for each changed
   correspondence. Preserve duplicates as occurrences; never sort/deduplicate
   raw arrays or replace evidence with a normalized transcript. Ambiguous or
   unclassified correspondence fails, rather than searching for a passing order.
2. **Compare whole frames.** Use the existing globally consistent identity map
   and explicit clock/hash rules, including compact/full reference validation.
   Compare every other field, unknown fields, presence, counts, revisions,
   usage, errors, diagnostics, outcomes and observation/source data. Only the
   existing earned-frontier leaf allowance begins at the first lawful disclosure.
3. **Permit only this delivery commutation.** For a uniquely bound, already
   accepted action, the direct ACK and acceptance telemetry may exchange receipt
   positions; its one `running` notice may interleave with them. Bind both ACKs
   to the original action/result, including evidence/revision and duplicate
   disposition. All have null `requestId` in this evidence. A `running` notice
   has no action ID: associate it only inside the unambiguous single-action
   interval. For this bounded gate keep the block between its matching pending
   notice and first following core observation event. Do not extend this to
   crossings of other events, controls, actions or windows merely because the
   same message types appear elsewhere.
4. **Keep source order and authority fences.** Require the original core event
   `(runnerRunId,sequence)` order, operation sequence/ACK linkage, ordered status
   transitions and action dispatch/result order. Status/ACK frames have no wire
   sequence; do not invent one. Preserve start/wake/adoption binding before
   authorized invocation, accepted-result/context linkage before refinement,
   predecessor custody ACK before successor effects, and Stop/terminal withdrawal
   of fresh authority. A direct action-result ACK is not a progress/transfer/Stop
   custody ACK. Required causal order is never inferred from telemetry arrival.
5. **Do not excuse observable failure.** Missing/extra frames, changed unknown
   fields, telemetry gaps/truncation differences, queue overflow, disconnect,
   deadline/refusal/outcome changes or new cognition/effects fail this no-loss
   comparison. Equal physical durations are unnecessary; changing a deadline's
   effective allowance or crossing a timeout is not harmless metadata.

This is narrower than general partial-order equivalence. It accounts for the
actual three blocks without granting an all-telemetry reorder allowance or
altering production ordering. The proposed rule is not yet an executable gate.

## Distinguishing Scheduling From Disclosure

Already established here: a source-supported send race; a full-content
correspondence with no missing frames; unchanged causal anchors; and the
retained complete planner captures (calls 0-6 equal, call 7 first lawfully
different). There is no consumer dataflow from the three delivery forms to
Maze effects or the service's accepted-result context. These support treating
the observed mismatch as permissible delivery interleaving, not evidence of
hidden-content disclosure. They do not establish a world-independent timing
distribution from one A/B sample.

The smallest additional executable check, if needed, is a finite **consumer
commutation** regression: replay the exact two observed block orders through
the real SDK and current Maze channel callbacks on the same bound action state.
Deliver every original frame once, hold all other input fixed, then release
the same next action. Require identical grants, pending controls, action/result
submissions, save/reserve/effect counts and withdrawal state. Retain both raw
streams and permit only the documented message-ring chronology difference.
Use a terminal-order negative control to ensure the check detects fresh
authority changing, and missing/changed-ACK negatives to test the correspondence
gate. This is offline consumer proof, not another native route or service proof.

If a causal claim about the *service scheduler itself* is required, use one
public-prefix acceptance with a test-only send/pump gate: hold public request,
accepted result and planner inputs fixed, force the two already-observed
delivery schedules in each A/B world, below existing deadlines and queue caps.
Require identical whole frames/causal sequences and complete next refinement
input within each world, plus unchanged action/effect/outcome behavior. Record
production/enqueue/send/receive positions separately; never feed the capture or
world variant into planning. That bounded two-world/two-schedule intervention
separates a schedule effect from a private-world effect at this cut. It cannot
prove universal absence of timing channels. Neither proposed check was run.

Recommendation: retain `2d2c923` as the strict diagnostic; accept only the
explicit source-justified correspondence contract after review. Do not repair
production ordering or rerun until a lucky total-order match. S4 work/capacity
thresholds and S6 frozen-candidate qualification remain separate.
