# Operation review regression repair

## Identity and boundary

- Worktree: `C:/Users/Zythis/.codex/worktrees/navigation-recovery-ui/maze-battle`.
- Branch: `codex/agentica-interaction-native`; merged parent `08bacd6` as `b3a33ab` before this test-only change.
- Scope: `operation-review.*` and `canonical-agentica-operations.review.spec.ts` only. No runtime or production grant edits.
- Native Chrome / IndexedDB, one worker, zero retries, strict loopback port 5242. Existing offline SDK custody fixture; no Agentica service, WebSocket connections, or provider calls.

## Original parent failures

Report: `C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/test-results/agentica-interaction-operation-regression.json`.
Started 2026-10-18T15:11:27.393Z; 329044.694 ms; **118 passed, 2 unexpected**, no skipped/flaky tests.

1. `review: valid fresh-publication admission can be confirmed` failed at reservation with `publication or grant is not selected for current custody`. The probe retained a new publication but omitted explicit selection. `git diff 4a9efef HEAD -- src/persistence/canonical/agentica/publication-selection.ts src/persistence/canonical/agentica/launch.grant.ts tests/e2e/operation-review.probes.ts` was empty at pre-fix HEAD `b3a33ab`: this fixture/guard mismatch predates the interaction integration.
2. `ack missing-receipt fails closed during read and next advance` timed out after 60080 ms in the automatic `providerFree` fixture, waiting for `window.canonicalAgenticaOperations`. Its trace records `Failed to load resource: net::ERR_NO_BUFFER_SPACE` for `/src/services/agentica/game/operationDriver.ts` (network status -1). The domain assertion never ran. This establishes a module-load failure, not its underlying system resource cause. The unchanged test passed in all three subsequent native executions below.

Parent traces remain under `test-results/agentica-interaction-operation-regression/`:
- `canonical-agentica-operati-055c6--admission-can-be-confirmed/trace.zip`
- `canonical-agentica-operati-dd6bb-uring-read-and-next-advance/trace.zip`

## Repair and assertions

The probe now checks the unselected reservation fails with a byte-identical database, reads the retained launch ID and previous selection, and calls the production `renewGamePublication` wrapper. It asserts the new selection points to the exact new publication and old selection, keeps the same grant, preserves immutable selection history and world/knowledge/checkpoint, and permits admission, confirmation, custody and one movement. Wrong-publication confirmation still refuses without writes; the accepted start remains pinned to the original publication. The operation union is narrowed to navigation before reading `steps`.

## Retained local run history

Each local report is `test-results/<run>/results.json` in the isolated worktree; failed browser cases retain traces alongside it.

| Run | UTC start | Duration ms | Result and correction |
| --- | --- | ---: | --- |
| operation-review-run1 | 2026-10-18T15:30:32.666Z | 1683.650 | Runner error, zero tests executed. Combining Playwright configs retained both web servers; replaced composition with a single spread config. No existing server was reused. |
| operation-review-run2 | 2026-10-18T15:30:56.952Z | 7125.421 | Unchanged fixture: 1 passed, 1 failed. Missing-receipt case passed; selection failure reproduced exactly. |
| operation-review-run3 | 2026-10-18T15:31:43.220Z | 22825.719 | First repair: 8 passed, 1 failed. New lookup incorrectly used guard ID as launch ID; changed to retained `readLaunch().value.binding.launchId`. |
| operation-review-run4 | 2026-10-18T15:32:28.492Z | 23379.520 | Final repair: **9/9 passed**, zero skipped/flaky. All eight review cases plus the unchanged missing-receipt test. |

Final fixture typecheck and `git diff --check`: PASS. Port 5242 released after the run. Parent service ports were unused. This focused rerun does **not** turn the historical 120-case report green or prove real-service/provider behavior.

## Reproduction

From the isolated worktree (the dependency-root override is needed only because its shared node_modules lacks `@noble/hashes`):

```powershell
$env:MAZE_OPERATION_REVIEW_DEPENDENCY_ROOT='C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle'
$env:MAZE_OPERATION_REVIEW_RUN='operation-review-next'
node node_modules/@playwright/test/cli.js test --config tests/e2e/operation-review.config.ts
node node_modules/typescript/bin/tsc -p tests/e2e/operation-review.tsconfig.json --baseUrl C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/node_modules --ignoreDeprecations 6.0
```

Run1 and Run2 used the additional selector `--grep 'review: valid fresh-publication admission can be confirmed|ack missing-receipt fails closed during read and next advance'`. Run3 and Run4 used the config default nine-case selector.
