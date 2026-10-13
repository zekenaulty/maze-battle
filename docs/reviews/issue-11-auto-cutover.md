# Issue 11: Playable Auto Cutover

2026-10-13. Branch `codex/agentic-game-a1`. Issue #11 and the umbrella goal remain open.

## Delivered

The actual App now mounts canonical Auto. Each tick uses the same shared movement,
explicit chest/guild, roster and town commands as manual play. Policy progress
and the selected action share one transaction and immutable receipt. No old save
writer, provider call, hidden navigation map or whole-floor projection is used.
Auto's explicit guild-board policy can accept offers remotely; this is NOT an
Agentica disclosure grant and is not inherited by ordinary movement.

Objectives, up to 64 cached steps, learned parent/child waypoints and bounded
ancestry cursors survive reload. Routing consumes earned room memory. Manual
movement, clicks, commands, dialogs, Stop, custody loss and recovery halt local
scheduling. Manual commands also turn off the stored town-return Auto policy.
Reload, restored saves and takeover require a fresh Auto toggle; they do not
resume execution merely because an objective was retained.

Next-floor generation/qualification/content preparation shares the existing
game-owned preparation command, one bounded batch per Auto tick. Stop remains
usable between batches; existing committed geometry is retained through reload.
Only the exact own stairs receipt permits the scheduler to continue across a
floor change. Manual stairs recognize a partially prepared next floor and finish
it through the same preparer instead of attempting to load missing content.

Auto does not inherit loot from movement: an explicit `open-chest` is a separate
policy action. Hostile quests remain unaccepted/incomplete with combat disabled;
the policy stops `combat-required`, not a false floor-complete claim. Descent
proofs use explicitly constructed completed-floor fixtures, not invented kills.

The mobile toolbar now wraps by actual button size instead of assigning Portal
an icon-width grid slot. Desktop/mobile/tablet canvas screenshots and the active
mobile Auto toolbar were inspected; controls, status and canvas do not overlap.

## Evidence

All checks are provider-free with native Chromium IndexedDB. No paired-service,
live-provider, unlimited-history or full RPG feature-parity claim.

| Check | Result |
| --- | --- |
| Focused canonical/session/input/App/Auto unit suites | 422 passed, 27 files |
| Existing native canonical core/world/roster/content/knowledge suite | 177 passed (180-run also included 3 duplicate App Auto cases) |
| Native Auto policy/replay/care/descent/depth/four-seed suite | 11 passed |
| Actual App browser suite | 12 passed: manual/recovery regressions plus Auto interruption, reload, town care, batchwise descent, takeover and mobile controls |
| Full TypeScript and production build | Passed |
| Focused Auto/native TypeScript | Passed |

The native policy seeds 2/7/19/42 ran 267/614/622/610 ticks through 8-12 rooms,
up to 15x15, with mixed/direct/passage joins. A test-only authoritative audit
checks every reachable chest is opened and every nonkill quest is claimed before
the honest combat stop. That audit is not available to the planner. Large-room
earned coverage expands from 97 to 209 cells; unresolved frontiers reach zero.

Cached-step native samples:

| Retained floors | Reads | Writes | Logical read bytes | Logical write bytes |
| --- | ---: | ---: | ---: | ---: |
| 1 | 260 | 42 | 256,595 | 64,342 |
| 16 | 262 | 42 | 258,863 | 64,363 |

No other floor record is read or rewritten by that step. These are measured
logical IndexedDB request payloads, not physical disk writes, complete App-frame
costs or universal performance percentiles. The completed-floor fixture needs
18 additional preparation ticks, maximum 203 reads / 156 writes / 186,468 logical
written bytes per batch. Immutable evidence still grows under the enforced quota.

An initial mobile test sampled the head before the asynchronous Stop receipt
published and reported one extra revision. It now waits for the actual manual
mode publication before asserting stability; no production guard was relaxed.

Reports: `test-results/canonical-app/results.json`, `test-results/canonical/results.json`.
Auto uses the list reporter; its native run emitted the console seed/cost records
above, with artifacts under `test-results/canonical-auto`. These are single-run
observations, not benchmark percentiles.

## Remaining

- Canonical Agentica publication/action binding, retained destination execution,
  durable launch/park/wake/terminal/ACK and original-attempt reconnect. Work is
  isolated; the actual App still exposes the deliberate unavailable notice.
- Removal of all retired source stores, adapters, fixtures and obsolete databases.
- Final multi-controller/deep actual-App cost, recovery and qualification matrix.
- Arbitrary cyclic room graphs, more than four exits or rooms beyond the bounded
  room query are not claimed; unsupported coverage stops rather than guessing.
- Combat, encounters/waves, combat quests and paid-provider qualification remain
  outside this checked noncombat increment.
