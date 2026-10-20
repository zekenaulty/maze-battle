# Explicit Quest Return Completion

2026-10-20. Issue #11 and the umbrella goal remain open. This increment mounts
the owner-bound return objective in the actual App and proves collection followed
by a nonzero earned return through the pinned local Agentica service. It is not
the unknown-start two-dungeon corpus or live-model competence.

## Implemented Boundary

The optional **Return quest** selector offers already accepted, floor-one,
single-item fetch quests. `None` preserves the existing free-text launch. The
owner's explicit choice is bound in the original canonical publication; it is
not inferred from the objective prose or chosen by Auto.

`maze.inspect { scope: "objective" }` returns the selected quest's public title,
item name, current carried count, quest status, and earned return address. It
does not expose internal quest/item IDs, target geometry, undiscovered chests,
or a world-wide quest list. The initial actor context is unchanged.

The game emits the existing Agentica completion contract only when:

- The originally selected quest definition still matches.
- Exactly one canonical quest collectible belongs to the pack, not the stash.
- The ordinary quest is complete or claimed.
- The actor is in manual mode at the exact bound entrance, with a current earned
  observation showing its town stair.

No reward is claimed and no item is consumed by this check. Quest progress,
inventory admission, navigation arrival, and objective completion remain distinct.
An unbound free-text launch receives an explicit refusal, not an invented
success predicate.

The proof is private data in the existing immutable action result. Its root
publication, admission receipt, original action grant, game identity, quest/item
custody and arrival observation are retained together. Fresh writes require a
proof prepared against the same action and canonical state; unrelated actions
cannot attach completion. Historical replay validates retained evidence without
reading today's inventory, quest state, sight or live grant.

Local satisfaction seals fresh action admission/execution without closing the
socket needed to deliver the original result. Verified result persistence and
historical replay remain available. Successor completion waits for the prior
operation's handoff ACK. Stop/recovery remain separate from satisfaction and
retain their funded cleanup authority. A generic service outcome is not called
a success acknowledgement; failed or uncertain delivery is reported separately
from the valid local completion proof.

The bounded helper reuses canonical records and witnessed reads. There is no new
mission database, compatibility path, or alternate inventory. Existing five-tool,
3,584-byte start, 2,800-byte observation and 4,096-byte result limits are unchanged.
The inspect descriptor grows by 28 bytes. A 512-character ASCII objective measures
3,519 bytes with the default fixture and 3,545 with the tested configured-provider
profile. Unsupported oversized starts still refuse.

The native fixture's pending check uses eight world point reads and one
single-row scan; its satisfied check uses eight point reads, two single-row
scans and 16 knowledge reads plus one witness. Historical replay uses nine
execution reads, seven source receipts and five saved snapshots, with zero world
or knowledge reads. These are instrumented logical API operations, not raw
IndexedDB page counts or physical disk writes. The satisfied wire result in that
fixture is 1,075 UTF-8 bytes.

## Actual-Service Trajectory

The `decision-return` offline planner runs against actual App-owned GameSession
commands and native IndexedDB, with clean Agentica `27cb2ce`. It receives only
public host observations, never the fixture's world oracle.

1. Ordinary setup accepts a guild fetch quest and takes 29 manual moves through
   earned knowledge to its unopened chest. This is explicitly a known-return
   fixture, not a cold-start exploration proof.
2. The owner selects that quest and starts. The planner inspects its current cell
   and explicitly interacts with the disclosed chest selector.
3. After explicit Continue, it inspects the objective. The pending result reports
   one carried item and the earned entrance. The planner selects that address.
4. The game executes nine local return moves without a planner activation.
   Arrival remains a decision, not completion.
5. After another explicit Continue, an objective inspection supplies the
   game-owned completion predicate. Agentica reports `succeeded / complete`.
6. Local Stop and explicit root recovery release the funded reservation. They do
   not grant a second item, claim a reward, or activate another planner.

Measured choices: five tool actions, three create-plan calls, two refinements,
three windows and two explicit continuations. The two earlier service outcomes
are `partiallyComplete / partial`. Pack, stash, quest and chest records remain
unchanged during return and completion checking. Private proof data stays off
the wire. Desktop and 390x844 mobile screenshots are retained.

These are provider-free contract/execution results. No paid provider is installed
in the fixture; the zero-call claim is by construction, not billing telemetry.
The isolated build uses cached .NET SDK 10.0.401, not repository pin 10.0.302.

## Qualification

