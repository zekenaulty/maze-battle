# Funded Cleanup Quota Fixtures

2026-10-24. Branch `codex/funded-cleanup-quota-fixtures`, base
`6dcbccc4327558cd07b0408e6236839a403defcb`. Only two quota helpers, their
spec assertions, and this report changed. No production, cap, config, dependency,
parent checkout, or service changes.

## Reproduction and Repair

Both game-host cases and all nine selected custody cases failed before their
intended recovery sequences: `lowerQuota` / `fullNormalQuota` called normal
`accountHead` with a ceiling based on raw occupancy. This omitted retained
private slack and the fixed head envelope. Even generic empty-policy custody
fixtures have fixed-head admission slack; they are not private-world fixtures.

Both helpers now use `privateAdmissionBytes(policy, usedBytes, actualHeadBytes)` with
the existing validated policy, plus unchanged operation reserves, global reserve,
and the original **16 / 32 bytes of ordinary headroom**, respectively.
`accountHead` still accounts for serialized head-width changes. Custody retains
its existing `MIN_RECOVERY_BYTES` reserve override. No raw-mode bypass is added.

Assertions independently sum native store/key/value charges, derive the exact
admission headroom from those bytes, and compare the entire injected head except
its explicitly changed quota fields. Private policy, allocations, reservation
count/funding, roots and checkpoint are preserved. Game-host additionally checks
whole-database rollback of the failed settings command, post-cleanup accounting,
and unchanged private policy/domain. Existing sixteen-obligation, recovery-owner,
atomicity, native write/abort failure, expired replay and exact retry assertions
remain intact. No runtime defect was found.

## Evidence

Local root: `test-results/funded-cleanup-quota-6dcbccc-01/`.
Each `baseline|fixed / game-host|custody` directory retains `runner.log`,
`results.json`, and browser output; original failure traces remain. Fixed results
include full `quota-boundary.json` attachments. No skips, retries, or flaky cases.

| Scope | Original | Fixed |
| --- | --- | --- |
| Game-host, two named quota cases | 2 FAIL, 8.358s | 2 PASS, 6.207s |
| Custody, nine quota-helper cases | 9 FAIL, 21.843s | 9 PASS, 14.022s |
| Game-host fixture types | Not run before repair | PASS, zero diagnostics |
| Custody fixture types | Not run before repair | PASS, zero diagnostics |

All four actual GameSession boundaries retained 5,163,857 allocated private bytes.
Generic custody boundaries retained zero allocated/consumed private bytes.
Sixteen-operation cases retained 2,359,296 reserved bytes; single-operation cases
retained 147,456. Every injected boundary had exact 16/32-byte ordinary headroom
and `usedBytes` equal to the all-store logical charge. These are native IndexedDB
logical-capacity tests, not physical disk exhaustion or timing equivalence.

## Commands and Limits

Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0, configured native Chrome.
Commands below ran from the isolated worktree. For baseline, replace `fixed`
with `baseline`; both stages used the same test selectors and zero retries.

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/funded-cleanup-quota-6dcbccc-01/fixed/game-host/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-game-host.config.ts canonical-game-host-cleanup.spec.ts --grep 'same-owner normal quota failure|takeover that commits before quota-blocked resume' --output test-results/funded-cleanup-quota-6dcbccc-01/fixed/game-host/browser --reporter list,json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/funded-cleanup-quota-6dcbccc-01/fixed/custody/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/custody-recovery.config.ts custody-recovery.canonical.spec.ts --grep 'explicit stopped foreign claim|repeated explicit claims|owned claim input|competing recovery owners|claim (receipt|head|abort) refusal|new GameSession funds cleanup' --output test-results/funded-cleanup-quota-6dcbccc-01/fixed/custody/browser --reporter list,json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-game-host.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/custody-recovery.tsconfig.json
```

Runner stdout/stderr was redirected to each run's `runner.log`; type diagnostics
to `game-host-types.log` and `custody-types.log`. Both configs use strict ports
and forbid listener reuse. Ports **5234 / 5242 released**, no listeners after
completion; all child sessions terminal. No providers or service processes.
Unselected cases and full native/service qualification are **NOT RUN** here;
the parent owns the final integrated-candidate gate.
