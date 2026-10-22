# Clean Locked Install

2026-10-22, base `02f4e768515a1de11f8db98d51ec3c189ea1c6cb`, isolated branch
`codex/clean-lock-qualification`. Worktree:
`C:/Users/Zythis/.codex/worktrees/clean-lock-qualification/maze-battle`.
Initially clean/detached, with no node_modules. Node **22.13.0**, npm **11.6.2**,
Windows x64. No parent dependencies or corpus-disclosure junction were used.

## Cause And Minimal Repair

The original `npm ci --ignore-scripts --no-audit --no-fund` reproduced exit 1,
EUSAGE: locked `@emnapi/wasi-threads@1.2.2` does not satisfy `1.2.3`.
The lock already contains the hoisted optional `@napi-rs/wasm-runtime@1.1.5`
with `@emnapi/core`/`runtime` peer ranges `^1.7.1`, but no root peer records.
Its nested Rolldown core/runtime `1.10.0` records do not resolve those hoisted
peers. npm's ideal-tree reconciliation fetches peer metadata, selects core
`1.11.3`, and requires threads exactly `1.2.3`, conflicting with the stale leaf.
The retained npm debug log records this chain. The mismatch predates the
`365368d` noble/hashes addition; that commit did not change the WASM entries.

`npm install --package-lock-only --ignore-scripts --no-audit --no-fund` generated
the new threads version, tarball URL and integrity hash. Its unrelated
`@noble/hashes` peer-flag change was discarded. The final lock diff is exactly
**three replaced fields in one package entry**, `@emnapi/wasi-threads` 1.2.2 ->
1.2.3. No manifest, other package version, source, runtime or test edits.
Lock SHA256: `ec37a0078a066cb0f0ac40d8b48d660cb4c67c05c1ceab956cfed66eb1e9956b`.

## Verification

Commands ran from the worktree above. Install cache and all build/test outputs
are local to it; node_modules is a real directory, not a junction.

```powershell
$env:npm_config_cache="$PWD/test-results/clean-lock-qualification/npm-cache"
npm ci --no-audit --no-fund
npm run build
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.tsconfig.json
$env:MAZE_RETURN_DEPENDENCY_ROOT=$PWD.Path
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/clean-lock-qualification/corpus-units.json
node node_modules/vitest/vitest.mjs run src/components/characters/CharactersDialog.test.tsx src/persistence/rpgMemory/treeWitness.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=test-results/clean-lock-qualification/focused-units.json
npm ls --depth=0
git diff --exit-code -- package.json
git diff --check
```

- PASS: clean CI from absent node_modules, **123 packages**, lifecycle scripts
  enabled, exit 0. Started `2026-10-22T17:25:48.891Z`; npm reports 3 minutes.
- PASS: production TypeScript and Vite build, **2119 modules**; emitted only into
  this worktree's dist. Existing >500 kB chunk warning retained, not suppressed.
- PASS: corpus fixture types, zero diagnostics.
- PASS: corpus **7/7** tests (1 file, 1.38s); jsdom/React plus tree-witness
  **20/20** tests (2 files, 8.38s). Total **27**, no failures or skips.
- PASS: all 16 installed direct dependency versions match their locked versions;
  package.json unchanged and no post-install lockfile drift. Vite 8.0.16,
  Vitest 4.1.9, TypeScript 6.0.3. npm ls exits 0; it labels unused Windows
  optional-WASM leaves `@emnapi/wasi-threads@1.2.3` and `tslib@2.8.1` extraneous.
  No prune or unrelated graph cleanup was attempted.

Raw evidence directory: `test-results/clean-lock-qualification/`. Retained files:
`npm-ci-before.log`, `lock-repair.log`, `lock-scope.json`, `npm-ci-after.log`,
`build.log`, `fixture-types.log`, both unit JSON/log pairs, `npm-ls.log`, and
`environment-verified.json`. npm debug logs are under `npm-cache/_logs/`:
failure `2026-10-22T17_23_26_733Z-debug-0.log`, success
`2026-10-22T17_25_48_891Z-debug-0.log`. Initial `environment.json` retains a
diagnostic-only false failure from comparing checkout CRLF with Git LF;
normalized exact-content comparison and Git diff confirmed no manifest edits.

This qualifies the requested clean install and focused checks on this exact
Windows candidate, not full-Q/frozen-candidate acceptance. The optional WASM
runtime itself, other OS/CPU combinations and future registry-metadata
independence are not qualified. npm still consults optional peer metadata;
its lock-only generation does not retain these platform-inapplicable peers.
No browser/provider/owner-preview/service run, push, or issue closure occurred.
