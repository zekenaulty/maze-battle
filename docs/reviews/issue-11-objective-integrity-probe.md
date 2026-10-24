# Objective Integrity Probe

2026-10-24. Branch `codex/objective-integrity-probe`, base
`12003c0307ec3d034b2973e10c77d584aac85a41`. Production and original objective-check
fixtures match frozen `60c1346`. Only the objective-check probe, fixture, spec,
and this report changed. No runtime, caps, config, setup route or parent edits.

## Original Failure and Source Scope

The ordinary collection/return case reproduced the parent's exact failure:
`Unexpected memory or history read: perception/observation/0000000000000352/integrity`.
The old guard allowed observation headers and chunks but omitted the required
integrity manifest. This was not a hidden-world read or an added history scan.

Production source chain, unchanged:

- `agentica/objective.evidence.ts:64,66` validates checkpoint knowledge and loads
  that same observation to require the actor's earned town stair.
- `knowledge/evidence.ts:10-12` checks the perception witness and audits the full
  current observation; `observation.source.ts:9-21` reads header, manifest and
  every declared chunk, checking whole-observation coverage.
- `knowledge/observation.integrity.ts:26-40` binds manifest identity/revision,
  full header digest and ordered chunk-digest root. `observation.source.ts:24-30`
  verifies each loaded chunk against its committed digest.

Paths above are relative to `src/persistence/canonical/`. No fallback reader or
semantic world consultation was introduced; no production defect was demonstrated.

## Strict Fixture Repair

The guard is now pinned to the transaction checkpoint's exact observation
sequence/ID, not any 16-digit sequence. It permits only that header, its exact
manifest path after reading the header, and the header's declared chunk indexes.
Original header/manifest records are captured from those reads, not extra query
reads. The spec binds the arrival proof back to that anchor and asserts the exact
ordered access list: one perception witness, then two header/manifest/chunk passes.

The original knowledge-get ceiling of 18, selected quest/contract/pack/stash/item
world allowlist, one-row scan restrictions, and witness restrictions are unchanged.
Six separate rejection controls cover an older header, older manifest, unsupported
suffixes, chunk 8 and room memory; their full native DB fingerprint stays equal.
The fresh objective query leaves domain fingerprints unchanged; its durable action
results are still written normally. Historical replay preserves the full DB and
returns the exact satisfied result after custody changes and owner reload.

Full-run sample: 174 outbound moves, one collection, 174 return moves; sequence
352 has seven chunks, hence exactly 18 knowledge gets and one witness. Selected
world gets remain 8; custody scans remain `[1, 1]`. Stashing clears completion,
and replay consults only execution sources. Five forged-proof cases and four
missing/tampered historical-source cases still refuse.

## Evidence and Commands

Workspace: `C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.
Evidence root: `test-results/objective-integrity-12003c0-01/`.

| Check | Result |
| --- | --- |
| `repro/`, original ordinary journey | 1 FAIL, 53.773s; exact original manifest refusal |
| `focused/`, intermediate assertion | 1 FAIL, 68.880s; logical key incorrectly expected tree `record/` prefix |
| `focused-checked/` | 1 PASS, 66.153s |
| `full/` | 13 PASS, 89.573s; no skips/retries/flaky cases |
| `fixture-types-final.log` | PASS, zero diagnostics |

Initial type diagnostics and both failed native logs/traces remain retained.
The final evidence includes `arrival-read-scope.json` with original records/accesses
and `pending-satisfied-stashed-historical-replay.json` with original actions,
receipts, fingerprints and rejection controls. Parent's original evidence is untouched.

```powershell
$env:MAZE_OBJECTIVE_RUN = 'objective-integrity-12003c0-01/focused-checked'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-objective-check.config.ts --grep 'ordinary collection and earned return satisfy' --output test-results/objective-integrity-12003c0-01/focused-checked/browser
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-objective-check.tsconfig.json
$env:MAZE_OBJECTIVE_RUN = 'objective-integrity-12003c0-01/full'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-objective-check.config.ts --output test-results/objective-integrity-12003c0-01/full/browser
```

Repro used the focused selector before edits with distinct `repro` output paths.
Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0, configured Chrome. Strict 5266,
no listener reuse; all sessions terminal and port released. Network fixture checks
prohibit API/service/provider/WebSocket traffic.

Limits: native IndexedDB/GameSession plus offline host proof, not mounted App UI,
actual service or providers. Counts are guarded canonical API calls, not raw IDB
reads/bytes or physical timing. The 18-get result is this seven-chunk arrival,
not a universal claim for every observation layout. No broader qualification run.
