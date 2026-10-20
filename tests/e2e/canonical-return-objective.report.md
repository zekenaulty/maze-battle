# Native Return-Objective Binding

Candidate: parent `9182039` plus follow-up `821f09a`, merged into isolated
`codex/quest-context-boundary` at `6624f14`. Only new `canonical-return-objective*`
test/fixture/report files changed. No runtime, owner preview, dist or user DB edits.

## Result

- PASS: 17/17 native Chrome tests, 0 skips/retries, 37.8 seconds.
- PASS: fixture TypeScript check, 7 root files, 0 diagnostics.
- Actual GameSession town stairs, guild acceptance and leave-town commands accept
  exactly one generated single-item fetch. Actual publication, launch preparation,
  admission, grant and renewal contracts run over native IndexedDB.
- One publication record plus one source receipt binds the selected immutable quest
  row and earned town-cell source atomically. Independent store reads verify both;
  an injected post-staging abort leaves every canonical store unchanged.
- Exact original replay after journal mutation, reload and owner change executes
  no callback and changes no stores. Publication request/checkpoint, launch options
  and returned-value alias mutation cannot rewrite retained evidence.
- Missing/unaccepted/non-fetch quests, multiple-item/floor/current-level mismatch,
  removed source observation, unknown remembered entrance, wrong root launch ID and
  wrong objective ID all explicitly refuse with byte-identical native dumps.
- Typed publication renewal refuses without changing selection. Ordinary renewal
  succeeds; `assertLaunchGrant` returns the original root publication's objective.
- Instrumented publication callback: exactly 3 world gets (selected quest twice,
  matching contract once), 49 knowledge gets, 3 knowledge witnesses, no scans,
  1 execution get and 1 publication set. Every other world read is forbidden.
  Initial ordinary observation contains 99 cells; no hidden entrance/geometry,
  chest, award, all-map or history query participates in binding.

## Evidence Limits

The launch announcement uses the existing typed offline proof fixture, not a real
service acknowledgement. Network guards forbid API, provider and WebSocket traffic.
Negative source/memory and shape tests deliberately fault the fresh fixture DB.
This qualifies source binding only, not UI, navigation, retrieval, completion,
successor execution or actual-service verification.

Run 1 retained at `test-results/canonical-return-objective-run1`: 15/16 passed.
The combined renewal case attempted a fresh host command after intentional refusal,
when GameSession correctly made control unavailable. Splitting refusal and success
into fresh contexts fixed fixture sequencing without changing runtime behavior.
Run 2 and all 17 JSON evidence attachments:
`test-results/canonical-return-objective-run2/results.json`.

Integrated parent rerun at `93c7617`: **17/17 PASS**, zero retries/skips, 32.3
seconds. Evidence: `test-results/canonical-return-objective-integrated/results.json`.
Parent fixture typecheck also passes with the normal installed dependencies:
`node node_modules/typescript/bin/tsc -p tests/e2e/canonical-return-objective.tsconfig.json --noEmit`.
Runtime is unchanged from `821f09a`; the parent additions are tests and docs.

## Reproduce

From the isolated checkout, with installed Chrome and existing local dependencies:

```powershell
$env:MAZE_RETURN_DEPENDENCY_ROOT='C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle'
$env:MAZE_RETURN_RUN='canonical-return-objective-run2'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-return-objective.config.ts
```

Vite owns only loopback port 5266 with strict-port checking; no server reuse.
The dependency root is read-only resolution for the existing `@noble/hashes`.
Exact fixture typecheck (same dependency resolution, no emitted files):

```powershell
node --input-type=module -e 'import ts from "typescript"; import path from "node:path"; const file="tests/e2e/canonical-return-objective.tsconfig.json"; const config=ts.readConfigFile(file,ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.resolve("tests/e2e"),{noEmit:true,paths:{"@noble/hashes/*":["C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/node_modules/@noble/hashes/*"]}}); const program=ts.createProgram(parsed.fileNames,parsed.options); const diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program)]; process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:f=>f,getNewLine:()=>"\n"})); console.log(`Fixture roots: ${parsed.fileNames.length}; diagnostics: ${diagnostics.length}`); process.exitCode=diagnostics.length?1:0;'
```
