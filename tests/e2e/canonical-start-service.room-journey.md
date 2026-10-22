# Actual-App room journey qualification

## Identity and boundary

- Base runtime: `3e04e914fde3d7f4c1945f5f4cae4e6f0e9c9d64`.
- Branch: `codex/room-journey-qualification`, isolated existing worktree
  `C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.
- Clean Agentica source: `C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`
  at `27cb2ce9717438edfe19487e3920faa183112c97`, unchanged after execution.
- Node `22.13.0`, npm `11.6.2`; actual-service Release build uses the existing
  launcher's explicit SDK `10.0.401`. Repository SDK pin `10.0.302` is NOT qualified
  (`pinProof: false`). Native installed Chrome, one worker, zero retries.
- Strict owned browser/service ports `5426/5427`; no listener reuse or contention.
  Both stopped after completion. Parent `5258/5259`, owner `5198`, preview `5199`,
  parent source/dependencies and all production source are untouched.

## Composition and assertions

The existing authored A/B corpus starts with null knowledge. The actual App loads
through GameSession and ordinary sight; the existing helper accepts a public guild
offer without exploration or position injection. Hidden fixture target data is
used only by independent effect audits, never by the planner or navigation inputs.
The offline planner has no world, generator, fixture-layout or per-cell route input.

Each case scouts using three delivered frontier tokens, sees an unopened chest,
pages the earned room index, and returns to the earned entrance without collecting.
At the entrance it reads map page one and its exact continuation cursor, then
chooses the disclosed chest room from page two at the same published revision.
The selected node's exact earned anchor supplies the navigation arguments. Its
world anchor must be outside the actual canvas viewport captured at that snapshot.
Read-only queries must not advance that snapshot's knowledge or checkpoint.

The selected navigation must arrive in more than 16 actual retained movement steps
under the existing 64-step / 4-replan / 120000ms operation limits. A subsequent
current objects query drives local chest approach, one fresh current-tile inspection
supplies the explicit interaction token, and the earned return completes the host
retrieve-return objective with one carried Survey Seal. No automatic loot or
cardinal per-cell planner commands are used.

A has no reload. B reloads after the selected-anchor arrival, before collection:
owner/epoch change, game/generation/checkpoint/world/knowledge and original launch
binding remain exact; no automatic wire traffic or planner calls occur; Continue
is disabled until explicit original inspection and adoption. Original action,
binding, navigation progress/limits and terminal event remain exact. The bounded
policy requires the same objective/session and monotonic continuation usage.

All 32 completed originals in each case are replayed through existing SDK hooks
using their original grant/publication. Fresh submissions are forbidden; returned
and reconciled results, retained SDK rows and canonical head must remain exact.
Root Stop is acknowledged and allocations are empty at cleanup.

## Results, 2026-10-22

PASS: two native cases, zero failures/skips/retries; runner duration **340.583s**.

| Evidence | A | B |
| --- | --- | --- |
| Test duration | 156.963s | 175.276s |
| Earned rooms / selected page | 3 / 2 | 3 / 2 |
| Selected navigation steps / replans | 22 / 1 | 22 / 1 |
| Anchor world row,column | 2,24 | -8,14 |
| Captured viewport rows / columns | 0..14 / 0..20 | 0..14 / 0..20 |
| Connections result | complete, 1 item | partial, 1 item |
| Public queries / explore / navigate / interact | 24 / 3 / 4 / 1 | 24 / 3 / 4 / 1 |
| Original start / wake / adoption | 1 / 8 / 0 | 1 / 7 / 1 |
| Planner windows / refinement calls | 9 / 23 | 9 / 23 |
| Exact action replays / new submissions | 32 / 0 | 32 / 0 |
| Max result / observation UTF-8 bytes | 2970 / 2578 | 2970 / 2578 |

The original corpus launch profile remains 64 steps, 48 refinements, 16
continuations, 300s timeout and 30s action timeout. Assertions retain 4096-byte
results and 2800-byte observations. Graph/frontier read budgets and all other
runtime allowances are unchanged. Raw canonical diagnostics are retained, but are
not a separate per-query graph-read meter or a disk/timing noninterference proof.
Paid-provider calls are zero by offline-factory construction, not billing telemetry.

PASS: fixture types, production types, two-case discovery, Release service build
(zero warnings/errors), and `git diff --check`. All 104 fixture-source hashes in
the passing provenance still match after execution; production contract diff is empty.

## Commands and retained evidence

All commands run from the isolated worktree above:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
$env:MAZE_START_BROWSER_PORT='5426'
$env:MAZE_START_SERVICE_PORT='5427'
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App room journey' 2>&1 | Tee-Object -FilePath test-results/room-journey-cohort-03.log
exit $LASTEXITCODE
```

