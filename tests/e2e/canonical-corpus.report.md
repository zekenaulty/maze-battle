# Canonical Authored A/B Corpus

This document records the isolated native baseline. The subsequent parent
[actual-App and service composition report](../../docs/reviews/issue-11-canonical-corpus.md)
adds on-demand visible objects, cold-start planning, explicit collection and
host-proven return. The historical source/measurement values below are retained,
not silently relabeled as the later build.

Source: parent `cdb173484b1f3644d69dfd75c6625e20f3710895`, isolated merge
`7553f08420d83d9887986d7f3353fc604b67e342`. Scenario `canonical-survey-v1`,
audit-only seed `731`, modules-v3/branching-v1/stone-room-v1.
SDK SHA256: `f46c21d5a6b36e06b47d4941501b5e76b4bc6d6b8102043ba98cd852d20daf22`.
No production, App, planner, service, legacy save, preview, or dist changes.

## Integration API

`canonical-corpus.initialize.ts` exports
`initializeCorpus(variant: 'A' | 'B', owner: string)`.
Call only before starting the actual GameSession/App against an empty canonical
schema. It refuses existing games; it does not reset, accept, observe, move,
collect, or bind an objective. It returns genesis/preparation receipts for the
test oracle, not planner input. No alternate persistence store is introduced.

The initializer writes bounded authored world records, then uses the real
`prepareGameFloor` pipeline: structural qualification, room-role compilation,
and chest/contract preparation. Five bounded preparation receipts reach ready.
One genesis-only authoring receipt changes the unaccepted fetch definition to
Survey Seal. The ordinary quest/chest/item/award rules remain unchanged.
Genesis has 62 records, six receipts, null knowledge root, zero knowledge rows,
and no accepted quest or survey item. Party and starter inventory are normal.

`canonical-corpus.fixture.ts` is the native test mount, not a service planner:
it starts GameSession, enters town at the unmoved entrance, selects the posted
survey offer from the public guild board, accepts through the content command,
and leaves town. This gives two legitimate observations (initial look and town
return), both containing exactly the same cells. No setup move/discovery occurs.
The parent can reproduce these ordinary owner actions in its actual App harness.

## Layout And Boundaries

- Four 5x5 rooms and three reciprocal 1x7 passages. Entry and approach are equal.
- The later junction has north blocked/east open in A, and the reverse in B.
- A normally prepared treasure room contains the ordinary survey chest, beyond
  junction sight. The final room is a descent anchor, not a second target.
- All geometry passes the current canonical quality, role, and content gates.
  This is authored initialization, not evidence for generated-floor quality.
- Perception is unchanged: linked-vision-v1, radius 7, maximum 113 cells.
  The first observation contains 30 cells (25 entry + five passage), not the
  obsolete three-cell fixture. Qualified rooms currently require at least 5x5.
- No seed, layout, solved path, ideal cost, hidden target, inventory flag, or
  completion flag enters the actor projection. Raw audit helpers are separate.
- The native continuation helper consults currently observed junction edges;
  every local movement requires an earned adjacent destination. It is a manual
  fixture action sequence, not a model-competence or service-planning proof.

## Qualification

| Check | Result |
| --- | --- |
| Focused domain/normalization units | 7 PASS |
| Native Chrome/fresh IndexedDB | 4 PASS, 0 skips/retries, 23.0 seconds |
| Root and corpus fixture typechecks | 0 diagnostics |
| T0 and fixed common-action actor projections | Equal through six eastward moves |
| First lawful observation/projection divergence | Move seven, from normal sight |
| Explicit collection and retained item | Both A/B: one ordinary fetch award |
| Earned return and reload | Both A/B: 24 outbound moves, 24 reverse moves |
| Existing-game initialization | Refused; full before/after audit unchanged |

Compared surfaces: current GameView sight and actor state, normal party/items,
accepted quest display fields, exact capability schemas, actor observation,
current-cell inspection, paged room/map inspection, and paged frontiers.
Queries use real immutable publication/source paths and reject direct world
reads. Raw payloads, original receipts, access logs, and fingerprints/identities
remain in native JSON attachments. Observation frames stay at most 2540 UTF-8
bytes across this trace, below the unchanged 2800-byte bound.

The normalization allowlist is explicit in `canonical-corpus.normalize.ts`:
publication record/key identity, observation/source/chunk identity, observation
owner, and the three normal starter item instance IDs. References map
consistently across the trace, including parsed publication-scoped cursors.
Semantic IDs, coordinates, directions, sequence/revision, timestamps, counters,
costs, errors, missing fields, and ordering are retained. Browser Date is fixed
at `2026-10-20T12:00:00.000Z`, advanced one second per common action; timers run
normally. UUIDs are genuine, not overridden.

At T0, both projections made 359 logical get/scan/witness calls, 153 storage
reads / 176622 bytes, zero writes; 28 bounded frames, maximum 2220 bytes.
Logical call counts remained equal through T1 (359, 364, 345, 411, 466, 484);
at T2 they legitimately diverged to 490/496. No direct world read occurred.
**Storage-work/timing equivalence is NOT QUALIFIED:** independently generated
identities/storage layouts were not controlled, and raw counters differed
before T2 (final run move five: 199/198 reads, 247515/247093 bytes; move six:
207/207 reads but 268136/268226 bytes). These differences are preserved, not
normalized away or attributed to hidden geometry without further evidence.

This is a bounded native domain/projection baseline, not whole-Q acceptance.
Actual App pixels, navigation/admission/progress, service/planner choices,
typed completion delivery, full recovery matrix, scaling, timing, and live
model competence remain for their respective qualification lanes. No paid or
provider/service calls ran here.

## Commands And Evidence

Isolated checkout; port 5266 only, strict/no reuse; native fresh browser contexts.
The existing dependency junction lacks `@noble/hashes`, so resolution used the
parent's installed package read-only.

```powershell
$env:MAZE_RETURN_DEPENDENCY_ROOT='C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle'
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/canonical-corpus-unit-run2.json
$env:MAZE_CORPUS_RUN='canonical-corpus-native-final'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts
```

Typechecking used TypeScript's compiler API for `tsconfig.json` and
`tests/e2e/canonical-corpus.tsconfig.json`, `noEmit:true`, with only
`@noble/hashes/*` mapped to that same installed dependency directory.
Normal complete installations can run `tsc --noEmit -p` for those configs.

Evidence: `test-results/canonical-corpus-native-final/results.json` and its JSON
attachments. Previous native run2 also passed 4/4 in 23.1 seconds. Native run1
retains 3 PASS / 1 FAIL and trace: the comparison omitted observation source
header UUIDs from its identity allowlist; the exact header shape was added,
without stripping timestamps, revisions, or semantic facts. Initial typecheck
found three fixture-only typing errors, repaired before native qualification.
