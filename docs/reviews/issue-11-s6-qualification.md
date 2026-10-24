# Issue 11: Frozen Qualification Ledger

2026-10-24. **IN PROGRESS**, not final acceptance. Issue 11 and the umbrella goal
remain open. No paid providers, owner-data reset, preview replacement, merge or
deployment is authorized by this ledger.

## Candidate And Boundaries

- Current qualification candidate: `60c1346df4091418b30f83eb4f18d9ff8e35dc7b`.
  Original freeze: `d57884de84e6e952dc5768a22cd3ed10b5c566fc`. The exact
  fixture-only repair and compatible-evidence boundary are recorded below.
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
| Seven-case generated endurance | PASS, combined parent 7/7 at `2c67b31`, 18.7m, no skips/retries; S5 bounded complete |
| Affected native/known-destination/controller/capacity/UI suites | IN PROGRESS, serialized native run; discovered manifest has 1,521 unique native cases including seven generated endurance cases |
| Full pinned actual-service cohort | Original default-port run 53 PASS / 1 FAIL; corrected helper follow-up 15 PASS. Fresh full 54-case run IN PROGRESS at `60c1346`; no relabeling |
| Desktop/portrait production smoke | PASS at `d57884d`, three production-build viewports (desktop, phone portrait/landscape); screenshots inspected |
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

## First Browser Failure And Candidate Repair

The `d57884d` serialized run stopped after five complete passing configurations
(187 cases) and a perception result of **7 PASS / 1 FAIL**. Raw failure/trace:
`test-results/s6-d57884d/native/canonical-agentica-perception/`. The old assertion
required room keys `level,source,spaceId`; the established earned graph contract
returns `level,spaceId,kind,anchor`. This was a stale fixture expectation, not a
runtime change or permission to remove disclosure checks.

The correction independently constructs the exact first two room nodes from
the original observation header's room classifications, observed cells, source
ID/sequence/index and coordinates. Strict equality and exact key checks reject
extra fields, changed anchors, ordering or provenance. Independent review found
no weakened boundary. Parent focused perception **8/8 PASS** (15.5s), fixture
types PASS, at the working bytes committed as `2c67b31`.

The qualification checkout advanced explicitly to `2c67b31`. Its
`test-results/s6-2c67b31/source-compatibility.json` checks all 1,687 prior inputs:
only `canonical-agentica-perception.spec.ts` changed; all 1,686 other source,
fixture, config and dependency inputs remain exact. The eight discovered
perception IDs are unchanged. Broad canonical fixture types and all eight
perception cases rerun in this checkout (13.39s). Prior complete native gates,
unit/static/build and production-smoke evidence retain their original identity;
the failed perception suite is superseded only by the new passing full suite.
This is one compatible-candidate qualification ledger, not a claim that the
original failed run became green or that every command ran on the same SHA.

Remaining native gates run under `test-results/s6-2c67b31/native/`, with exact
selectors from its retained `manifest.json` and no changed case count. The
54-case pinned actual-service run uses a fresh build and evidence directory
`test-results/maze-start-service-sGHAth/`, not historical constructor artifacts.
Native gates and actual-service tests overlap on separate ports; raw elapsed
times are observational, not isolated latency benchmarks. Generated metering
will run as a separate cohort. No provider calls are involved.

Production smoke evidence is under `test-results/s6-d57884d/production-smoke/`:
1440x900, 390x844 touch and 844x390 touch. Native pixels are nonblank, canvas stays
below the header/in bounds, controls fit without horizontal overflow, M/I/T and
town return work, and a used portal remains zero. No page errors or external
requests occur. The owned temporary preview on 5484 was stopped after the run.

## Transport And Port-Fixture Follow-Up

The next native gate stopped at **53 PASS / 3 FAIL** in the 56-case base transport
suite. Two settlement cases used the old raw-occupancy quota setter, which
ignored retained private capacity and fixed-head accounting. The third retained
an obsolete 3,072-byte start assertion; production already enforces 3,584 bytes,
including the existing 512-character-objective boundary tests. The observed
3,077-byte request is inside that established contract, not a request to raise it.

[Transport quota repair](issue-11-transport-quota-fixture.md) records the original
two failures, zero-ordinary-headroom refusal, actual native rollback, funded
Stop/ACK and exact reload. Independent review also accepts the existing shared
start constant plus an explicit five-capability check; original request equality
remains. Production, objectives, manifests and all limits are unchanged.
Child repair `e0863e4` integrates as `cfd0e58`; parent payload correction is
`6dcbccc`. Parent full base transport **56/56 PASS** (1.6m), fixture types PASS,
with raw evidence at `test-results/s6-transport-repair/`. An initial implicit-any
callback type error was corrected before the passing check. Final compatible
source integration still must reconcile these fixture inputs explicitly.

