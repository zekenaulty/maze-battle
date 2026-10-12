# A1: Durable Actual-Game Travel

2026-10-11 local date. Branch `codex/agentic-game-a1`. Sparse route reader
`d3c0e53`, actual-game integration `6e035fc`, reviewed repairs `2d7f177`.
Status: provider-free internal host/session qualification PASS; A1 remains
partial until its Agentica protocol binding is qualified. The umbrella goal
remains active. No live-provider execution or separate game was introduced.

## Runtime Boundary

`routeRpgMemory` point-reads provenance-validated remembered cells. A shared
sync/async traversal implements the existing deterministic unit-cost search.
Both directions of an edge must be remembered open. There is no live geometry,
legacy fog or generated-layout fallback. Route work is bounded to 512 visits
and 256 steps; these are local planning bounds, not a new total-world cell cap.
Longer-range hierarchical planning remains later integration work.

`executeRpgTravel` stores an immutable target/grant and mutable execution progress
using the existing DestinationOperation functions. Admission, local steps,
explicit cancellation and adoption have exact original-attempt receipts. A
successful step joins the ordinary game command, authoritative save/control,
permitted observation, travel progress and travel receipt in one IndexedDB
transaction. The command transaction helper is shared with existing callers;
physics, inventory and quest rules were not reimplemented.

Schema v6 adds only travel metadata and action receipts to the real `maze-battle`
database. There is no second authoritative world/inventory store. v2-v5 native
upgrade checks preserve old saves; the existing source-history migration check
also retains source/control contents. Older application downgrades are not
claimed compatible with an upgraded origin.

GameSession exposes awaitable request/execute/reconcile/read operations, and
`runTravelWindow` performs routine local work without model calls. A default
window attempts up to sixteen steps (configurable 1-64), then reports the retained
checkpoint. It does not renew the original cumulative step/replan/time grant.
Travel grants retain the existing 64/4/120-second defaults and support larger or
null/unlimited policy ceilings. Technical command deadlines remain distinct.

Manual mutation changes the durable revision, preventing another old-controller
step. Reload/takeover requires deliberate adoption under current custody. Adoption
retains target, counters and original deadline; the executor accounts for its
subsequent replan. Explicit cancellation is terminal. Cancelling a local window
alone stops that batch and does not silently cancel or renew the intention.

Stored original receipts win after later movement, expiry or takeover. A missing
original can be settled without execution and can never execute on late delivery.
Changed input cannot reuse an attempt ID; a different attempt cannot replay an
already-consumed step sequence. Readiness, custody, cancellation and source
validation fail closed instead of searching hidden state.

## Actual-Game Proof

The GameSession native fixture first earns historical route evidence through
ordinary archived checkpoints, then returns to the entrance. Local execution
travels sixteen cells across three remembered room associations in windows of
five and eleven steps. Intermediate state is published by the real GameSession;
arrival leaves chest state and inventory unchanged and does not activate the
exit stairs. Encounters are explicitly disabled in this fixture, not removed
from normal game mechanics. This is a known-route host proof, not A2 exploration.

Other native checks cover reload plus explicit adoption, old-original replay
after takeover, manual mutation and cancel fences, settlement, empty/unlimited
grants, unknown destinations despite complete legacy fog, duplicate sequences,
corrupt records, and cancelled windows. An unseen fixture-only physical change
does not change remembered routing; the actual collision yields an observation,
then local replanning stops the stale route without repeatedly hitting the wall.

Failures injected into each of saves, control metadata, source observations,
game commands, travel records and travel receipts roll back all staged effects.
Deadline tests advance the clock both during the game-command write and during
the final travel-receipt write, including start/adoption technical boundaries.
No partial movement, receipt or progress remains after those aborts.

## Verification And Review

| Check | Result |
| --- | --- |
| Full Vitest at initial integration, before final review repairs | 2,215 tests / 147 files PASS; explicit two-worker run, 232.69s |
| Final command/archive/memory/travel native suite | 83 cases PASS, 48.5s |
| Existing gameplay/import/inventory/custody/native-scale suite before final repairs | 33 cases PASS, 1.5m |
| Final selected known-destination host regressions | 15 cases PASS, 34.5s |
| Final production build | TypeScript + Vite PASS, 2,100 modules |

The selected legacy command was `ns6-host.config.ts --grep
'destination|journey|navigate|arrival|adoption'`. It covers browser host admission,
replay/adoption, scoped memory and desktop/mobile travel, final-write deadlines
and no-loot arrival. It is not the full paired .NET/Lab suite and does not prove
new actual-game SDK integration. No test in this slice called a model provider.

An isolated reviewer reproduced two bugs: expiry during the last receipt write
could escape the earlier deadline check; and command extraction stopped
snapshotting input before its first await. `2d7f177` restores the early snapshot
and rechecks technical/cumulative deadlines after the final write. Five native
regressions reproduce these boundaries. Parent review also replaced a post-commit
game reread with the transaction's exact current snapshot, preventing telemetry
from attributing a later controller's changes to this step.

Initial failures are retained as evidence: the first travel pass had one
incorrect precedence result (unprepared memory obscured the adoption-required
refusal); a later cancellation test shadowed browser `window` in its fixture.
Both were corrected. The first full unit command lost the worker flag through
npm/PowerShell, giving 2,213 passes and two 60-second stress-test timeouts. The
direct `node node_modules/vitest/vitest.mjs run --maxWorkers=2` rerun passed all
2,215 without changing test timeouts or assertions.

Evidence is local under `test-results/rpg-commands`, `test-results/d1-regression`
and `test-results/ns6-host`. Tests/review used isolated ports 5204/5202/5183/5205;
the owner's 5190 origin was untouched. No physical mobile-device qualification.
Whole-save cost remains: the separate 128-room/16-floor case still writes about
19.5 MB per move, roughly 0.83-0.95 seconds here. Travel receipts also accumulate;
no infinite retention or compaction policy is claimed.

## Next Gate

Bind the existing Agentica admission/result/operation-event protocol to these
ordinary-game transactions and GameSession controls. Internal travel receipts
are not SDK receipts or objective-completion proofs. Status/adoption/cancel must
be surfaced by that controller; no new Agentic Play UI or live service binding
is claimed by this slice. Keep the original known-destination fixture as a
regression, not the new game implementation.

Then deliver A2 bounded earned-frontier selection and perception/context parity,
A3 explicit ordinary quest collection/return, and Q Lumina's two-dungeon
provider-free recovery corpus. A live-model gate remains separately authorized.
