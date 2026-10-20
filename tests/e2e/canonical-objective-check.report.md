# Objective Check Qualification

Runtime candidate: `06946e9`; isolated merge: `eaea357`.
Only new tests and fixture files changed. Native Chrome used fresh IndexedDB on
strict loopback port 5266. No provider, real service, owner preview, or build.

## Results

- New native objective checks: **13/13 PASS**, 0 skips/retries, 56.3 seconds.
- Existing native return binding checks: **17/17 PASS**, 36.0 seconds.
- Focused objective context/prepare/proof units: **28/29 PASS**; regression below.
- Root and new native fixture typechecks: **0 diagnostics** each.

The native path accepts the shared-content fetch quest through GameSession,
walks 174 actual outbound steps, collects the single artifact, and retraces 174
steps to the earned entrance. Pending, satisfied, then stashed/pending results
are retained through real canonical transactions and source receipts. Reload
and owner change replay the exact earlier satisfied result despite changed
current custody. Independent canonical store/domain dumps prove no query
domain changes and byte-identical full state during replay/refused writes.

Five forged proof/completion writes and four missing/tampered historical
sources are rejected. Tampered result rows also have their generic receipt
witness rewritten, exercising objective-specific validation. Old scope grants
cannot reserve the action; unbound launches produce explicit refusal.

## Open Regression

`src/services/agentica/game/objectiveContext.ts`, `queryObjective`: the caller's
`identity` is reused after awaiting `prepareObjectiveProof`. Mutating its
`action.actionId` while authorization is suspended changes the returned action
ID from `action` to `changed-during-await`. The enabled unit regression fails.
Suggested owner repair: snapshot with `snapshotPrepared` at function entry.
No production fix is included.

Preparation itself snapshots correctly, and native action hooks snapshot
caller input correctly. No persisted forgery is demonstrated; the result
writer's identity/proof checks remain a separate enforcement boundary.

## Read Metrics

Instrumented query API calls, not raw IndexedDB page reads:

| Query | Execution gets | World gets | World scans | Knowledge |
| --- | ---: | ---: | ---: | --- |
| Pending, away | 14 | 8 | 1, limit 1 | 0 |
| Satisfied, at entrance | 14 | 8 | 2, each limit 1 | 16 gets, 1 witness |
| Historical replay | 9 | 0 | 0 | 0 |

Replay additionally used 7 original source receipts and 5 saved snapshots.
World reads are confined to the selected quest/contract, pack/stash, and exact
quest item; scans are custody/index prefixes only. No geometry, chest, award,
map, or history scan occurs. Satisfied wire result: 1075 UTF-8 bytes; private
objective proof: 1134 JSON characters. Native query domain hashes are unchanged.

## Commands And Evidence

Run from the isolated checkout. Its existing dependency junction lacks
`@noble/hashes`; commands resolve the parent's installed copy read-only.

```powershell
$env:MAZE_RETURN_DEPENDENCY_ROOT='C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle'
$env:MAZE_OBJECTIVE_RUN='canonical-objective-check-run1'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-objective-check.config.ts
$env:MAZE_RETURN_RUN='canonical-return-objective-06946e9-rerun'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-return-objective.config.ts
```

```powershell
node --input-type=module -e 'import { startVitest } from "vitest/node"; const ctx=await startVitest("test",["src/persistence/canonical/agentica/objective.context.test.ts"],{watch:false,reporters:["default","json"],outputFile:"test-results/objective-context-adversarial-run2/results.json"},{resolve:{alias:[{find:/^@noble\/hashes\/(.*)$/,replacement:"C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/node_modules/@noble/hashes/$1"}]}}); await ctx?.close(); if(!ctx)process.exitCode=1;'
node --input-type=module -e 'import ts from "typescript"; import path from "node:path"; let errors=0; for(const file of ["tsconfig.json","tests/e2e/canonical-objective-check.tsconfig.json"]){const config=ts.readConfigFile(file,ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(path.resolve(file)),{noEmit:true,paths:{"@noble/hashes/*":["C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/node_modules/@noble/hashes/*"]}});const program=ts.createProgram(parsed.fileNames,parsed.options);const diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program)];process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:f=>f,getNewLine:()=>"\n"}));console.log(file+": "+diagnostics.length+" diagnostics");errors+=diagnostics.length;}process.exitCode=errors?1:0;'
```

Local evidence remains under the three named `test-results` run directories,
including JSON attachments with original actions, receipts, access counters,
and before/after fingerprints. The initial failing unit run is also preserved.
Units mock grant/publication reads; native cases use real local receipt paths
with a typed offline launch proof. This qualifies host evidence/replay, not
real-service completion, SDK lifecycle after completion, UI, or providers.
