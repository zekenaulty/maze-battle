# Navigation Quota Assertion

2026-10-24. Branch `codex/navigation-quota-assertions`, base
`50c218189626b060da7ec98aeb2601088c23af4d`. Production and the original relevant
navigation fixtures match inspected parent `3d281a37049580a0c80ae20ec572a658208cbe85`.
Only `canonical-navigation-failures.spec.ts` and this report changed.

## Reproduction and Repair

The original **arrived progress settles and acknowledges from its reservation at
normal capacity exhaustion** case reproduced: raw remaining was 12944, failing
the original `<8192` assertion. Settlement and ACK had returned before that
assertion, but their later assertions were not reached in the failed run.

The existing filler and command sequence are unchanged: real canonical execution
writes in bounded 60000/4096/1024-byte batches, 3-MiB limit, 128-KiB reserve, one
earned adjacent movement, settlement, and ACK bound to that settlement attempt.
No quota/head mutation, clock/ID pinning, cap change, runtime or shared helper edit.

The assertion now checks `0 <= ordinaryRemaining < 8192` using validated
`privateAdmissionBytes`. A local spec audit verifies the exact dumped head,
`usedBytes == dump.bytes`, and the charge formula: actual bytes minus actual head
plus retained private slack plus the fixed 12-KiB head envelope. The existing
native dump computes bytes from every non-meta store's actual keys and values.
This generic roster fixture has zero private slack; fixed-head slack alone
explains the obsolete raw-free proxy.

Added read-only dumps before settlement, after settlement and after ACK retain
raw occupancy separately from admission. Original completion/progress and actual
byte assertions remain. Added checks retain roots, checkpoint, private policy
and limit; verify terminal/ACK byte ceilings, released terminal funding, and zero
remaining reservations. The separate refusal/cancellation, Stop, replay and
physical-reserve assertions and all filler behavior are untouched.

## Evidence

Workspace: `C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.
Evidence root: `test-results/navigation-quota-50c2181-01/`.

| Check | Result |
| --- | --- |
| `baseline/` first anchored title selector | NOT-RUN: no tests found; log retained |
| `repro/` original single case | 1 FAIL, 5.516s; log/JSON/trace retained |
| `focused/` corrected single case | 1 PASS, 5.722s |
| `full/` complete navigation suite | 56 PASS, 98.040s |
| Fixture types, `fixture-types-checked.log` | PASS, zero diagnostics |

The intermediate `fixture-types.log` retains three optional-policy diagnostics;
explicit production policy validation resolved them without casts or defaults.
No skips, retries or flaky tests. Full-run native audit:

| Boundary | Actual used | Actual head | Admission charge | Raw remaining | Ordinary remaining |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before settlement | 2854256 | 1048 | 2865496 | 12944 | 1704 |
| After settlement | 2855302 | 1046 | 2866544 | 142970 | 131728 |
| After ACK | 2856223 | 974 | 2867537 | 158433 | 147119 |

`arrived-at-quota-native.json` and `arrived-at-quota-accounting.json` are embedded
attachments in focused/full results JSON. These are logical stored bytes, not
physical disk sizes or timing-safety claims.

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/navigation-quota-50c2181-01/focused/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-navigation.config.ts canonical-navigation-failures.spec.ts --grep 'arrived progress settles and acknowledges from its reservation at normal capacity exhaustion' --output test-results/navigation-quota-50c2181-01/focused/browser --reporter list,json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-navigation.tsconfig.json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/navigation-quota-50c2181-01/full/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-navigation.config.ts --output test-results/navigation-quota-50c2181-01/full/browser --reporter list,json
```

Reproduction used the focused command before edits with separate `repro` paths.
Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0, configured installed Chrome;
strict 5222 and no listener reuse. Tested spec blob:
`3ae352fdf34d9808eea67686f51e24b410421498`.
All sessions terminal; 5222 and 5293 checked with no listeners and released.
No providers, actual services, parent edits or broader qualification runs.

The preceding interaction repair remains separately committed as
`50c218189626b060da7ec98aeb2601088c23af4d`: original 2 FAIL retained, focused 2 PASS,
full 16 PASS (39.697s), fixture types PASS. See
`issue-11-interaction-quota-assertions.md` for its independent evidence and commands.
