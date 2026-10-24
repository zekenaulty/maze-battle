# Frontier Prefix Commitment Fixture

2026-10-24. Branch `codex/frontier-prefix-commitment-fixture`, base
`f5e2edc155a52df3ba96a0715653640a528832b7`. Only exploration evidence/entry/scenes
and this report changed. No production, SDK, limits, dependency, config or parent edits.

## Finding and Proof Boundary

The original A/B prefix failure reproduced: its first three differences were only
`header.chunksDigest`. That commitment hashes ordered full CanonicalRecord
envelopes, including independent generation/game/record identities, not just cells.
The failure remains under `test-results/frontier-prefix-f5e2edc-01/baseline/`;
the parent's original 11 PASS / 1 FAIL remains in its qualification
`test-results/s6-2c67b31/native-rest3/canonical-frontier-exploration/` directory.

Each capture now retains its original snapshot separately from the unchanged
public frame. Comparison reads that historical snapshot, checks its checkpoint
knowledge witness, and loads only the exact parent, integrity manifest and ordered
chunks. Existing full-observation validators verify references, envelope scope,
revision, manifest/header cross-binding, every chunk digest and cell coverage.
The fixture also explicitly recomputes the ordered raw commitment and requires
exact captured header/cell equality before mapping anything. Supplied source copies
must validate AND equal the witnessed original records; a self-consistent digest
alone cannot authorize substituted evidence. No current-observation refresh,
world reads, scans or writes occur in this comparison.

The bijection rejects raw-ID aliasing or role replacement across the transcript.
Only explicit generation/game IDs, observation/chunk/manifest record IDs and their
header/manifest/frontier references are mapped. The existing `observedAt` wall-clock
mask remains; clocks and UUID generation are not overridden. Full mapped chunk
envelopes produce a new ordered commitment; the mapped parent and manifest retain
their corresponding derived hash links. All other envelope, header, cell and
frontier fields remain intact; unsupported source fields fail validation rather
than disappear. Derived records are comparison artifacts, never canonical proofs
or actor context. The selector still receives only the existing public-frame shape.

## Checks and Retained Evidence

| Check | Result |
| --- | --- |
| Original focused A/B | 1 FAIL, 7.861s |
| Final focused A/B, including controls | 1 PASS, 15.560s |
| Full exploration suite | 12 PASS, 58.047s |
| Final frontier fixture types | PASS, zero diagnostics |

No skips, retries or flaky cases. Initial type attempt `fixture-types-01.log`
retains TS2589 from transporting recursive records through Playwright's argument
type. Controls now run alongside the existing typed browser capture, without casts;
`fixture-types-03.log` is the final check. Intermediate focused evidence is retained.

Raw frames/snapshots, complete original records, witness, access keys, work stats,
identity mappings, derived records/commitments and mutation inputs/results are in
the `A-public-and-native-state.json` and `B-public-and-native-state.json` attachments
embedded in `full-01/results.json`. Both original game/generation IDs differ, as
do all three raw prefix digests. The mapped prefix matches; legitimate fourth-frame
cells and commitments still differ, and actual earned choices remain east/north.
Copied wrong commitments and a raw chunk-cell coordinate mutation both refuse
exactly; copied direction changes and unknown frontier fields remain visible.
The controls leave the whole native DB unchanged.

Per-frame verification for sequences 1/2/3/4 in BOTH A and B: 15/16/18/18 reads,
21397/24892/28407/30581 logical read bytes, zero writes/write bytes. Exact knowledge
access lists are asserted. This is separately metered, privileged test verification
under unchanged default 2048-read/512-write/4-MiB limits, not extra actor allowance.
It does not establish universal read-work, physical timing, service or full S2 equivalence.

## Commands and Identity

Run in the isolated worktree with Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0
and configured Chrome. Logs/JSON/browser evidence use separate directories beneath
`test-results/frontier-prefix-f5e2edc-01/` (baseline, focused-01, focused-02, full-01).

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/frontier-prefix-f5e2edc-01/focused-02/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-frontier-exploration.config.ts canonical-frontier-exploration.scenes.ts --grep 'A/B earn the same prefix' --output test-results/frontier-prefix-f5e2edc-01/focused-02/browser --reporter list,json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-frontier.tsconfig.json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/frontier-prefix-f5e2edc-01/full-01/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-frontier-exploration.config.ts --output test-results/frontier-prefix-f5e2edc-01/full-01/browser --reporter list,json
```

Baseline used the focused selector before edits with separate baseline paths.
Tested Git blobs: evidence `2bf76603030368e00ff37887e365cc6e8ed9717e`,
entry `291cf2fbbcda08037fcb4eefd67fc0e3e1d8dc97`,
scenes `60e11f46bc25e52a9177933287f9e0ebd5884fbb`.
Only strict port 5291 was used, with no listener reuse; it is released with no
remaining listener and all sessions terminal. No services or paid providers.
