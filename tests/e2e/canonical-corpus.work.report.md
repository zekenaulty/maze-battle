# Private World Capacity Disclosure

2026-10-22 local / 2026-10-23 UTC. Production base `07114dc`.
**Information boundary: FAIL. Atomic rollback for this injected failure: PASS.**
This is a passing characterization of a reproduced acceptance defect, not an
information-boundary regression pass or completion of Sprint 4.

## Controlled Native Evidence

Four fresh Chrome contexts on isolated port 5266, real GameSession/canonical
IndexedDB, fixed clock and controlled identical UUID streams. Two ordinary
baseline runs start corpus A/B and execute the same sight-earned east move.
The same public projections, action results, checkpoints and identity ledgers
are asserted. Private authored serialization differs by four bytes before sight
divergence. No privileged state selects the direction, route or actor action.

Two further fresh contexts repeat the identical setup. An independent test-only
oracle chooses A's exact post-action logical quota boundary and injects that SAME
limit in both heads. It accounts for the changed serialized head length and
checks that both pre-action heads still have valid ordinary headroom. No world,
knowledge, receipt, action, reserve or allocation is edited by fault injection.

| Measurement | A | B |
| --- | ---: | ---: |
| Common total logical limit | 8,681,725 | 8,681,725 |
| Recovery reserve | 8,388,608 | 8,388,608 |
| Ordinary capacity | 293,117 | 293,117 |
| Required post-action occupancy | 293,117 | 293,121 |
| Baseline command reads / writes | 168 / 26 | 168 / 26 |
| Baseline command read / write bytes | 132,069 / 26,394 | 132,069 / 26,394 |
| Actual result at the injected limit | Moves; `Saved` | Refuses; recovery required |

The refusal is `Canonical storage: storage quota exhausted`. Its genuine
GameSession status becomes `Action failed: Canonical storage: storage quota
exhausted`, with control false. The test does not mount the App, contact a service
or invoke a provider. The native whole-database key/value snapshots before/after
B's failed action are equal, including records, nodes, operations and receipts.
The selective domain audit also remains equal. No funded operation exists here;
this is not proof of funded recovery at this boundary.

## Reproduction And Review

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.tsconfig.json
$env:MAZE_CORPUS_RUN='canonical-corpus-work-threshold-reviewed'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts canonical-corpus.work.spec.ts
```

Fixture types PASS; native characterization **1 PASS**, zero retries/skips.
Raw evidence: `test-results/canonical-corpus-work-threshold-reviewed/results.json`:
baseline/fault data, all-store snapshots, verdict and executable source/fixture
SHA-256 hashes. Hashes are verified unchanged at the end of the test.
`baselineWork` is the successful command's canonical telemetry, not full native
call I/O, failed-attempt cost, physical disk bytes or an execution-time guarantee.

Independent read-only review confirmed the causal difference and oracle. Its
rollback-proof finding was repaired by adding the complete native snapshots;
the previous selective audit alone did not prove whole-database equality.
The earlier type check incorrectly read stats from a receipt and was corrected
to the actual GameSession diagnostic. First native attempt
`canonical-corpus-work-threshold-01` failed in the injector because the heads
store uses explicit out-of-line keys; corrected to `head.gameId`. Second attempt
`canonical-corpus-work-threshold-02` reproduced the disclosure with a selective
rollback audit. Those failures/results are retained, not overwritten.

## Repair Boundary

`accountHead` currently combines private authoritative occupancy and ordinary
action capacity. Hiding the error or rounding exposed counters cannot remove
the success/failure channel. Padding these two authored fixtures would only
conceal it. Raw accounting must remain truthful, and funded settlement/recovery
reserves must not be spent on ordinary actions.

The next bounded S4 repair is a deterministic private-world capacity envelope
derived from public generation bounds, reserved before preparation. Hidden
serialization uses that envelope without donating its unused slack to ordinary
action capacity. Keep actual occupancy measurements separate from this
actor-affecting allocation policy. Qualify threshold neighbors, different hidden
topologies, floor preparation/revisits, aborts and funded Stop/replay. This is a
proposed repair, NOT implemented here; exact capacity bounds need source review.
Separate private raw-I/O disclosure also remains open. No quota/schema/runtime
behavior, budget or owner database was changed in this characterization.
