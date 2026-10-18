# Issue 11: Bounded Space Exploration

2026-10-18. Runtime candidate `fb1a59c`, actual-service fixture candidate
`0edbf0a`, on `codex/agentic-game-a1`. This extends the canonical game's earned
frontier approach. It is not completed A2/Q, full room coverage, quest collection,
or closure of issue #11. The umbrella goal remains active.

## Explicit Authority

- `maze.explore {frontier}` retains its exact approach-only behavior.
- `maze.explore {frontier, mode: "room"}` explicitly grants local exploration in
  the actor's current space, starting with the chosen source-qualified frontier.
  Another room's visible frontier is not eligible for this mode. An older
  approach-only capability grant cannot acquire room authority.
- Both modes use the same actual GameSession, canonical transaction host,
  publication/source validation, durable admission, custody confirmation and
  operation driver. There is no second game or inventory.
- The original target, direction, evidence, limits, start time and deadline remain
  retained. A new local waypoint never grants another step/time/replan budget.
  Service continuation and owner adoption remain explicit.

## Local Execution and Decisions

After approaching the original anchor, the executor can cross its selected edge
only once that edge is earned and remains inside the same space. It then chooses
the nearest reachable unresolved local boundary from earned cells, using stable
coordinate ties. Routine movement, sight updates, path refills and waypoint
changes do not ask the model to select cells. Hidden geometry is only a legality
veto; it never suggests a route or scores a frontier.

Coverage queries are 21x21 cells, not whole-floor scans or authoritative room
extents. Each chosen waypoint retains its exact query window across 16-step route
refills. A new window can be selected after reaching that waypoint. Backtracking
within that window is supported; this is not yet a whole-room coverage agenda.
`scope-exhausted` means no reachable unresolved boundary in that local window,
not that the room or floor is completely mapped. Remembered off-window branches
can still need an explicit destination/next scope.

Legitimate movement observations are compared with prior earned memory before
the new memory projection is written. New unopened chests/stairs, changed known
chests or traversability, and newly visible other spaces produce a material
decision. Merely reseeing a known space, ordinary new walls/floor cells and
unchanged facts remain quiet. A scope boundary stops travel without crossing to
another space automatically.

The decision retains the exact committed observation sequence/ID/index and any
previous source. Observation, checkpoint, navigation progress and decision event
commit atomically. The result says explicitly that it is not proof of room or
objective completion. It does not open chests, transfer inventory, accept quests,
select loot, start combat or wake a successor by itself.

Material comparison uses a bounded knowledge reader (256 logical reads / 1 MiB),
not world geometry or a history scan. Missing/inconsistent source evidence fails
closed; it does not become "unknown" or get repaired by fabricated sight.

## Independent Review Repair

Review found that recentering the query window during a long path refill could
oscillate between two positions with no new knowledge, or lose a reachable target
after the first 16 steps. The waypoint now stores its window. Independent static
graph regressions cover that cycle and a 32-step U-shaped route; validation also
rejects missing windows, wrong floors/dimensions and coordinate overflow. A final
read-only source review found no material blocker in this repair.

## Qualification

- Full unit suite at `0edbf0a`: **3,762 PASS, one existing optional probe SKIP**;
  `test-results/bounded-space-unit-final.json`.
- Focused navigation after the window repair: **37 PASS**, including independent
  path/executor review tests and malformed-window cases.
- Existing earned-frontier native suite: **33 PASS**, 46.96 seconds.
- New native exploration suite after the repair: **7 PASS**, 26.87 seconds.
  Two authored placements in production-generated 15x15 spaces (seeds 177/349)
  share an earned prefix, then stop at a new chest before the original anchor.
  Explicit subsequent choices use different earned directions. Other cases cover
  opened-chest continuation, a new stair, a space boundary, original step limits
  across reload, exact replay with zero writes, changed-body refusal and Stop.
- Existing known-destination native regression: **56 PASS**, 1.3 minutes, before
  the room-only retained-window repair.
- Production/service-fixture TypeScript checks and production build pass. The
  existing bundle-size warning remains (749.45 kB JavaScript, 228.86 kB gzip).
  Expanded native/service qualification is recorded below when it completes.

The native JSON reports for the frontier configurations are under
`tests/e2e/test-results/`; their `.last-run.json`/browser outputs are under the
root `test-results/`. No user database was reset and the 5198 preview was not
restarted.

### Actual App and Service

The first expanded provider-free service run `maze-start-service-XfpEbs` passed
the 30 existing cases and failed the new case before movement. The offline
fixture selected the first public frontier, which belonged to `socket-2:room`,
while the actor was in `entry`. Current-room authority correctly refused it;
the extra refinement was the service reacting to that refusal. This is not a
passing exploration proof. Fixture correction and rerun remain pending here.

Agentica is pinned to clean `27cb2ce9717438edfe19487e3920faa183112c97`. The fixture
uses alternate .NET 10.0.401 because repository-pinned 10.0.302 is unavailable.
No provider is invoked. Scripted offline planner decisions do not measure LLM
decision quality, production latency, billing or repository SDK-pin behavior.

## Remaining Boundaries

1. Qualify sustained local coverage, remembered off-window return, and explicit
   selection of another room without hidden-world guidance. The current mode
   stops at a material choice or scope boundary; it is not unbounded autoplay.
2. Expose explicit ordinary quest inspection/acceptance/collection using the same
   validated game commands and genuine interaction receipts. Navigation remains
   separate from interaction, followed by host-proven return.
3. Port Lumina's authored two-dungeon corpus to current generation/sight and run
   the complete depth/revisit/capacity/multicontroller matrix. These small native
   scenes and an actual-App service case are not the full Q corpus.
4. Keep any live-model gate separate, under confirmed provider limits and
   authorization. None is authorized by these provider-free checks.
