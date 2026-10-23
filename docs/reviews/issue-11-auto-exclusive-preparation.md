# Auto exclusive preparation prerequisite

Base: `25d9d411dc6f5b21bc3d4880542a893cda042f22`. Branch: `codex/auto-exclusive-preparation`.
Worktree: `C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.
Runtime change is confined to `src/persistence/canonical/auto/command.ts`; no kernel, capacity, lifecycle, controller, SDK or provider changes.

## Behavior and proof

- A next floor not already ready receives one existing `commitFloorPreparation` call. The tick returns `planning`, `rosterChanged:false`, `needsFloor:null` without `finish`, waypoint creation, checkpoint changes or ordinary domain writes.
- The final content batch returning `ready` still stops upstairs. Only the following tick descends through the existing exploration command and `finish`.
- `currentAutoRoom` now runs below the preparation/descent branch. `retainObjective` changes only local state. `commitRosterCommand` returns unchanged before `saveRoster`/`setCheckpoint` when its domain action is a no-op; applied travel care returns through `finish` before reaching preparation.
- New tests use real canonical pages/COW, generated floors, preparation, sight and roster handlers. Only IDB object-store transport is an in-memory map. Both healthy and unavailable-healing scenarios cover 19 actual batches across generation, quality, roles, content and ready. The unavailable heal is genuinely attempted on each batch and returns unchanged. All attempted sets/deletes are checked, not merely final rows; checkpoint/knowledge/execution remain exact. Missing root waypoint is deliberate. Applied healing and stale-tick cases are also checked.
- Permitted preparation includes consuming private frontier records and creating the exact upper-floor stair link on the first batch; neither is an actor traversal. Tests retain these checks explicitly.
- Existing Auto allowance remains 16,384 reads / 1,024 writes / 16 MiB. No limits were increased. Each new unit fixture uses the existing default preparation bounds for setup and the existing Auto bounds for ticks.

## Checked commands

From the worktree above, Node `22.13.0`, npm `11.6.2`, Vitest `4.1.9`:

```powershell
node node_modules/vitest/vitest.mjs run src/persistence/canonical/auto src/services/game/CanonicalAutoController.test.ts --reporter=default --reporter=json --outputFile=test-results/auto-exclusive-preparation/units-04.json
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target es2023 --module esnext --moduleResolution bundler --types node --skipLibCheck --allowImportingTsExtensions tests/e2e/canonical-auto-exclusive.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-auto-exclusive.config.ts --grep "keeps Stop usable between floor batches" --list
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-auto-exclusive.config.ts --grep "keeps Stop usable between floor batches"
git diff --check
```

| Check | Result |
| --- | --- |
| Focused units | PASS: 32/32, five files, 5.63 s; four new tests plus 28 existing tests |
| Repository types | PASS, exit 0 |
| Isolated launcher types | PASS, exit 0 |
| Native discovery | PASS: exactly one existing test selected |
| Actual App Stop/reload/resume | PASS: 1/1, test 22.2 s, runner 25.598 s, zero skips/failures/flaky results |
| Whitespace check | PASS |

The native launcher uses only `127.0.0.1:5430`, strict port, no listener reuse, existing worktree-local `.vite-canonical-app` cache. The port was free before launch and released afterward. Parent/owner/service ports were not used.

## Evidence and limits

All raw evidence is under `test-results/auto-exclusive-preparation/` in this worktree. Passing evidence: `units-04.json`/`.log`, `types-03-result.json`, `launcher-types-02-result.json`, `native-list.log`, `native-01.log`, and `native-1792727578430/results.json`. Earlier native JSON from discovery is not counted as execution.

Preserved failures: `units-01` (two failures: test incorrectly prohibited private frontier deletion), `units-02` (two failures: test omitted the existing upper-floor stair-link write), and `launcher-types` (TS5112: explicit file checking requires `--ignoreConfig`). These were test/command corrections; no production workaround or cap relaxation was made. `units-03` then passed all four new tests before the final combined run.

The native test is the existing synthetic completed-floor actual-App fixture, not proof of earning that completed floor through exploration. It proves Stop between batches, stopped reload stability, explicit resume/descent and continued Auto revisions afterward. The unit transport does not establish real-IDB atomic failure or receipt replay. Capacity charging, initializer separation, universal admission/read-work equivalence, deep-floor scale, full service cohort and paid-provider behavior are NOT-RUN / outside this prerequisite.

Tested SHA-256 inputs (before this report-only addition):

| File | SHA-256 |
| --- | --- |
| `src/persistence/canonical/auto/command.ts` | `ABAAE5E667FE66122479E20AC22794670560AB79038CBF0BD9B20F2A393B54F4` |
| `src/persistence/canonical/auto/command.preparation.test.ts` | `EEFC8496E09120DA85B78EA6CEF8760C2220B4D96740A813F523BF7AD432F23F` |
| `src/persistence/canonical/auto/preparation.test-support.ts` | `D7BD957D38F62818BBFE99672B83EA61C1A14A6370DFEF4A81AB7E5B94A7D9ED` |
| `tests/e2e/canonical-auto-exclusive.config.ts` | `ACC6D1782D7825D49BFF5D110B753BF6A870A35D1B099E084DB68F63D13ECF3A` |