Discovery used the same two ports plus `MAZE_START_SERVICE_DLL`,
`MAZE_START_SERVICE_STORAGE`, and `MAZE_START_SERVICE_LOG` set to `discovery-only`:
`node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-start-service.config.ts --grep 'actual App room journey' --list`.
These discovery-only values were confined to that command process.

Passing raw evidence: `test-results/maze-start-service-3NA5aZ/` contains
`provenance.json`, `results.json`, native traces, screenshots, service/build logs,
and proof/final-state attachments with original requests/results/custody/replays.
Provenance records every fixture hash, built assembly hash, source identity,
exact build/browser arguments and disposable service-storage path.

Two earlier A-only runs used the same launcher command with grep
`A: actual App room journey`; both FAIL records are preserved:

- `test-results/maze-start-service-uORVZr/`, console
  `test-results/room-journey-feasibility-01.log`: fixture incorrectly charged the
  .NET planning frame's Unicode-escaped embedded JSON as the wire payload. The
  retained frontier result was 2970 bytes and observation 2578 bytes. The planner
  now measures compact wire JSON with the same 2800-byte cap, without dropping
  fields. This was not a runtime budget failure or an increased allowance.
- `test-results/maze-start-service-51UBbU/`, console
  `test-results/room-journey-feasibility-02.log`: fixture used serialized object
  key order for address equality and failed to capture the entrance viewport.
  It now checks the four address fields and waits for the exact canvas frame.
  The page-two, off-window and >16-step requirements were retained.

An initial fixture typecheck also caught a test loop variable shadowing browser
`window`; renamed before native qualification. No failed evidence was overwritten.

## Limits

This qualifies one composed actual-App/provider-free service journey on each of
two authored corpus geometries, not generated-world generality or planner quality.
The planner holds bounded volatile public policy state for at most two roots and
16 continuations, at most 16 query/action planning calls per window and two map
pages. Browser adoption is covered; service-process restart of this policy is not.

The page choice is through the public service map (two rooms/page), not a manual
Rooms-tab click (four rooms/page). It does not establish manual paged selection
and travel composition. Connections are a public earned check, not route input:
B's partial result is not relabeled complete, and connection pagination is not
exercised. The room/cell viewport assertion is desktop only (1440x1000).

NOT-RUN in the isolated lane: parent full service/unit suites, new-game/generator cohort, paid
providers, owner preview, whole UI/tool matrix, corruption matrix, alternate SDK
pin, service restart. Parent results are not re-attributed to this branch. This
bounded gate does not mark all Sprint 1 complete; no push, parent integration or
issue closure is performed by this lane.

## Parent Integration, 2026-10-22

Integrated isolated commit `627b3f6` as `cc7799f`. Independent review identified
two missing assertions, although the retained evidence already satisfied both:
the final service outcome must be `succeeded` / `complete` before root Stop, and
the collected quest item must be in the pack, not merely in the combined
pack/stash oracle. Parent commit `6f5508f2e11f23203c84e4d573c22ba69cecbd02`
adds these assertions without changing production behavior or allowances.

The frozen parent then ran the complete actual-App/service cohort:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
```

**45 PASS, zero failures/skips/retries/flaky cases; 1,452.803s**, starting
`2026-10-22T22:51:50.191Z`. A took 172.446s and B took 186.049s. Both retained
32 original actions and exact replays, a 22-step / one-replan selected journey,
one quest item in the pack, successful service completion and zero allocations
after acknowledged root Stop. The previous 43 service cases also pass.

Evidence: `test-results/maze-start-service-VCRk6H/`, including `results.json`,
`provenance.json`, original proof/final-state attachments, traces and service logs.
The runtime and fixtures were unchanged until the runner completed. Agentica
remains the clean `27cb2ce9717438edfe19487e3920faa183112c97` source above;
SDK 10.0.401 and `pinProof: false` remain explicit. The Release build has zero
warnings/errors, and the parent service-fixture typecheck passes. Owned ports
5258/5259 stopped after execution; owner port 5198 was untouched.

This closes the authored off-window selection/travel/collection/return composition,
not the entire six-sprint goal. In particular B reloads at an arrived decision,
not during movement. Actual-App unfinished-operation resume and subsequent
Continue under transferred custody are a separately identified recovery gap.
No mid-flight recovery, generated-world generality, complete planner-frame
comparison or live-model qualification is inferred from this run.
