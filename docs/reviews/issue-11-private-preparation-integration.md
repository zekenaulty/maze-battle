# Issue 11: Private Preparation And Restored Worlds

2026-10-23. Runtime candidate `5125cbe`, disclosure assertion `69e0dbc`, and
additional restore tests `e64edce`. Issue 11 and the umbrella goal remain open.

## Delivered Behavior

Actual new-game initialization and each floor's bounded preparation now reserve
a deterministic public envelope before writing private world data. The first
next-floor command covers bootstrap and its first expansion. Later batches prove
the original allocation record and its exact creation receipt, consume actual
retained records/nodes/receipts once, and close without returning unused slack.
Raw occupancy remains the actual sum of retained canonical store envelopes.

The allocation writer permits only the floor's world records and secondary
indexes. It rejects unrelated gameplay writes, checkpoint/control/operation
mixing, late/repeated declarations and caught writer failures. Original receipt
replay precedes current policy/source validation. Funded cancellation and verified
ACK still use their narrow existing cleanup path under invalid private policy.

The original authored A/B quota defect is repaired: the common admission boundary
is **11,629,830 logical bytes**. Both worlds refuse at boundary minus one; both
accept at the boundary and plus one. Their actual retained sizes still differ by
four bytes. Independent native-store sums remain truthful, and every refusal
preserves the entire database. The controlled baseline move has equal work:
168 reads, 26 writes, 132,180 logical read bytes and 26,505 logical write bytes.
This is one declared authored prefix, not universal work-limit noninterference.

## Save Restoration Findings And Repair

The first native next-floor run reproduced an unfinished-save defect: restoring
old world roots succeeded after their allocation had closed, leaving preparation
unable to resume. `fb86886` rejects an unfinished current-floor snapshot before
changing the game. Its original failing result remains retained.

Independent review then found the corresponding completed-save case: save ready
floor one, prepare floor two, and load the earlier save. Current accounting and
execution correctly survive restoration, so the old floor-two allocation stays
closed. Reusing that identity would strand the restored world or double-spend
its allowance. The same problem affects saves on floor one while floor two is
still being prepared.

`5125cbe` gives each successful actual-game restore a current preparation lineage
in the same execution tree and transaction as its load receipt and restored
roots. The record is bound to that exact `save.command` load, revision, record ID
and canonical witness. Later generation uses `floor-N:restore-REV` and reserves
a full new envelope before any private write. The old anchors, consumed bytes
and unused slack remain charged. No accounting, custody or execution roots are
rewound; no source history is scanned. A current pointer and one original receipt
suffice. Replaying an old load returns its receipt before changing that pointer.

Both previously broken completed-save sequences now finish generation. Native
checks also cover two successive fresh restores, browser reload during restored
preparation, exact old replay, missing load-source refusal, the new reservation
boundary, and rollback at record/node/receipt/head persistence failures. Repeated
restoration legitimately consumes additional capacity; it does not reclaim old
private storage. Saves whose current floor itself is unfinished explicitly
refuse rather than loading an unusable game.

## Evidence

These rows are distinct runs; their counts are not added into a combined suite.
Artifacts are retained under this checkout's ignored `test-results/` directory.

| Candidate / check | Result and artifact |
| --- | --- |
| `fb86886`: first integration full units | 5,004 PASS, one existing optional SKIP; `private-preparation-full-units.json` |
| `5125cbe`: full units after lineage repair | 5,017 PASS, one existing optional SKIP; `restored-preparation-full-units.json` |
| Real-pages index guard and lineage provenance units | 25 focused PASS; `restored-preparation-focused.json`; included in the full units above |
| `fb86886`: native kernel/reset/operation regression | 83 PASS; `private-preparation-kernel/results.json` |
| `fb86886`: native manual-save regression | 65 PASS; `private-preparation-manual-saves/results.json` |
| `5125cbe`: actual App manual/Auto/saves | 13 PASS; `restored-preparation-app/results.json`; desktop/portrait and two-tab cases included |
| `5125cbe`: native capacity/preparation | 30 PASS; `private-restored-lineage-all/results.json` |
| `69e0dbc`: review follow-up restore faults/reload | 5 PASS; `private-restored-lineage-review/results.json` |
| `e64edce`: integrated native capacity | 35 PASS, zero failures/skips/retries; `private-restored-lineage-final/results.json` |
| `e64edce`: integrated authored corpus | 9 PASS, zero failures/skips/retries; `private-restored-lineage-corpus-final/results.json` |
| `69e0dbc`: actual App and pinned Agentica cold A/B | 2 PASS, 196.544s; `maze-start-service-MNSb3y/results.json` and `provenance.json` |
| Types and build | Production, private-capacity and corpus fixture types PASS; isolated production output `restored-preparation-build/` PASS. Existing large-bundle warning retained. |

The service run builds clean Agentica `27cb2ce9717438edfe19487e3920faa183112c97`
with .NET **10.0.401**, explicitly separate from repository pin 10.0.302. Both
actual-App authored cold-start journeys retain earned exploration, the observed
branch change, explicit ordinary collection, earned return and host completion.
The injected offline planner makes zero paid-provider calls. This focused pair
does not replace the final full service/recovery cohort.

The first expanded corpus run (`private-restored-lineage-corpus/`) had eight
passes and one failed raw-head assertion. It expected only actual `usedBytes`
to differ; truthful `privateCapacity.consumedBytes` now also differs by the same
four private bytes. `69e0dbc` explicitly asserts both exact raw differences,
equal public allocated capacity, equal ordinary charge, unchanged earned
payloads and exact native work. No private bytes were normalized or hidden.
The focused disclosure rerun passes in
`private-restored-lineage-disclosure-after/results.json`.

Reproduction commands use the existing private-capacity and corpus Playwright
configs with distinct `MAZE_CAPACITY_RUN` / `MAZE_CORPUS_RUN` output names. The
service command is:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App cold-start survey adapts'
```

## Remaining Gate

The subsequent [command-work qualification](issue-11-command-work-qualification.md)
closes the declared S4 threshold/controller cohort at its bounded evidence level.
S2's explicit status/ACK correspondence and consumer-order proof,
S5 generated topology/history endurance, and S6 frozen-candidate qualification
remain open. The original strict wire-order failure is not erased by these
capacity results. No live-model qualification, schema migration, owner reset,
merge, deployment, or preview replacement occurred.
