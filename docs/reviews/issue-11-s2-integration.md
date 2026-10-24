# Issue 11: S2 Wire And Consumer Qualification

2026-10-23. S2 is complete at its declared bounded evidence level on candidate
`9f85405`, subject to S6's final integrated run. Issue 11, S5, S6 and the umbrella
goal remain open. Agentica source and production SDK/runtime code are unchanged.

## Comparison Contract

The comparison retains every original sent/received/progress frame, occurrence
and unknown field. A separate complete index bijection identifies bounded
correspondence. Metadata allowances remain explicit and globally consistent.
Original request digests, core event sequences, action order, deadlines, custody
ACKs and terminal boundaries are checked; no raw array is sorted or deduplicated.

Only two source-supported delivery blocks may correspond out of receive order:

- Acceptance: one direct ACK, one evidence ACK and optionally one `running`
  notice, after the original pending action and before its observation event.
  Both ACKs bind the exact original action/result/run, disposition, evidence and
  revision. This fresh prefix requires `duplicate:false` and null request IDs.
- Dispatch: the direct `action.request` may interleave with its FIFO
  `awaiting_host` / `action.pending` notices. The three-frame block lies after
  its own `step.started` and before its acceptance. Request and pending contain
  the same complete original. Waiting remains before pending; core events and
  unrelated actions cannot cross the block.

Source justification is pinned Agentica `HostRun.cs:383-423` and `:205-239`:
status/pending and acceptance telemetry are queued, whereas action requests and
direct ACKs use the direct connection path. The shared send gate serializes each
send, without establishing a combined producer order. The current Maze consumer
does not derive authority or planner context from those informational notices.
See the [earlier causal source review](issue-11-s2-causal-order.md).

## Review Repairs

Independent review found that treating all action deadlines as clock metadata
could hide an extra hour of authority. Deadlines now match each received request
and pending notice to an independently retained original service custody row.
The exact canonical request hash and complete body must agree, including the
deadline. Host/session/run/objective binding and the public action-timeout grant
also agree; the original remaining deadline cannot exceed that allowance.

The actual service test retrieves fourteen original custody rows through the
read-only recovery endpoint after the gameplay windows settle. These witnesses
remain test output and never enter policy context. Changing one deadline, or
both matching request/pending deadlines, by an hour now fails. The live-service
case itself runs both mutation controls. No service or production protocol edit
was needed.

## Evidence And Retained Failures

| Check | Result / retained artifact |
| --- | --- |
| Node comparison, binding, deadline and mutation checks | 33 PASS; the three `canonical-start-service.public-wire*.test.mjs` files |
| Actual SDK, GameSession and native IndexedDB | 11 PASS, 44.4s; `test-results/s2-transport-final/results.json` |
| Actual App / pinned Agentica planner and wire pair | 1 PASS, 65.740s; `test-results/maze-start-service-pW8fmg/results.json` and `provenance.json` |
| Production-adjacent fixture types | Transport and actual-service fixture TypeScript PASS |
| Historical Wl artifact with original archived custody | Bounded correspondence PASS; `test-results/s2-causal-Wl7MZr-custody.json`; original strict FAIL retained |
| 47UJRp failed-case diagnostic recheck | Bounded comparison PASS, original case explicitly remains FAILED; `test-results/s2-causal-47UJRp-custody.json` |

The actual App pair retains seven identical full planner inputs before the first
lawful difference. Its selected prefix has 9 sent frames, 89 received frames and
8 progress request/reply pairs per world. All 28 request/pending deadline
occurrences match original custody. The only 20 residual leaves describe the
newly observed frontier difference. The fresh strict comparison still has 122
differences; its raw failure is retained alongside the explicit correspondence.

The SDK consumer checks use eight fresh native contexts: three observed
acceptance schedules, terminal-before/after controls, and three legal dispatch
schedules. Informational delivery leaves the entire database, grants, pending
controls, action cache and operation state unchanged. Subsequent actions produce
identical full database and authority state across the informational schedules.
Terminal-before closes the actual channel and prevents delivery/effects;
terminal-after permits the earlier action. Raw message-ring chronology remains
different and is retained explicitly.

Earlier consumer-fixture failures remain in `s2-consumer-commutation-first/`,
`-diagnostic/`, `-second/`, `-action-diagnostic/` and `-third/`: a test RNG stub
blocked the browser socket shim, an invalid inspect scope correctly refused,
and a closed socket correctly produced no response. The fixture was corrected
to use the real public observe action and terminal delivery semantics.
The initial fixture type error for nullable wire request IDs is also retained.
These were fixture corrections, not repairs credited to production runtime.

`maze-start-service-47UJRp/` remains a failed first integration: its waiting/request
interleaving was outside the initial comparator. Source inspection, explicit
dispatch correspondence and real-consumer schedule tests justify the repair.
The artifact CLI permits analysis of a failed original only with the explicit
`--allow-failed-comparison` option, and records its original failed status.
The later fresh `pW8fmg` case supplies the passing integration evidence.

## Reproduction And Limits

```powershell
node --test tests/e2e/canonical-start-service.public-wire.test.mjs tests/e2e/canonical-start-service.public-wire-causal.test.mjs tests/e2e/canonical-start-service.public-wire-deadlines.test.mjs
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'paired corpus actual planner inputs'
```

The service proof pins clean Agentica `27cb2ce9717438edfe19487e3920faa183112c97`
and the matching SDK. It uses the explicitly alternate .NET 10.0.401 environment,
not repository-pin 10.0.302 qualification. No paid-provider calls occurred.
The comparison covers the common earned prefix through its first frontier
disclosure, not all later traffic or a universal scheduling/timing distribution.
Unclassified ordering, missing witnesses, extra/lost frames, changed unknown
content and changed effective allowances still fail. S6 must rerun this gate on
the final candidate; S5's generated endurance and active takeover are separate.
