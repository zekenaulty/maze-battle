# R5 bounded native Auto endurance

Runtime `ce935a307085bb6516fe170566ac25132f5a04a8`, branch `codex/app-auto-endurance`.
Actual untransformed App, fresh disposable native IndexedDB, seed 781 / RNG 0.5.
Default throttle 500ms and production movement minimum unchanged. No retained-floor
setup, transports, HP/stat changes, direct gameplay commands, provider/service calls,
capacity changes or generation bypass. Only UI Auto, Stop, reload, Auto, final Stop.

## Result

**1 PASS**, test 661.365s; runner 666.540s. Required floor-2 exploration and optional
floor-3 sample both obtained within the 20-minute test ceiling (19-minute play deadline).
759 committed movement commands: floor 1 **260**, floor 2 **483**, floor 3 **16**.
Two ordinary descents, 41 later-floor preparation batches. Six contracts claimed on
each of floors 1 and 2; six newly accepted contracts on floor 3 remain unfinished.
Stop/reload/resume after at least 128 floor-1 moves preserved exact party, inventory,
stash, quests and position; the reloaded game stayed manual until the explicit resume.
Paused stability checks span 2300ms. No runtime blocker, page errors, denied network
attempts or failed native mutations. One initializer seed draw, zero on reload.

867 distinct retained command receipts (16 initial setup, 851 subsequent):

| Operation | Count |
| --- | ---: |
| game.initialize | 1 |
| game.prepare | 14 |
| exploration.command | 1 |
| settings.command | 4 |
| auto.command | 840 |
| battle.command | 5 |
| control.takeover / control.resume | 1 / 1 |

840 Auto commands contain 759 moves, 18 accepts, 12 claims, 4 chest collections,
2 battle starts, 41 preparation batches, 2 descents and 2 actionless planning ticks.
23 gapless telemetry events exactly match the current bounded reader: 2 battle starts,
3 turns, 2 victories, 12 claims and 4 chest collections. Victory loot: 3 instances each;
chest loot: 3 instances each. These are award instances, not occupied-slot counts.
Combat/chest gold rolls were zero; wallet rose 35 -> 935 from quest claims.
Backtracking occurred: 153 sampled policy states had route purpose `backtrack` (not
153 distinct commands). No portal/town-care/return-to-town action occurred naturally;
those paths are NOT qualified by this run. No floor-3 completion or general balance claim.

## Storage

Accounted logical usage: **569,955 -> 45,402,865 bytes**, growth **44,832,910 bytes**.
Native retained records 233 -> 10,042; nodes 509 -> 21,651; receipts 16 -> 867.
Passive committed native writes total 29,828,337 record bytes + 14,617,472 node bytes
+ 955,555 receipt bytes + 1,501 current-head bytes = 45,402,865, exactly the final
head charge (post-run arithmetic audit). Replaced heads are not counted as retained growth.
Native head writes: 1 add + 866 puts; all captured mutations committed, none failed.
Quota remains 268,435,456 bytes with 8,388,608 reserve. Origin usage estimate changed
610,304 -> 30,261,248 bytes; it is browser-provided and NOT physical per-DB I/O.
No read-IO/timing equivalence claim. Diagnostic sampling has observer overhead.

## Reproduction and evidence

Node 22.13.0, npm 11.6.2, Playwright 1.61.0, system Chrome. Strict port 5497,
no listener reuse; local worktree Vite cache, envDir false, only local HTTP/HMR allowed.

```powershell
npx tsc --noEmit -p tests/e2e/canonical-app-auto-endurance.tsconfig.json
npx tsc --noEmit
$env:AUTO_ENDURANCE_OUTPUT = "$PWD/test-results/app-auto-endurance-ce935a3-attempt1"
npx playwright test -c tests/e2e/canonical-app-auto-endurance.config.ts
```

Both final type checks PASS. Initial fixture type check failed on an unavailable newer
recovery helper; corrected locally within endurance support before the sole native run.
All logs retained, including `types.log`, `types-corrected.log`, `root-types.log`,
`runner.log`, `source.txt`, `fixture-hashes.txt`, `results.json`. Under `artifacts/`:
`commits.ndjson`, `samples.ndjson`, `summary.json`, `midjourney.json`, two screenshots.
The floor-3 stopped screenshot was inspected. Captures drain bounded browser buffers
to Node files; they never feed Auto. Final trace sequence and receipt count are checked
against native readers/counts. Existing broad `canonical-app.config.ts` also discovers
this named spec; use the standalone config above for isolated endurance execution.
No full suite/build/provider qualification. All sessions terminal; 5497 released.
