# Issue 11: Frozen Qualification Ledger

2026-10-24. **IN PROGRESS**, not final acceptance. Issue 11 and the umbrella goal
remain open. No paid providers, owner-data reset, preview replacement, merge or
deployment is authorized by this ledger.

## Candidate And Boundaries

- Frozen Maze source: `d57884de84e6e952dc5768a22cd3ed10b5c566fc`.
- Qualification checkout: `C:/Users/Zythis/.codex/worktrees/s6-qualification/maze-battle`,
  isolated branch `codex/s6-qualification`, initially no dependencies installed.
- Parent integration/report branch: `codex/agentic-game-a1`. Subsequent report-only
  commits do not change the frozen source. Any production/test repair requires an
  explicit new candidate identity and affected reruns.
- Pinned Agentica: `27cb2ce9717438edfe19487e3920faa183112c97`, matching browser SDK.
  Actual-service launcher explicitly uses alternate .NET 10.0.401, not repository
  SDK-pin 10.0.302 qualification. Offline planners make no provider calls.
- S2's comparison and S5's new fixtures are test-only. Existing limits and
  canonical runtime are unchanged. See [S2](issue-11-s2-integration.md) and
  [S5 child evidence](issue-11-generated-endurance.md) for exact proof limits.

## Rolling Gates

| Gate | Current status |
| --- | --- |
| Clean locked install | PASS, 123 packages / 12s, physical checkout-local dependencies, unchanged manifest/lock |
| Full units and Node comparison tests | PASS, 5,017 units / one existing optional skip (333.36s); 20 extra fixture units; 46 Node audit tests |
| Production and affected fixture types/build | PASS, nine projects including broad canonical and explicit App recovery; production build 2,156 modules / 1.22s, existing bundle warning retained |
| Seven-case generated endurance | Child cases pass incrementally; combined frozen run NOT RUN |
| Affected native/known-destination/controller/capacity/UI suites | IN PROGRESS, serialized native run; discovered manifest has 1,521 unique native cases including seven generated endurance cases |
| Full pinned actual-service cohort | Discovery PASS, 54 distinct cases; execution NOT RUN on frozen candidate |
| Desktop/portrait production smoke | NOT RUN on frozen candidate |
| Final source/environment/evidence reconciliation | NOT RUN; required before any acceptance claim |

## Retained Environment Attempts

The first `npm ci --no-audit --no-fund` attempt in the parent checkout failed:
Windows would not unlink its loaded Rolldown native module. Read-only process
inspection identified the old preview processes on 5199/5200 as the holders;
they were not stopped or altered. Parent dependency restoration via
`npm install --ignore-scripts --no-audit --no-fund` exited zero, retaining its
locked-file cleanup warning. npm's unrelated generated peer flag was removed;
no manifest/lock source change is part of this increment. These attempts are
under the parent's `test-results/s6-585f507/` and are not clean-install proof.

A new exact-source worktree was then created with no node_modules. Its first
locked install failed `ECONNRESET` (with a cleanup warning); the original
`npm-ci.log` and npm debug log are retained under that checkout's
`test-results/s6-585f507/`. A separate `npm-ci-retry.log` records the
`--prefer-offline` retry, without relaxing locked dependency validation.

That retry passed (123 packages / 11s). A preliminary `585f507` source run then
passed 5,017 units with one optional skip, static checks, 20 fixture units, 46
Node audits and build. Final fixture review identified missing depth-scaled
query metering and App-recovery type coverage. Those test-only additions plus
native desktop-wheel/phone-touch controls produce the declared new candidate
`d57884d`; `git diff 585f507 d57884d -- src package.json package-lock.json` is empty.
Final clean install and static/unit gates were rerun under the new identity,
not silently relabeled from that preliminary run.

## Frozen Discovery And Review

Evidence root: the qualification checkout's `test-results/s6-d57884d/`.
`source-before.json` records all 1,687 tracked source/fixture/config input hashes,
Node 22.13.0 and npm 11.6.2. Native Chrome is 155.0.8059.85 on Windows x64.
`discovery/manifest.json` retains each discovered case ID, source/title and exact
selector across 47 configurations, with duplicate IDs rejected: **1,575 unique
cases**, comprising **1,521 native + 54 service**. These are selected counts,
not current pass counts. Generated endurance is seven of the native cases.

Four broad configurations use explicit filename selectors: canonical kernel,
Agentica admission, base transport and App recovery. Overlapping Auto-exclusive,
service-chest and operation-review wrappers are omitted. The service's eight-cut
recovery cases are already in its 54, not counted again. Discovery corrects
source-only estimates (quality is 40, launch is 102, extra fixture units are 20).
The first service discovery correctly refused missing launcher context. The
subsequent discovery uses verified retained constructor inputs and starts no
service; full execution must use the pinned launcher and its fresh build.

Independent source review found no blocking issue in the final width-two depth
pager, snapshot binding, native metering or camera-control assertions. Room
pages request two and connections request one; production caps remain unchanged.
The old width-four seed-781 feasibility failure remains retained. This is not a
claim of more discovered rooms or a second four-room UI page on that seed.
The two new camera checks passed before the final freeze, with screenshots
visually inspected; final integrated browser execution still must rerun them.

The native runner serializes configuration/port ownership and retains
`native/<config>/results.json`, runner logs and failure traces. It verifies the
selected count, rejects skips/flakes/errors, and stops at the first failed gate.
`native/execution.json` is its incremental ledger. Final service qualification
will retain its independently generated provenance, assembly hashes and results.

The final report will distinguish test failures, fixture corrections and
environment failures, retain original attempts, and name all unmet gates.
Focused earlier passing results are not relabeled as this final combined run.
