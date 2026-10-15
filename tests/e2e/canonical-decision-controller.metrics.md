# Decision Root Stop Phase Metrics

Measured 2026-10-15 against production `1c49329718d5506c5c9755ec5c9ef6f80fd46864`.
Native Chrome, disposable IndexedDB on port 5266, one worker. Both focused cases passed
in 13.0 seconds; focused controller TypeScript passed. No provider or service calls.

## Boundary

- Preparation: the public `terminalAcknowledgement(..., 'decision-root-stop').prepare()`.
- ACK: the actual GameSession `cleanupHostOperation` call, including its head read and
  funded transaction's full proof verification. This is not a whole controller pulse.
- Historical validation: one public `readAgenticaTerminal` after the ACK commits.
- Setup, root ACK creation, diagnostic state reads, fake SDK callbacks and dumps are
  outside the probes. Both scenarios have exhausted ordinary quota before discharge.
- The existing `storageProbe` counts native object-store requests. Bytes are UTF-8
  JSON lengths of returned values or submitted write values, counted on every request.
  They exclude keys and browser storage overhead, are not deduplicated, and are NOT
  physical disk I/O, allocation size, browser storage usage or network traffic.

## Observed Samples

| Scenario | Phase | Reads | Writes | Read JSON Bytes | Write JSON Bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| No claim | Prepare | 107 | 0 | 303142 | 0 |
| No claim | ACK | 113 | 3 | 311731 | 5275 |
| No claim | Historical validation | 111 | 0 | 315017 | 0 |
| Claim with child | Prepare | 162 | 0 | 488388 | 0 |
| Claim with child | ACK | 168 | 3 | 497089 | 5547 |
| Claim with child | Historical validation | 168 | 0 | 507272 | 0 |

The no-claim scenario loses the correlated wake reply and retains no claim or grant.
The second scenario retains its claim and selected successor grant, then earns and
settles one three-step child navigation before the original navigation ACK. Discharge
leaves that child's operation and funded allocation unchanged. Synthetic service
evidence marks the original operation continued and supplies verified root settlement.

Preparation and history each used one readonly transaction. ACK used one readonly
head transaction plus one readwrite transaction, writing exactly `operations`,
`receipts` and `heads` once each; no immutable records or index nodes were written.
Historical canonical charged-work stats equalled the corresponding native rows in
these samples. Preparation and GameSession cleanup do not expose those internal stats;
their rows report native instrumentation only, not reconstructed canonical charges.

These are observed samples, not universal maxima; generated IDs and index layout can
vary counts and bytes. Tests enforce the default 2048-read/4-MiB work bounds (ACK allows
two extra head-read requests), zero writes for preparation/history, exactly three ACK
writes, preserved claim/grant/selection/root evidence and preserved child funding.
No longer-history, full-Q, actual-App or real-service performance claim is made.

## Reproduce

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision-controller.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision-controller.config.ts --grep 'bounded phase metrics'
```

The tests emit `ROOT_STOP_METRICS` JSON and attach per-case summaries with per-store
counts, logical bytes, transaction modes and historical canonical stats to the test result.
