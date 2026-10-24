# Decision Adoption Fixture Assertion

2026-10-24. Isolated branch `codex/decision-adoption-fixture`, base
`afbc9a14868581decf4d3827ee33597cf18890b3`. Only the adoption-negative error
assertion and this report changed. Production source and the decision fixture,
config and tsconfig match frozen qualification `2c67b31` before the assertion
edit. No runtime, limits, dependency, parent checkout or other fixture changes.

## Finding

All five original adoption mutations reproduced the parent's failure: missing
adoption, changed ID, epoch, observation, and replacement of the old-epoch event
observation. Each returns exactly:

`Error: Canonical storage: service did not retain exact decision operation`

`retainDecisionClaim` calls `validateDecisionClaim`, which first calls
`decisionEntry` (`src/persistence/canonical/agentica/decision.claim.ts:23`). Its
retained-event and adoption equality guard (`decision.entry.ts:22`) rejects these
mutations before the later successor-run comparison (`decision.claim.ts:26`).
The test had expected the later guard's substring. The repair uses exact `toBe`,
not a generic regex or a set of acceptable errors.

Whole-database equality and null claim assertions remain unchanged. The valid
new-owner adoption control still checks the original terminal event, exact
current-publication adoption, original selection, grant, guard and operation.
No runtime defect was demonstrated; no authority or admission rule changed.

## Evidence

Local evidence: `test-results/decision-adoption-afbc9a1-01/`; each native run has
`runner.log`, `results.json`, and browser output. Original five failure traces
are retained under `baseline/browser`. Parent evidence remains untouched at
`s6-qualification/maze-battle/test-results/s6-2c67b31/native-rest2/canonical-decision/runner.log`
(75 PASS / 5 FAIL).

| Check | Result |
| --- | --- |
| Original five negatives | 5 FAIL, 34.433s |
| Corrected five negatives | 5 PASS, 28.126s |
| Decision fixture TypeScript | PASS, zero diagnostics |
| Full decision suite | 80 PASS, 385.556s |

All runs use zero retries, with no skipped or flaky cases. The full run includes
the unchanged valid-adoption positive control, exact claim replay, reload,
corruption refusal and atomic rollback cases. Tested spec Git blob:
`642bd7f3cd341441aa6c62aa10e3c7999091b8db`.

Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0, configured native Chrome.
Commands run from the isolated worktree, with stdout/stderr retained in each
run's `runner.log`; type diagnostics are in `fixture-types.log`:

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/decision-adoption-afbc9a1-01/focused/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision.config.ts canonical-decision-adoption.spec.ts --grep 'new-owner claim rejects changed adoption' --output test-results/decision-adoption-afbc9a1-01/focused/browser --reporter list,json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision.tsconfig.json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/decision-adoption-afbc9a1-01/full/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision.config.ts --output test-results/decision-adoption-afbc9a1-01/full/browser --reporter list,json
```

Baseline uses the focused command with `baseline` output paths before the edit.
Only strict port 5262 was used, with listener reuse disabled; it is released
with no remaining listener, and all child sessions are terminal. The native fixture
blocks external HTTP, services, providers and WebSockets. This is bounded native
fixture evidence, not actual-service or full integrated-candidate qualification.
