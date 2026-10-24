# Issue 11: Frozen Qualification Ledger

2026-10-24. **IN PROGRESS**, not final acceptance. Issue 11 and the umbrella goal
remain open. No paid providers, owner-data reset, preview replacement, merge or
deployment is authorized by this ledger.

## Candidate And Boundaries

- Frozen Maze source: `585f507d250b7628b55ad995a63ba37614167293`.
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
| Clean locked install | IN PROGRESS; first isolated install failed on network reset, retry retained separately |
| Full units and Node comparison tests | NOT RUN on frozen candidate |
| Production and affected fixture types/build | NOT RUN on frozen candidate |
| Seven-case generated endurance | Child cases pass incrementally; combined frozen run NOT RUN |
| Affected native/known-destination/controller/capacity/UI suites | Final manifest under independent read-only review; NOT RUN on frozen candidate |
| Full pinned actual-service cohort | Final deduplicated discovery and run NOT RUN on frozen candidate |
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

The final report will distinguish test failures, fixture corrections and
environment failures, retain original attempts, and name all unmet gates.
Focused earlier passing results are not relabeled as this final combined run.
