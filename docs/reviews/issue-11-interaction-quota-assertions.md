# Interaction Quota Assertions

2026-10-24. Branch `codex/interaction-quota-assertions`, base
`27cc641b4cd627aed5dc8d0825a20ee1ac1a3afd`. Only the interaction failure spec and
this report changed. Production and relevant original fixtures match qualification
`60c1346`. No filler, runtime, caps, config, dependency, service or parent edits.

## Finding and Repair

Both originals reproduced: raw remaining bytes were 12291 and 14119 (parent's
second sample: 14120), failing `<8192`. The existing native filler correctly
commits ordinary execution records until canonical admission refuses. Its bounded
60000/4096/1024-byte batches and 3-MiB limit/128-KiB reserve are unchanged.

The assertions now use `privateAdmissionBytes(policy, actualUsed, actualHead)`.
A local spec audit sums the retained native dump's non-meta store/key/value JSON
bytes, verifies the exact head and `usedBytes`, and independently checks the charge
as actual minus actual head plus private slack plus fixed head capacity. Raw
occupancy remains separately reported. The original `<8192` threshold is retained,
with an added nonnegative admission-headroom check. These generic roster fixtures
have zero private slack; the fixed 12-KiB head envelope explains this failure.

Both whole cases pass: failed apply retains pending progress and the entire DB;
cancel/ACK preserve the domain snapshot and release funding. Applied settlement
retains the original progress/receipt, quest award, checkpoint and roots; its
8192-byte ordinary probe refuses atomically, while settlement/ACK remain funded.
Original terminal-byte and ACK-byte ceilings remain. Added audits verify actual
bytes before refusal, after settlement and after ACK as applicable; private policy
and the configured limit remain unchanged. No production defect was demonstrated.

## Evidence

Evidence root: `test-results/interaction-quota-27cc641-01/`, with separate baseline,
focused and full logs/JSON/browser outputs. Original traces remain under baseline;
parent evidence at `test-results/s6-60c1346/native/canonical-interaction/` is untouched.

| Check | Result |
| --- | --- |
| Original focused pair | 2 FAIL, 9.487s |
| Corrected focused pair | 2 PASS, 12.078s |
| Full interaction suite | 16 PASS, 39.697s |
| Interaction fixture types | PASS, zero diagnostics |

No skips, retries or flaky cases. Full-run near-quota measurements:

| Case | Actual used | Actual head | Admission charge | Raw remaining | Ordinary remaining |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pending apply | 2854909 | 1088 | 2866109 | 12291 | 1091 |
| Applied settlement | 2854833 | 1237 | 2865884 | 12367 | 1316 |

Raw DB/effect evidence and the `normal-quota-accounting.json` /
`applied-decision-quota-accounting.json` attachments are embedded in results JSON.
These are logical stored bytes, not physical disk sizes or timing claims.

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/interaction-quota-27cc641-01/focused/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-interaction.config.ts canonical-interaction.failures.spec.ts --grep 'normal quota failure|applied interaction settles a decision' --output test-results/interaction-quota-27cc641-01/focused/browser --reporter list,json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-interaction.tsconfig.json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/interaction-quota-27cc641-01/full/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-interaction.config.ts --output test-results/interaction-quota-27cc641-01/full/browser --reporter list,json
```

Baseline used the focused selector before edits with separate baseline paths.
Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0 and configured Chrome. Tested
spec Git blob: `d9b9a68e82b1f4e0ed12b547463e6c0fbc656133`.
Port 5293 is released, no listener remains, and all child sessions are terminal.
No provider/service calls or broader qualification runs.

## Read-Only Remaining Assertion Scan

Parent source inspected at `3d281a37049580a0c80ae20ec572a658208cbe85`:
one additional matching ordinary-headroom upper-bound assertion remains in
`canonical-navigation-failures.spec.ts:48`, test **arrived progress settles and
acknowledges from its reservation at normal capacity exhaustion** (starts line 39),
under `canonical-navigation.config.ts` (5222). It uses the same raw `<8192` formula
after real canonical filling. Empty private slack does not remove fixed-head
capacity. This is a concrete stale assertion, not a demonstrated runtime failure;
it was NOT edited or run here.

`canonical-manual-saves-claim.spec.ts:85` checks that physical logical occupancy
leaves the recovery reserve intact, not that ordinary headroom is exhausted.
`custody-recovery.canonical.spec.ts:55` likewise checks raw funded-capacity safety.
Those are not the same defect. Corpus quota wiring checks both raw and virtual
admission; the previously repaired ACK/transport/game-host/service assertions use
charged admission. Other raw limit assignments are distinct fault-injection setup,
not additional matching remaining-headroom assertions; no blind repairs were made.
