# S4 Native Private-Capacity Kernel Gate

## Candidate And Scope

Parent HEAD was pinned with `git rev-parse HEAD` to
`9c7c0013414b4addec40488f93606d685aadec95`, "Enforce private capacity admission
without blocking funded cleanup". Its isolated cherry-pick is `4c9c7cf` on
`codex/private-capacity-native`, based on `260d497`. Test increments are
`29efaec`, `13b9a53`, plus this report/raw-charge oracle follow-up. The kernel
cherry-pick is qualification input, not a new production change to integrate.

Real Chrome/native IndexedDB, actual canonical lifecycle/transaction/receipt
APIs, fresh browser contexts, strict loopback port **5440**, one worker, no
retries. Own fixture entry/config/cache and exact-origin route allowlist; no
edits to the existing 5209 fixture. No App, Agentica service, provider, owner
database or preview was used.

## Checked Matrix

| Cases | Boundary | Result |
| ---: | --- | --- |
| 3 | Missing/malformed/overbooked policy: execute, admit and settle callbacks never run; resume and ordinary claim refuse | PASS |
| 3 | Adoption under otherwise valid new-owner custody is fresh work, not cleanup | PASS |
| 3 | Expired original effect plus admission replay after policy corruption, custody change and reload; altered input refuses | PASS |
| 3 | Current-fence takeover, stopped recovery claim, funded cancel/plain ACK and their exact replays preserve invalid policy and game state | PASS |
| 1 | Verified-host ACK validates exact retained admission/terminal receipts and live custody; wrong proof/plain-ACK substitution refuse | PASS |
| 1 | Root-only cleanup change with zero staged records/nodes and no restore aborts, then funded cancel/ACK succeed after prototype restoration | PASS |
| 2 | Missing admission/terminal source cannot authorize cleanup | PASS |

All-store key/value dumps surround refusals and replay; equality is exact, with
no identity normalization. Cleanup compares original generation/game IDs, all
roots, checkpoint, records/nodes, policy presence/value and original operation
identities. Stale-fence, expired fresh cancel and wrong-terminal ACK negatives
retain the whole database. Cancellation and ACK growth stay within their actual
declared allocation allowances; no hardcoded quota threshold is introduced.

The root-only fault temporarily wraps `CanonicalPages.prepare`, changes only the
world root from its non-null retained value to null, and restores the prototype
in `finally`. Observed staging was **0 records, 0 nodes, no snapshot**. The
kernel refused with `capacity cleanup cannot change gameplay`; the complete
database stayed identical. No raw-accounting mode is exposed or injected.

Verified ACK uses the existing read-only verifier with exact source comparisons,
not a permissive no-op. Its proof is a local kernel fixture proof, not Agentica
service acknowledgement or objective-completion evidence.

## Accounting And Native Evidence

Policy injection recomputes only the truthful serialized-head fixed point, then
independently sums every charged native store/key/value and requires equality
with `quota.usedBytes`. The overbooked shape is valid but reserves `limitBytes`
as private capacity; it neither changes the limit nor pretends private slack is
raw occupancy. Actual telemetry remains actual. Meta/schema is excluded from
the charged sum exactly as in the canonical accounting contract, but retained
in the all-store equality dump.

| Policy fault | Actual charged bytes after injection | After takeover/claim/cancel/ACK |
| --- | ---: | ---: |
| Missing | 6,899 | 10,130 |
| Malformed | 6,999 | 10,230 |
| Overbooked | 7,007 | 10,238 |

Each receipt-first pair issued exactly **four native reads**: meta/receipt twice;
no current-head, record, node, world or knowledge read and no write. Each returned
the exact original receipt despite an expired effect deadline and changed owner.
Fresh callback counts were zero. Raw attachments retain source requests/receipts,
heads, allowances, read counters, policy charges and complete store dumps.

Final run: **16 PASS, 0 skipped/failures/retries**, 9.979 seconds (CLI 10.0 s).
Evidence: `test-results/canonical-private-capacity-9c7c001-02/results.json` and
its JSON attachments. The earlier 16-PASS run remains under
`canonical-private-capacity-9c7c001-01` (15.3 s); the final run adds the universal
raw-charge oracle. Fixture and root TypeScript checks both PASS.

```powershell
$env:MAZE_CAPACITY_RUN = 'canonical-private-capacity-9c7c001-02'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-private-capacity.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-private-capacity.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
```

## Limits

No kernel defect was observed in this cohort. This qualifies the native kernel
gate and narrowly funded cleanup, not game allocation binding, private floor
preparation accounting, threshold-neighbor arithmetic, meaningful played-depth
capacity, Auto, or external service recovery. Parent-owned pure threshold and
existing native core/quota suites were not duplicated. No schema migration,
backfill, owner reset or legacy continuation was implemented.
