# D0 Verification Receipt

2026-10-11. Diagnostic source: `8be9646ddd06546a73199974672dfd782585c303`.
Runtime generator/game source unchanged from `c62ed05`.
Generator source-set SHA-256:
`4043c73216e07b01b933430b9c044b52ce3e32c07a98266da7e2d9d587a31b84`.
See [measurements.json](measurements.json) for file list and environment.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Final diagnostic unit suite | PASS, 56 tests / 5 files | Instrumentation, malicious/invalid topology probes, size statistics, duplicate IDs, partial failure retention and failed-map rendering. Not a repair pass. |
| Strict TypeScript check | PASS | All ordinary/streamed diagnostic TS entry points and tests; imported helpers included. |
| Earlier integrated diagnostics + generator/save tests | PASS, 166 tests / 9 files | Completed before final diagnostic-only hardening. Game/generator source unchanged; diagnostic suite rerun afterward. |
| Independent compatibility lane | PASS, 233 tests / 15 files | Existing offline consumers; overlaps other cohorts, not additive unique coverage. Exact command in compatibility audit. |
| Final seeded cohort | PASS as a diagnostic run | 192 cases: 84 ordinary complete, 12 pre-allocation limited, 96 streamed complete. Structural quality defects explicitly remain. |
| Independent process repeat | PASS | All 192 results, probes and selected geometry identical after excluding only elapsed/heap samples. Same source hash. |
| Footprint report in Chromium | PASS | Eight actual-layout diagrams, desktop 1400x1100 and phone 390x844 without horizontal overflow. PNGs visually reviewed. Not gameplay/visibility qualification. |
| Browser saves / Agentica / combat / live providers | NOT RUN | D0 does not modify these surfaces. Native persistence and real new-layout play remain D1 gates. |
| D1 implementation and acceptance | NOT RUN | Owner review stop. No new recipe or changed production default exists. |

## Commands

```powershell
node node_modules/vitest/vitest.mjs run scripts/dungeon-diagnostics --maxWorkers=1
node scripts/dungeon-diagnostics.mjs --out docs/evidence/dungeon-d0
node scripts/dungeon-diagnostics.mjs --out test-results/dungeon-d0-repeat
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2023 --module ESNext --moduleResolution bundler --lib ES2023,DOM --types node --skipLibCheck --strict --noUnusedLocals --noUnusedParameters --verbatimModuleSyntax scripts/dungeon-diagnostics/ordinary.ts scripts/dungeon-diagnostics/ordinary.test.ts scripts/dungeon-diagnostics/streamed.ts scripts/dungeon-diagnostics/streamed.test.ts scripts/dungeon-diagnostics/streamed-audit.test.ts scripts/dungeon-diagnostics/streamed-sizes.test.ts
```

The integrated nine-file regression command additionally selected:
`src/domain/maze/{structuredGenerate,structuredTopology}.test.ts`,
`src/domain/gameFactory{,.preservation}.test.ts`, and
`src/domain/expedition/topology/{generation,transactions,adversarial}.test.ts`,
plus `scripts/dungeon-diagnostics`, with `--maxWorkers=1`.

## Review Corrections Retained

The first instrumentation review found five defects, fixed in `8be9646` before
the published measurements were regenerated:

1. Vite middleware still creates a WebSocket listener by default. Diagnostic
   workers now use `server.ws: false`; no network listener is needed. Earlier
   temporary diagnostic Vite instances closed at the end of their processes.
2. Ordinary traversal now requires in-bounds existing destinations and reciprocal
   links; connector audit reports broken reverse links rather than counting
   phantom reachable cells.
3. Graph audit explicitly reports duplicate room IDs and uses unique nodes for
   counts, preventing negative cycle counts.
4. Workers emit identified per-case records. Exceptions retain earlier results;
   parent timeout/crash handling retains the completed prefix and marks failure.
5. Every rerun writes current HTML, including a failure report when needed, and
   invalidates only its two owned PNGs. Old successful maps cannot silently stand
   beside new failed measurements. Screenshots were regenerated after the final run.

No failed generator repair was hidden by these changes: they fix measurement
reliability only. All reported production defects remain for owner-reviewed D1.
