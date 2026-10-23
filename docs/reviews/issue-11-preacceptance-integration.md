# Pre-Acceptance Recovery Integration

2026-10-22 local. Runtime/fixture candidate `33bd2390d867994e22975f8c40f0b0d7d748dd57`
on `codex/agentic-game-a1`. This follows the
[six-case pre-ACK integration](issue-11-preack-capacity-integration.md), not a
replacement for its retained failures or proof limits.

## Repair And Review

Integrated `a29f286` / `d374288` from the isolated
[delivery-cut report](../../tests/e2e/canonical-start-service.corpus-preacceptance.md).
Local Stop previously left the final launch reservation pending when a genuinely
committed successor completion had never reached the service. The recovery
adapter only supported ungranted no-effect results.

The new proof permits only an exact retained `maze.inspect` objective-completion
result committed before irreversible local Stop. It validates predecessor claim,
successor grant, original action/publication, original result/source, cancellation
and current fence. Explicit reconciliation uses the existing HTTP recovery
contract and verifies remote pinning; it does not execute the action again,
refresh world evidence, attach an SDK loop or wake a planner. Root/session
clearance remains unknown until the separate funded Stop/ACK sequence completes.

Independent source review found no production blocker. It found a test gap:
post-recovery root identity was used as its own ACK expectation. `33bd239` now
also compares that guard's ID and admission attempt with the original admitted
root before checking its actual ACK source receipt.

## Integrated Results

| Gate | Result / raw evidence |
| --- | --- |
| Actual App + native IndexedDB + actual offline service | **4 PASS**, 0 fail/skip/retry, **389.546s**; `test-results/maze-start-service-bLARhm/` |
| Focused runtime/React proof tests | **91 PASS**, 7 files, 27.37s; `test-results/preacceptance-parent-runtime.json` |
| Before-dispatch fault checks | **2 PASS**; `test-results/preacceptance-parent-fault.json` |
| Existing accepted-loss fault checks | **7 PASS**; `test-results/preacceptance-parent-existing-fault.json` |
| Root and service-fixture TypeScript | **PASS** |
| Isolated production build | **PASS**, 2,148 modules; `test-results/preacceptance-parent-build/`; existing >500-KiB warning |

The four integrated native cases use one service process and cover both existing
accepted-but-lost interaction/completion replies and both new before-acceptance
cuts. The new faults withhold actual fetch/socket dispatch, not merely the reply.
They prove exact original effect/replay, one collected item, unchanged gameplay
state through reconciliation, no new cognition, and zero outstanding reservations
after verified cleanup. Final remote Stop is stopped/interrupted, not fabricated
workflow success. No integration failure or retry occurred in this run; the
isolated report retains the earlier runtime reproduction and fixture failures.

Agentica is clean `27cb2ce9717438edfe19487e3920faa183112c97`. The service build
has zero warnings/errors. SDK **10.0.401** was used, not repository pin
**10.0.302** (`pinProof:false`). Provenance retains source, fixture and assembly
hashes. Ports 5268/5269 were free after completion. No owner preview/database,
provider credential, production quota, schema version or service/SDK code changed.

## Capacity Prerequisites

`0c96e1e` adds the independently reviewed pure fixed-boot initialization envelope;
`48d3afa` adds populated-namespace preparation writer tests. These are not wired
to runtime admission. The [bound report](issue-11-initialization-capacity-bound.md)
states the exact producer grammar, policy-golden and one-flush assumptions.
Public boot overhead is 37,361 logical bytes; the cumulative 16-floor preparation
envelope with that overhead is 239,493,859 bytes. It is **not** a 16-floor played
journey claim. Ordinary movement/history and Agentica events still need capacity.

Parent 41-case base/helper suite passed before the populated-namespace addition;
its report is `test-results/initialization-capacity-parent.json`. The subsequent
**43-case parent suite PASS** (41.68s, seven files) is retained at
`test-results/initialization-capacity-populated-parent.json`. The 43 include the
earlier 41; these are not additive counts. Both seeds' 28 selected phase groups
fit unchanged bounds and preserve exact public rows, indexes and roster witness.

The [read-only work-disclosure audit](issue-11-work-disclosure-audit.md) confirms
raw `readBytes` are not currently in actor tool results or rendered diagnostics.
It separately identifies rendered work counters and work-budget refusal as
observable channels. This narrows the next tests; it does not close them.

## Remaining Acceptance

S3's declared delivery cuts now have integrated native evidence. Reconcile them
with the existing takeover, duplicate and quota/cleanup matrix before closing
that sprint; do not multiply every fault by every checkpoint. Full candidate
regression remains S6. Initial-grant completion recovery, arbitrary pending
effects and service-process failure are not proved by this narrow repair.

The reproduced quota disclosure remains **FAIL**: the pure helpers have no
runtime callers. S4 must integrate exact allocation provenance and atomic
charging while preserving replay and funded cleanup, then run native threshold,
tamper/abort, restore and command-work/diagnostic checks. S5 must qualify meaningful
generated travel/history growth, not only preparation fit. Final qualification
and any separately authorized live-model gate remain outstanding.
