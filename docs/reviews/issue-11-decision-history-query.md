# Explicit Historical Decision Query

2026-10-20. Issue #11 remains open. Runtime `4abe739`, actual-service fixture
`ee7744b`; Agentica unchanged at `27cb2ce9717438edfe19487e3920faa183112c97`.

## Boundary

Decision renewal intentionally supplies current actor context, not an expanding
history dump. That meant the successor had no explicit tool for retrieving the
original source-bound material notice. The new query fills that gap without
changing retained intent/wake/cleanup formats or making history current truth:

```ts
maze.inspect({ scope: "decision" })
// Initial grant:
{ scope: "decision", state: "unavailable", reason: "initial-window" }
// Successor grant:
{ scope: "decision", state: "historical", event: originalTerminalEvent }
```

The query follows only the authenticated current successor's immediate
predecessor intent. It verifies the original observation against immutable
progress, transfer or confirmation evidence and its settle receipt. Arbitrary
intent IDs, history traversal, cursor arguments and narrow grants are refused.
It creates no movement, completion authority, inventory, world or knowledge
change. No second store or compatibility reader was introduced.

Fresh preparation revalidates live authority and snapshots inputs before awaits.
Read caps are 128 distinct source reads, 1 MiB returned logical data and 1,024
lookups. Oversize historical events refuse explicitly rather than truncate or
raise the 2,800-byte observation / 3,584-byte start limits. The configured start
now measures 3,573 bytes. Historical replay validates the retained proof, not
today's grant, live operation or world state.

## Actual-Service Proof

The actual App explores one earned room for four local steps, stops at a
source-bound `other-space-visible` notice, and waits. Closing/reopening the panel
does not wake the planner. An explicit Continue grants one successor.

Its renewed wake contains actor-only data. Two explicit historical queries return
the exact original event/notice despite that renewal, with distinct query
observation IDs. The successor then chooses its current disclosed position for
zero-step navigation. This last action is custody evidence, not travel progress
or objective completion. Total: five choices, two planner instances, three
refinements, one Continue, zero paid calls.

Stop and verified child/root recovery release all local allocations. A normal
manual look then advances sight sequence 5 to 6. Retrying the completed SDK hooks
returns the original query bytes with zero command submissions, unchanged
current state and no new planner calls. This is retained local-hook replay,
not a second remote delivery/ACK proof.

Measured parent cohort:

| Measure | First query | Second query |
| --- | ---: | ---: |
| Distinct fresh-preparation reads | 40 | 40 |
| Fresh-preparation logical bytes | 209,871 | 210,017 |
| Resolve-transaction storage reads | 96 | 97 |
| Resolve-transaction writes | 9 | 8 |
| Resolve logical read bytes | 242,400 | 245,658 |
| Resolve logical written bytes | 12,338 | 11,822 |

Preparation meters are nested and share authorization reads; they must not be
summed as separate physical operations. Resolve statistics exclude earlier
reservation and later replay/delivery work. These are logical bytes, not disk
writes or exact structured-clone CPU costs.

## Verification

- Full actual-browser/pinned-service cohort: **37 PASS**, 578.58 seconds,
  no failures/skips/retries; `test-results/maze-start-service-SyQLl1/`.
- Full unit run before final page-reader repair: **4,475 PASS**, one existing
  optional SKIP, using four workers; `test-results/decision-query-full-unit-bounded.json`.
- Final changed query/manifest/bounds scope: **123 PASS**, including a
  prototype-method regression; `test-results/decision-query-final-focused.json`.
- Production/service-fixture types and isolated build pass. Existing bundle
  warning remains. Build output is separate from the owner's 5198 preview.
- Independent source review plus twelve adversarial probes found no further
  runtime defect. Unit replay reads seven fixed sources / 11,399 logical bytes,
  unchanged after 1,000 unrelated retained records. This is not a native
  whole-database growth benchmark.
- Final planner-side exact-reception assertion: **1 PASS**, 23.7 seconds,
  no retries/skips; `test-results/maze-start-service-0ssyKK/`, fixture `672a952`.
  A fixture-only bounded output captures the two events actually received by
  the planner, and compares every field to the pre-renewal original. It supplies
  no oracle input. Agentica sorts object keys; structural equality is exact,
  while raw host outbound/replay bytes are checked separately.

The first unrestricted full unit run had 4,474 passes and one 62.6-second
large-autopilot failure at its 60-second test limit. Its unchanged focused rerun
passed all eight cases (large simulation 23.3s), followed by the bounded-worker
full pass. No timeout or gameplay assertion was relaxed.

Two first service attempts in the isolated authoring checkout (`om0xel`,
`DuGcyi`) stopped after two results; the diagnostic repeat recorded
`pages.get is not a function`. Spreading a class-based page reader lost prototype
methods. Explicit forwarding now preserves methods and their receiver, with a
regression test. Mock-only success was not treated as real-service qualification.
The first planner-output assertion candidate (`fNUBHr` in the authoring checkout)
also failed an unnecessary serialized-key-order comparison; all field values
matched. The final assertion permits Agentica's documented key sorting without
normalizing away any value, identity, timestamp, notice or source.

The fixture uses offline planning and isolated cached SDK 10.0.401, not repository
SDK pin 10.0.302. No paid provider or owner preview/database was touched.

## Remaining

This case qualifies same-owner progress-sourced history after one renewal.
Adopted/post-transfer queries, zero-progress source variants and deeper ancestry
still need composed native/service proof. Existing takeover regressions pass,
but do not qualify the new query in every ownership state.

The wider A/B information/recovery/capacity matrix, repeated actual-App
backtracking across owners, and separated depth/history-growth measurements
remain open. Retrieval is an operation the agent may choose, not automatic
cognition or evidence of model judgment. Full RPG parity and combat remain later.

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
# Focused service case:
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep "historical decision"
```
