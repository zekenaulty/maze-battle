# Native Agentica Interaction Evidence

Date: 2026-10-18. Branch: `codex/agentica-interaction-native`.
Runtime: `f0523b5ed0bbad89fe445d9a26f3bf7803bd1077`.
The isolated branch fast-forwarded from `4a9efef` through `d418186`, `d04667a`,
`76936fd`, and `f0523b5`. No runtime files were changed by this fixture lane.
All fixture changes are new `tests/e2e/canonical-agentica-interaction*` files.

## Integrated Requalification (2026-10-20)

Parent `codex/agentic-game-a1` at `2bb0315` passes all 17 cases again: 37.79s,
zero failures, retries or skips. Evidence:
`C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/test-results/canonical-agentica-interaction-final/results.json`.
The fixture typecheck passes without a dependency-root override in the parent.
The historical runs below belong to the isolated
`C:/Users/Zythis/.codex/worktrees/navigation-recovery-ui/maze-battle` worktree.
The [separate complete service cohort](../../docs/reviews/issue-11-agentica-chest-interaction.md)
now has actual-App interaction/Continue proof; this native fixture still uses
only its fake remote peer and does not establish that boundary by itself.

## Verified Boundary

Native browser persistence with actual `GameSession`, production action hooks,
interaction executor, operation driver, canonical content/quest mutations and SDK
event validation. The HTTP peer is explicitly fake and retains exact contiguous
operation events. It is not an Agentica service, provider, planner or restart proof.

Host-only setup uses the ordinary generator/content preparation, canonical default
game settings, an existing fetch-quest chest, explicit quest acceptance, placement
and look before publication. The simulated planner reads the public actor address,
calls `maze.inspect`, and passes only `cell.chests[].target` to `maze.interact`.
No token is built from host-only chest/quest identifiers.

The full five-capability start measured 2836 UTF-8 bytes in Run3, under the actual
3584-byte production bound. No manifest or budget override was used.

## Passing Coverage

- Inspection, action reservation and interaction admission preserve content,
  inventory, quests, position and sight; exact original action replay is read-only.
- Absent/reserved remote admission and unresolved/malformed custody replies do not
  release apply. Lost probe reply retries the exact probe after driver replacement.
- Actual apply opens one chest, adds exact loot quantities and one quest artifact,
  completes its preaccepted quest, leaves gold/position unchanged and advances sight
  once. Other content targets remain unchanged.
- Progress wire data is exactly actor/source plus
  `{kind:'open-chest',outcome:'applied',itemsReceived:3}` in the main Run3 case.
  No raw chest/loot IDs are sent in the progress event; the terminal has no
  objective-completion claim.
- Changed progress ACK is refused atomically; exact SDK-accepted event is retained.
- The driver applies, settles and returns decision-required without cognition.
  Stop drains exact progress sequence 2, then decision sequence 3 via stop-decision.
  The child is acknowledged; the cancelled root remains settled with one reservation.
  This is deliberately not full root/session clearance.
- Lost progress or terminal reply followed by full browser reload reconciles the
  retained original. No duplicate chest/quest effects, admission or event delivery.
- Stop before/after apply preserves exactly zero/one effects. Funded Stop/ACK also
  remains usable after malformed custody proof has disabled ordinary game control.
- No lifetime reservation, absent grant, foreign publication/source token, and new
  same-owner sight refuse without admitting a child or changing content.
- Two fresh applies at one fence yield one commit and one `stale owner or revision`.
  Fresh-fence retry refuses consumed interaction; exact original retry has zero writes.
- Throwing after the real progress callback appended its event rolls back the entire
  canonical dump, including loot, quest, sight, event, receipt and quota. Retrying
  that uncommitted request applies exactly once.

## Run History

| Run | Result | Duration | Failure and Correction |
| --- | --- | --- | --- |
| Run1 | 0 PASS / 17 FAIL | 43.906 s | All failed before interaction assertions: reused content seed omitted game settings required by actual GameSession projection. Added canonical DEFAULT_SETTINGS through the existing content transaction helper, only in the new seed file. |
| Run2 | 11 PASS / 6 FAIL | 58.844 s | Five absent-child assertions expected null instead of the actual undefined. One malformed-ACK test incorrectly retried ordinary execution after fail-closed control loss. Corrected exact absence assertions and verified disabled control plus explicit Stop/terminal cleanup instead. |
| Run3 | 17 PASS / 0 FAIL | 48.577 s | Complete cohort; zero skipped, flaky or retried tests. |

Run3 began `2026-10-18T15:14:00.374Z`. Failures were not deleted or overwritten.
The JSON reporter originally resolved relative to the config directory; its path
was made absolute for Run3. Artifact paths relative to this worktree:

- Run1 JSON: `tests/e2e/test-results/canonical-agentica-interaction-run1/results.json`
- Run2 JSON: `tests/e2e/test-results/canonical-agentica-interaction-run2/results.json`
- Run3 JSON: `test-results/canonical-agentica-interaction-run3/results.json`
- Failed traces/context: `test-results/canonical-agentica-interaction-run1/` and
  `test-results/canonical-agentica-interaction-run2/`.
- Run3 JSON contains 17 named JSON evidence attachments, including
  `interaction-decision-stop-reload.json`, `same-fence-interaction-race.json`,
  `actual-event-hook-rollback.json`, and both `lost-reply-*-reload.json` attachments.

## Typecheck and Reproduction

Fixture typecheck PASS. Initial attempts found the isolated dependency junction
lacked `@noble/hashes` and overly broad Playwright arguments caused TS2589. Use the
existing parent dependency directory and narrow action/binding/operation arguments.
The first baseUrl invocation additionally required TypeScript 6's deprecation flag.
No dependencies were installed or shared node_modules changed.

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-agentica-interaction.tsconfig.json --baseUrl C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/node_modules --ignoreDeprecations 6.0
$env:MAZE_INTERACTION_DEPENDENCY_ROOT = 'C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle'
$env:MAZE_AGENTICA_INTERACTION_RUN = 'canonical-agentica-interaction-run3'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-agentica-interaction.config.ts
```

Use a fresh run name to preserve evidence. Strict port 5294 was checked before
execution and had no listener after Run3. No service/provider calls; all WebSocket
attempts and unhandled API/external requests fail the audit. Ports 5258/5259 and the
user preview/database were not used. Real service/provider qualification remains
outside this native result.
