# Issue 11: Bounded S2 Reconciliation

2026-10-23. Isolated `codex/corpus-s2-reconciliation`, base `77e149c`.
Test/artifact audit only. No production, SDK, provider, browser, service, parent
or owner-origin changes. No listener was started.

## Result

The existing proofs cover the scoped queries, earned movement/history/refusals,
human map/fog/status, and complete planner inputs. The smallest missing assertion
was comparison of the surrounding service traffic, not another gameplay route.

**Strict ordered receive-wire equivalence does not pass the retained pair.**
The added audit preserves this failure instead of sorting messages or silently
expanding metadata allowances. This is not evidence that private A/B content
caused the ordering difference, and it does not justify an SDK/runtime repair.
The exact ordered-wire claim remains unqualified; S2 is not declared closed.

## Existing Coverage

Artifact paths below are under the parent's `test-results/`. Results JSON was
read directly; no historical pass is relabeled as a new `77e149c` native run.

| Surface | Source / retained evidence | Qualified boundary |
| --- | --- | --- |
| Inspect scopes and opaque refusals | `canonical-corpus.queries.spec.ts`, query report; `canonical-corpus-ui-parent-regression/results.json`: 8 PASS, 130.810s | Controlled exact start/actions/results at 0/6; selected remembered cell, quests/objective/initial unavailable decision, positive room-only connections and opaque unknown/passage refusals. Admission is offline typed evidence. |
| Movement/progress/terminal, nonempty history and refusal | `canonical-corpus.navigation.spec.ts`, navigation report; `corpus-closeout-navigation/results.json`: 2 PASS, 61.904s, integrated `95b4069` | Exact 0/6 output; lawful sight divergence at 7; original immediate history, old-result replay, explicit source-corruption refusals and funded cleanup. Offline custody, not service transport. |
| Dungeon/Rooms/Nearby, fog, status/control | `canonical-corpus-ui.spec.ts`, UI report; `canonical-corpus-ui-parent/results.json`: 2 PASS, 58.374s, integrated `158d3e5` | Actual desktop/portrait App, raw GameView/DOM/control/pixels at 0/6/7, zero writes. Does not include Storage Diagnostics counters or capacity warnings. |
| Complete initial/refinement/successor planner inputs | `canonical-start-service.app-planner.spec.ts:61-96`, planner report; `maze-start-service-Wl7MZr/results.json`, candidate `bbdadf1` | 16 actual captures, independent wire/run/continuation binding. Calls 0-6 equal under existing narrow metadata allowances; call 7 differs only in lawful frontier evidence. The full 48-case run includes this pair; it is not 48 information-gate cases. |
| Surrounding wire/status/diagnostic fields | New `canonical-start-service.public-wire*.mjs`; same original Wl7MZr raw attachments | New strict audit: host Start/results/wake and bound progress exchanges compare; ordered service receive stream fails as detailed below. Unknown fields are retained, not projected away. |

The existing controlled query-work report and newer work-threshold report are
not substitutes for these gates. Private read-byte differences, rendered storage
work counters, counter-width thresholds and capacity-induced refusal are **S4**.
`corpus-closeout-queries-work` contains eight earlier cases plus one passing
characterization of an information-boundary FAIL, not nine green information tests.

## Exact New Evidence

Input: parent `test-results/maze-start-service-Wl7MZr/results.json`, SHA-256
`01978b77303ea4c4bc615c8b11e9e4cc6d17fdb7ef05df4498e0d29b96805c3c`.
The audit reads `planner-pair-raw.json` and `native-decision-service-proof.json`,
validates planner/window/source binding, and compares through the successor's
first frontier result and its first service acceptance. It also compares the
original operation's eight progress request/reply pairs preceding the wake.

Each world contributes 9 outgoing frames, 89 incoming frames and 8 progress
pairs. The first eight outgoing frames and all progress pairs have no residual
differences. Outgoing frame 8 has the same 20 lawful frontier leaf differences
represented three times in the existing complete-planner comparison (60 leaves).
There are no residual gameplay/status/error/diagnostic-value changes outside
the incoming positions affected by interleaving. No nested storage WorkStats
field is present in the selected traffic. This is not a complete HTTP inventory,
all-time traffic, rendering of every transient UI message, or physical timing proof.

Incoming zero-based positions 11-13 in the initial window are:

| Position | A | B |
| --- | --- | --- |
| 11 | `status {status: running}` | `action.accepted {actionId, disposition, evidenceId, afterRevision}` |
| 12 | `action.accepted {actionId, disposition, evidenceId, afterRevision}` | `action.accepted {actionId, duplicate: false}` |
| 13 | `action.accepted {actionId, duplicate: false}` | `status {status: running}` |

The two ACK forms also swap at positions 22/23 and 33/34. The strict traversal
reports **30 incoming leaf differences**, plus the 20 lawful outgoing leaves.
It does not erase missing/extra frames, reorder, deduplicate or mask statuses,
errors, unknown fields, diagnostics, gameplay, revisions or usage.

The pinned clean Agentica `27cb2ce9717438edfe19487e3920faa183112c97` explains a
scheduling mechanism: `Agentica.Lab.Web/Runtime/HostRun.cs:236-238` completes the
action task before queueing its acceptance; `:421-422` resumes and publishes
running status. `LabWebApplication.cs:244` sends the other ACK directly.
`Transport/HostSocket.cs:30-49,79-93` has a progress pump and direct sends sharing
a send semaphore, not a deterministic combined producer order. This supports an
interleaving explanation; it is not a controlled proof of timing independence.

## Verification And Limits

From the isolated checkout:

```powershell
node --test --test-reporter=tap --test-reporter-destination=test-results/s2-public-wire-units.tap tests/e2e/canonical-start-service.public-wire.test.mjs tests/e2e/canonical-start-service.planner-compare.test.mjs tests/e2e/canonical-start-service.planner-wire.test.mjs
node tests/e2e/canonical-start-service.public-wire-audit.mjs C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/test-results/maze-start-service-Wl7MZr/results.json test-results/s2-public-wire-Wl7MZr-final.json
```

- Node 22.13.0: **21 PASS / zero skips**, 151.534ms (13 existing + 8 new).
  Mutation checks retain order changes, missing/duplicate frames, changed ACK
  bindings, diagnostics/unknown fields, nested storage counters and bad digests.
- Artifact audit: **FAIL, exit 1**, as required by the ordered comparison.
  The output retains selected raw frames, all 891 applied metadata allowances,
  source hash and all 50 residual leaves. Earlier development output
  `s2-public-wire-Wl7MZr.json` remains; source evidence was never modified.
- Existing planner comparator/allowlists, native specs, fixture registration,
  profiles, budgets and service counters are unchanged. New allowances apply
  only to concrete wire identity/clock paths and receipt elapsed duration;
  start digests are validated against whole raw requests first.
- No new native/service or type/build campaign: only new `.mjs` audit/tests.
  The retained service run used .NET 10.0.401, not pin 10.0.302; paid calls were
  excluded by the offline fixture, not measured through billing telemetry.

The remaining decision is narrowly about the acceptance claim: exact total
receive order versus explicitly reviewed causal-message equivalence when
independent producers interleave. This commit does not add such an allowance.
Do not rerun until a lucky trace matches, or change the SDK merely to conceal a
timing difference. S4 work/capacity and S6 frozen-candidate qualification remain
separate; no new fault/position matrix is proposed.