Final runtime: `b91101382faf4a1ba4e9c86a57739dce5b6cdf56`.

- **Actual browser and service:** all 34 cases pass at the final runtime in
  `test-results/maze-start-service-5Rni6M/results.json`, 359.45 seconds, with no
  skips, retries, flaky cases or failures. The selected return case passes in
  27.2 seconds. The service is clean Agentica
  `27cb2ce9717438edfe19487e3920faa183112c97`.
- **Full unit regression:** 4,399 pass, zero fail, one existing optional pinned
  assembly-check skip at `7758134`, before the final completion callback repair:
  `test-results/return-completion-full-final.json`.
- **Final completion/play regression:** all 319 tests pass at `b911013`, including
  retained completion, predecessor ACK ordering, notification deduplication,
  disconnect-before-reply and Stop/takeover:
  `test-results/return-play-final.json`. This is a focused follow-up, not a claim
  that the entire unit suite was rerun after the final repair.
- **Static/build:** production TypeScript and the Vite build pass at `b911013`.
  The candidate is in `test-results/return-completion-build-b911013/`.
  JavaScript is 794.56 kB (241.75 kB gzip); the existing over-500-kB chunk warning
  remains. The service/native fixture type checks also pass.
- **Independent review:** the final source-only review found no actionable
  findings after the completion callback and delivery uncertainty repairs.
  It did not itself execute tests.
- **Visual checks:** final desktop and 390x844 screenshots were inspected.
  The completion dialog and controls fit both viewports. The owner's running
  preview and browser data were not reloaded, reset or advanced by these tests;
  its previously built runtime remains unchanged.

The first focused actual-service case passed at `06946e9` plus the fixture
registration correction: `test-results/maze-start-service-o1zoyu/`, 36.5 seconds.
The integrated 13-case native objective suite passes in
`test-results/canonical-objective-check/results.json` (66.32 seconds); the
17-case native root-binding regression passes in
`test-results/canonical-return-objective/results.json` (37.33 seconds).
Both use native Chrome and fresh IndexedDB with zero skips/retries/failures,
without the isolated worktree's dependency override. The native fixture uses
typed offline service announcements; it does not claim real-service custody.
The complete 34-case actual-service cohort passes at runtime `7445add` in
`test-results/maze-start-service-AyDsha/` (381.73 seconds, zero skips/retries).
That earlier run is superseded by the final runtime run above.

Reproduction commands (from the Maze checkout):

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/vitest/vitest.mjs run src/services/agentica/game/play --maxWorkers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-objective-check.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-return-objective.config.ts
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
```

Intermediate failures are retained rather than counted as passes:

- `maze-start-service-lIuYEK`: the new test was absent from the explicit test
  matcher. The service built successfully, but no test ran.
- Initial unit pass: 1,245 passed and five expected byte/hash snapshots failed.
  Measured values were updated; no payload limit was increased.
- The expanded actual-service fixture reached successful completion and passed
  mobile bounds, then raced root Recovery against unfinished local Stop.
  It now waits for the actual `stopped` state, matching existing cleanup tests.
- Independent review found that a locally satisfied controller still admitted
  fresh actions, and that an arbitrary outcome was described as acknowledgement.
  Further review covered retained-completion notification/ACK ordering and
  disconnect-before-reply uncertainty. Runtime fixes and SDK regressions retain
  these boundaries.
- The objective query reused caller-owned identity after an await. Its enabled
  mutation regression failed before adding an entry snapshot; all 29 focused
  evidence tests then passed.
- A broad unit run reported 4,317 passes, 36 failures and one optional skip.
  All failures came from three App test doubles lacking the existing session
  `view` contract. Adding that view also made one recovery-only fixture eligible
  for unrelated adoption inspection; its already separately tested adoption
  boundary is now explicitly stubbed. All 36 affected tests pass.

## Remaining Work

Compose the checked frontier/material-observation and retrieve-return operations
into the canonical cold-start A/B corpus. Prove an evidence-driven change of
intention, fixed-action hidden-world equivalence, and the selected interruption,
replay, takeover and capacity matrix on that same shared game. Re-run final
depth/revisit/storage-growth gates; historical old-store proofs do not qualify
the replacement schema. Full RPG parity, guild reward tooling and combat remain
later work, not prerequisites invented for this minimal retrieve-return proof.

The live-model gate still requires separately confirmed provider limits and
authorization. Neither this fixture nor its counters establishes model decision
quality, internet latency, physical disk writes, or completion of issue #11.