The first full service attempt, `maze-start-service-sGHAth`, used overrides
5486/5487. Although the launcher supports those values, several older fixture
helpers/barriers still name 5258/5259. Chest paused-probe matching therefore
never fired; pending/recovery helpers opened the wrong socket. Error contexts
confirm the mismatched endpoints. These are fixture/configuration failures,
not qualification of those gameplay claims. After 17 finished cases (14 PASS /
3 FAIL), the coordinator explicitly interrupted the invalid attempt, retaining
its logs, traces, durable test storage and assembly/source provenance. It is not
a completed 54-case result. Only the verified owned process tree was terminated;
5486/5487 are released, and owner previews were untouched.

The isolated 24-case native transfer gate then passed (1.4m), releasing 5258.
Full service execution restarted with fresh storage/build on the supported
default 5258/5259; remaining native gates exclude that already-qualified config
to prevent a port collision. Its log is
`test-results/s6-2c67b31/actual-service-default.log`. Alternate-port portability
is a retained fixture limitation, not a new gameplay feature or acceptance claim.

## S5 Completion And Current Follow-Through

The parent combined generated cohort at `2c67b31` passes **7/7**, 18.7m, zero
retries/skips (`test-results/s6-2c67b31/generated-final/`). Both retained-depth
cases pass at 1/8/16, with room/connection paging metered at each depth. Both
separate 1,024-command histories pass, including original observation/receipt,
reload and zero-write exact replay. The room-return, read-only second-tab and
explicit takeover/adoption cases pass. History cases take 7.6m and 8.8m; these
are concurrent-machine observations, not isolated latency benchmarks. S5 is
complete only within its documented finite, separated proof scopes.

The first full default-port service run `maze-start-service-YN3jKT` finishes
**53 PASS / 1 FAIL**, 45.2m. The sole failure is the post-ACK pending/restart
claim under the old raw-occupancy quota helper. The
[service quota correction](issue-11-service-quota-fixture.md) passes all **15
selected actual-service cases** (7.6m) at `6f7aa50`, evidence
`test-results/maze-start-service-UNuhYX/` in the parent checkout. Its source,
assembly and SDK provenance are retained. The original failure remains failed.
A fresh full run on candidate `60c1346`, evidence
`test-results/maze-start-service-NUOwKR/` in the qualification checkout, is in
progress on default 5258/5259. All runs remain provider-free.

Further bounded fixture integration:

- [Funded cleanup](issue-11-funded-cleanup-quota-fixtures.md): original eleven
  cases reproduce setup failures, repaired eleven pass. Parent full custody
  **10/10 PASS** (17.8s). Parent full host initially has **16 PASS / 1 FAIL** due
  to a stale missing-grant error string; its exact current refusal is now
  asserted, with absent-effect and valid-grant controls intact. Full host rerun
  **17/17 PASS** (25.9s), `test-results/s6-game-host-final/`.
- [Decision ACK](issue-11-decision-ack-quota-fixture.md): original two post-ACK
  reload failures retained, corrected full child **51/51 PASS**. Shared-helper
  dependents are scheduled for final affected reruns, including controller,
  App recovery, pregrant and recovery discovery. A child pass alone is not the
  whole final integrated matrix.
- [Adoption refusal](issue-11-decision-adoption-fixture.md): original full gate
  **75 PASS / 5 FAIL**. Five mutations reach an earlier retained-operation guard
  than the obsolete expected successor error. Exact updated refusal, whole-DB
  equality, null claim and valid-adoption controls pass; full child **80/80 PASS**.
- Frontier exploration has **11 PASS / 1 FAIL** in its A/B comparison fixture:
  raw chunk commitments vary with original record identities, which its older
  derived comparison did not account for. A strict source-bound comparison
  correction is under review; the digest must not simply be omitted or ignored.

`test-results/s6-60c1346/source-compatibility.json` lists every changed fixture
input. All production source, manifest and lockfile bytes remain exact from
`5125cbe`; no runtime or budget repair is claimed here. Its frozen source map
has 1,689 tracked inputs. Unchanged evidence keeps its actual earlier identity;
affected native configurations rerun under this explicit candidate. No new
distinct cases or Cartesian matrix are added to the discovered 1,575.
