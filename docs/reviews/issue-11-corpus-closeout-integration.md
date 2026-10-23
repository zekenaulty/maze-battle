# Corpus Closeout Integration

2026-10-22 local / 2026-10-23 UTC. Frozen runtime/fixture candidate
`95b4069dc402911111dea39f65d7b5fb836e0dfb`, `codex/agentic-game-a1`.
Issue #11 and the umbrella goal remain open. No paid calls or owner-data changes.

## Repairs And New Evidence

- The historical decision reader previously rejected a genuine zero-step custody
  probe. Probe identity now requires exactly `custody-${source.attemptId}`;
  progress/transfer still require the exact bare attempt. Source, publication,
  operation, revision and receipt witnesses remain required. The old mock probe
  was corrected to use the actual producer; negative tests retain source checks.
  [Paired navigation evidence](../../tests/e2e/canonical-corpus.navigation.report.md).
- Two new actual-App/service cuts preserve one collected quest item and exact
  original results across lost accepted progress/completion confirmation and
  reload. Explicit recovery settles funded child/root custody without extra
  Start/wake/execution. [Delivery evidence](../../tests/e2e/canonical-start-service.corpus-delivery.md).
- Manual hook, Auto scheduler and Agentica operation driver reach the same
  game-owned move/open rules. Navigation does not collect; separate authorized
  opening conserves all items and persists through reload/replay. Agentica uses
  synthetic offline custody and two launches here, not real-service successors.
  [Controller evidence](../../tests/e2e/canonical-controller-parity.report.md).

Independent review found four assertion gaps, not observed production failures:
reload compared only post-reload states; inventory conservation missed old stack
bases; the fault wrapper hid duplicate completion attempts; property-order-sensitive
filtering missed duplicate progress identities. Separate commits strengthen all
four and add mutation tests. Parent source review retained the custody identity
repair without relaxing the surrounding validation. Child and parent raw evidence
remain separately identified; failed attempts were not overwritten.

## Integrated Checks

| Check | Result | Evidence under `test-results/` |
| --- | --- | --- |
| Affected history/custody units | 217 PASS / 11 files | `corpus-closeout-history-units.json` |
| Delivery assertion mutation tests | 7 PASS | Focused command below |
| Paired native navigation/history | 2 PASS, 61.904s | `corpus-closeout-navigation/results.json` |
| Controller cohort and assertion probes | 14 PASS: 1 native case / 13 assertion tests, 23.867s | `corpus-closeout-controller-parity/results.json` |
| Existing corpus plus new characterization | 9 PASS: 8 prior cases / 1 defect characterization, 116.311s | `corpus-closeout-queries-work/results.json` |
| Actual-App/pinned-service subset | 5 PASS, 274.371s | `maze-start-service-5qRcOu/results.json` |
| Production and three affected fixture types | PASS | Terminal commands |
| Isolated production build | PASS, 2,147 modules; existing >500 kB warning | `corpus-closeout-build/` |

No native retries, skips or flaky cases. The service subset is three existing
same-owner/adopted/post-transfer decision-history cases plus the two new delivery
cuts. The grep's `complete planner inputs` alternative matched no test; it did
NOT rerun the separately named planner-input pair. The full prior 48-case service
suite and full units were not rerun here; final expanded regression remains S6.

Service source: clean `27cb2ce9717438edfe19487e3920faa183112c97`. SDK 10.0.401,
not repository pin 10.0.302 (`pinProof: false`). Isolated build: zero warnings/errors.
All 134 fixture hashes in provenance match after the run; production source stayed
unchanged. Service console: `corpus-closeout-service.log`. Ports 5258/5259, 5266,
5456 and 5466 are stopped. Owner 5198 and existing production previews were untouched.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.navigation.unit.config.ts src/persistence/canonical/agentica/decision.query src/persistence/canonical/agentica/operation.probe.test.ts src/persistence/canonical/agentica/operation.records.test.ts src/persistence/canonical/agentica/operation.wire.test.ts src/persistence/canonical/agentica/decision.claim.test.ts src/persistence/canonical/agentica/decision.interaction.test.ts src/persistence/canonical/agentica/terminal.base --maxWorkers=2 --reporter=json --outputFile=test-results/corpus-closeout-history-units.json
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-start-service.corpus-delivery.unit.config.ts --maxWorkers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.navigation.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-controller-parity.config.ts --workers=1 --retries=0
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App corpus delivery|actual App explicitly queries historical decision|complete planner inputs'
node node_modules/vite/bin/vite.js build --outDir test-results/corpus-closeout-build
```

## Open Capacity Failure

The controlled native [capacity test](../../tests/e2e/canonical-corpus.work.report.md)
reproduces private world occupancy changing public action admission at a common
quota. A succeeds; B, four private bytes larger, fails. Complete native-store
rollback passes. This is a FAIL of information noninterference, not a claim that
the runner's passing characterization closes Sprint 4. No quota/schema repair
is included. The [next bounded repair](issue-11-private-world-capacity-plan.md)
must reserve private generation capacity without changing raw actual accounting
or spending funded recovery. Raw-I/O disclosure also remains open. Required S3
recovery cuts, generated endurance and frozen final qualification are not waived.
