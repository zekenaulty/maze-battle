# Paired Dispatched Query Qualification

2026-10-22. Parent runtime `a374b1f` (runtime qualification at `96facb3`), plus
this test-only increment. This closes part of Sprint 2, not its all-surface gate.

## Claim And Method

Three native browser cases compare authored A/B worlds at fixed common movement
prefixes 0, 6 and 7. Ordinary initial sight and explicit accepted-quest setup are
unchanged. Controlled clock/UUID inputs are declared by the existing corpus
fixture; no comparison normalizes returned fields, counters or error data.

Each case uses a disposable canonical IndexedDB and a typed offline launch
admission. Nine real `maze.inspect` actions execute through production action
reservation, dispatch and persisted result paths: active journal, selected quest,
empty complete/claimed pages, objective, initial decision history, earned recall,
unknown address and invalid quest selector. The selected quest handle comes from
the returned journal. Recall selects an initially observed cell, later outside
current sight, and checks both its exact address and remembered classification.

At steps 0 and 6, start/action/result frames, captured commit work and byte vectors
match exactly. At step 7, ordinary sight has legitimately diverged; only the
unchanged accepted-quest detail is asserted equal. The unknown cell returns an
opaque `unknown` result without cell detail; the invalid quest selector is refused.
The objective remains pending and initial history is unavailable, not fabricated.

World/knowledge roots and the game checkpoint do not change. Each batch captures
18 reservation/resolution commits. Across the three cases, observed maxima are
1,022 observation bytes, 1,411 result bytes, 107 reads and 196,257 read bytes per
captured commit, within unchanged limits. These are logical kernel counters,
not physical disk I/O or a trace of every read performed by the host hooks.

## Qualification

```powershell
$env:MAZE_CORPUS_RUN='canonical-corpus-queries-final'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.tsconfig.json
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/canonical-corpus-queries-units.json
```

Final combined native suite: **8 PASS**, zero failures/skips/retries, 73.518s,
started `2026-10-22T20:26:07.690Z`. Corpus units: **11 PASS**. Fixture types PASS.
Raw paired frames and commit metrics are retained as attachments in
`test-results/canonical-corpus-queries-final/results.json`; units are in the named
JSON above. Independent review found the initial recall assertion lacked selected
cell identity; it was strengthened before this final run.

Earlier fixture failures remain in `canonical-corpus-queries-initial` and
`canonical-corpus-queries-status-fix`: incorrect expected objective status,
incorrect unknown-cell shape, and a recall tile still visible. The corrected
three-case run is `canonical-corpus-queries-earned-recall` (3 PASS, 22.629s).
The first combined run is `canonical-corpus-queries-combined` (8 PASS). No runtime
behavior, disclosure limit or production persistence rule was changed to pass.

## Limits And Remaining Work

This is real browser/canonical dispatch with **offline typed admission**, not
HTTP/WebSocket service, SDK transport, complete planner-input or paid-model proof.
Network is blocked by the corpus fixture. Initial unavailable history does not
qualify a nonempty predecessor or explicit successor publication. Unchanged
domain roots do not establish absence of hidden reads. Captured commit counters
exclude reads outside those transactions. The separate native tracer in the
existing disclosure case retains its own narrower evidence limits.

New room-connection scopes are still on isolated branches. Add them after
integration, then complete the declared movement/result/UI/fog comparisons and
actual initial/refinement/successor planner-frame cohort. No owner preview/data,
provider service, schema migration or legacy-save reader was touched. Issue #11
and the goal remain open.
