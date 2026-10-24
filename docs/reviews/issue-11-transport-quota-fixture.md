# Transport Quota Fixture Repair

2026-10-24. Isolated branch `codex/transport-quota-settlement`, base `2c67b31`.
Test-only correction; no runtime, production limits, dependency or service edits.

## Finding

The two exhausted-normal-quota cases completed local Stop and verified ACK,
then failed at `reload -> GameSession.load -> claim -> accountHead`.
The old `fillQuota` set total capacity to actual occupancy plus global/operation
reserves. It omitted retained private-world slack and the fixed head envelope,
placing the database below its existing admission charge, not at its ordinary
threshold. It also did not account for the changed serialized head width.
Callback-free funded cleanup correctly succeeded in raw mode; the later normal
claim correctly refused the underfunded private policy. No runtime defect found.

The fixture now uses `privateAdmissionBytes + reserveBytes + reservedBytes` and
`accountHead` for the head-only adjustment. It does not release private slack,
alter operation funding, manufacture occupancy, or increase a production limit.
Tests independently total actual native store/key/value charges before and after
reload. At zero ordinary headroom, a fresh staged world write reaches its callback
but fails with the exact quota error: the entire database is unchanged and the
native transaction aborts before any put/add. This is a logical quota test, not
physical disk exhaustion.

Funded Stop/ACK uses only heads/receipts/operations writes, retains original
checkpoint/roots/private policy, releases the original reservation, then permits
new-owner claim/resume within the unchanged ceiling. The acknowledged operation
remains exact after reload. Raw native operations/bytes/timings are attached.

## Evidence

Own evidence: `test-results/transport-quota-2c67b31-01/`.
Original parent failure remains in the qualification checkout at
`test-results/s6-2c67b31/native/canonical-agentica-transport/`.

- `baseline`: **2 FAIL**, 10.551s; same post-ACK reload failure, no skips/retries.
- `fixed`: **2 PASS**, 8.666s; no skips/retries. Case times 2.643s / 2.455s.
- Transport fixture TypeScript: **PASS**, zero diagnostics (`fixture-types.log`).
- `source-before.json`: exact source hashes and Node 22.13.0, npm 11.6.2,
  TypeScript 6.0.3, Playwright 1.61.0. All recorded files unchanged after execution.

| Measurement | Stopped | Interrupted |
| --- | ---: | ---: |
| Injected total limit | 13996957 | 13991087 |
| Actual used bytes at boundary | 612782 | 622531 |
| Ordinary admission charge | 5460893 | 5455023 |
| Original reserved bytes | 147456 | 147456 |
| Ordinary headroom before cleanup | 0 | 0 |
| Cleanup native reads / writes | 334 / 6 | 334 / 6 |
| Cleanup logical read / write bytes | 578950 / 21137 | 578950 / 21073 |
| Ordinary headroom after cleanup and reload | 142767 | 142831 |

Commands (output roots differ between `baseline` and `fixed`):

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-agentica-transport.tsconfig.json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/transport-quota-2c67b31-01/fixed/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-agentica-transport.config.ts canonical-agentica-transport.settlement.spec.ts --grep 'exhausted normal quota' --output test-results/transport-quota-2c67b31-01/fixed/browser --reporter list,json
```

Only strict port 5244 was used, with existing physical worktree-local dependencies
and the routed offline peer. No paid providers or actual service process. Full
transport/service/native suites and the parent's separately owned start-payload
assertion are **NOT RUN** here. These two passes do not relabel the original
56-case failed run or qualify the final integrated candidate.
