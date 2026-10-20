# Issue 11: Bounded Space Exploration

2026-10-18. Runtime candidate `fb1a59c`, final integrated proof candidate
`be5c68d`, on `codex/agentic-game-a1`. This extends the canonical game's earned
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

- Final full unit suite at `be5c68d`: **3,767 PASS, one existing optional probe
  SKIP**, 269.11 seconds; `test-results/bounded-space-unit-qualified.json`.
  The earlier runtime pass was 3,762 PASS before five fixture regression tests
  were added; its report remains `test-results/bounded-space-unit-final.json`.
- Focused navigation after the window repair: **37 PASS**, including independent
  path/executor review tests and malformed-window cases.
- Existing earned-frontier native suite: **33 PASS**, 46.96 seconds.
- Final native exploration suite after the repair: **12 PASS**, 38.91 seconds.
  Two authored placements in production-generated 15x15 spaces (seeds 177/349)
  share an earned prefix, then stop at a new chest before the original anchor.
  Explicit subsequent choices use different earned directions. Other cases cover
  opened-chest continuation, a new stair, a space boundary, original step limits
  across reload, exact replay with zero writes, changed-body refusal and Stop.
  The five added cases inject failures at observation, navigation and final head
  writes, proving complete rollback and one exact successful retry. Approach and
  survey takeover cases require explicit adoption, preserve the pending window
  and original scope/limits/deadline, and do not move on reload or adoption alone.
- Existing known-destination native regression: **56 PASS**, 1.3 minutes, before
  the room-only retained-window repair.
- Production/service/exploration-fixture TypeScript checks and production build pass. The
  existing bundle-size warning remains (749.45 kB JavaScript, 228.86 kB gzip).
  Actual-service qualification is recorded below.

The native JSON reports for the frontier configurations are under
`tests/e2e/test-results/`; their `.last-run.json`/browser outputs are under the
root `test-results/`. No user database was reset and the 5198 preview was not
restarted.

### Actual App and Service

The complete provider-free cohort passes **31/31**, zero retries/skips, at
`be5c68d`: `test-results/maze-start-service-9jpdUo/`. The focused new case also
passes separately in `maze-start-service-blCRff/` (14.0 seconds total).

The new actual-App case uses generator seed 5, otherwise the normal game
initialization, content and sight. The offline planner reads the public actor,
queries current-sight frontiers, and selects the first returned token matching
that actor's floor/space, unchanged. Its first-page foreign-room candidate is
deliberately not eligible. No hidden coordinates, seed or route reach the planner.

There are **two tool actions** (`maze.inspect`, `maze.explore`) and **two planner
entries** (one initial plan, one query-driven refinement). Four ordinary local
moves earn a new other-space observation and stop before the selected anchor;
no planner call occurs during movement. The exact material notice matches the
committed source. Pack and world roots remain unchanged. Desktop/mobile screenshots
were inspected. Explicit Stop/recovery preserves the decision and its ordered
progress prefix, then exact child/root ACKs release local reserves. Session-wide
remote clearance remains UNKNOWN, not inferred from zero local allocations.

This service case proves a material stop during approach. Native cases separately
prove crossing the original anchor and local survey. It does not prove sustained
multi-room exploration, a model revising its intention, or the full Q corpus.

### Intermediate Failures

The first expanded provider-free service run `maze-start-service-XfpEbs` passed
the 30 existing cases and failed the new case before movement. The offline
fixture selected the first public frontier, which belonged to `socket-2:room`,
while the actor was in `entry`. Current-room authority correctly refused it;
the extra refinement was the service reacting to that refusal. In `r7XvkB`, the
corrected planner refused before issuing exploration: the shared fixture had
already initialized seed 2 before the room-only URL flag selected seed 5. A
test-only pre-boot option now supplies that flag before initialization; the other
30 cases retain their original seed/setup. Both failed runs are retained, and
neither runtime authority nor assertion was loosened to make them pass.

The first affected unit run had four stale fixtures/golden expectations after the
contract change; these were corrected, not accommodated by runtime fallbacks.
The expanded schema briefly exceeded the unchanged 3072-byte launch bound for one
profile. Compact descriptions restore 3025/3028/3051-byte representative maxima;
escaped/multibyte objectives still fail if they exceed the bound. No quota or
message bound was raised.

Agentica is pinned to clean `27cb2ce9717438edfe19487e3920faa183112c97`. The fixture
uses alternate .NET 10.0.401 because repository-pinned 10.0.302 is unavailable.
No provider is invoked. Scripted offline planner decisions do not measure LLM
decision quality, production latency, billing or repository SDK-pin behavior.

## Long-Route Prefix Repair

2026-10-20 increment: runtime `eb680f3`, integrated candidate `316212d`.
The known-route reader could find a complete bounded path but return only its
first 64 steps with `complete: false`. Local exploration incorrectly treated
that flag as unreachable, both when ranking survey candidates and refilling a
retained waypoint. It described the returned prefix, not graph reachability.

Candidate ranking now asks for the full path inside the unchanged 512-cell
earned region; retained execution still stores at most 16 steps. Refill accepts
a non-null reachable prefix without requiring the returned prefix to reach the
destination. Query windows, original step/replan/time allowances and source
validation are unchanged. No authoritative world lookup or new grant is used.

Nine focused regressions include a reachable 89-step detour, true nearest-target
ranking, repeated 16-step refills without oscillation, serialized knowledge and
progress, original step/time/replan limits, and unavailable/corrupt evidence.
Independent review additionally checked the 512-cell bound, excluded-window
targets and foreign-room detours. The fail-before run retained six failures and
three passes; the focused after run passed nine, with 86 affected unit cases
passing in the authoring checkout.

Parent full units: **4,485 PASS, one existing optional SKIP**, 160.98 seconds;
`test-results/closing-prefix-unit-fixed.json`. The preceding full run had 4,482
passing tests but failed to import the room-boot suite: its service mock omitted
the newly imported `browserOrigin`. The one-line fixture repair passed its three
cases and the full rerun; the failed report is retained as
`test-results/closing-prefix-unit.json`. Production/service-fixture types and
isolated production build pass; the existing 805.41 kB bundle warning remains.

This 89-step proof is unit-level, not a native generated-room journey. The unit
graph has selective internal edges that the current stone-room recipe cannot
simply copy. A native proof must earn a later long survey route through ordinary
movement/sight; injecting a distant initial frontier, fabricated knowledge or
edited retained progress is not equivalent. A bounded 128-seed search examined
1,024 generated rooms and 120,208 finite trajectories; no >64-step selected
survey route was found, which is not an impossibility proof. The maximum
selected route was 22 steps after 136 ordinary command-handler moves; six
in-memory canonical cross-checks passed. This is not native admission/reload
qualification, and the search does not change the unit proof's evidence level.

At runtime `eb680f3` / integrated candidate `316212d`, native Chrome/IndexedDB
regressions pass: **33 frontier**, **12 local exploration** and **56 known-route**
cases, zero skips/retries/failures. The first two JSON reports are under
`tests/e2e/test-results/canonical-frontier/` (61.08s) and
`tests/e2e/test-results/canonical-frontier-exploration/` (46.00s); the known-route
configuration completed in about 1.5 minutes. These retain their prior bounded
geometries, not a native 89-step claim.

The expanded service run `maze-start-service-mFo6ob/` completed **42 PASS / one
FAIL** (1,059.63s). Its post-transfer history test asserted five results within
five seconds before waiting for the existing 30-second terminal decision. The
fourth applied result arrived about 3ms after the assertion failed; service
planning progressed into navigation, then teardown stopped observation. Trace
review found no runtime error or recovery-required state. This is not evidence
that the unobserved remainder completed.

Fixture-only `751f051` waits for that existing terminal boundary first, then
requires exactly five results and all original custody/source checks. The three
history modes pass in `maze-start-service-AsasYp/`; no timeout, authority or
result assertion was relaxed. The complete post-repair cohort at `16279ff`
passes **43/43**, 1,065.74 seconds, no failures/skips/retries:
`test-results/maze-start-service-q79iK8/`. Source/fixture/assembly hashes are
retained in its provenance and browser attachments. The earlier failed
aggregate remains unchanged. Agentica stays at clean `27cb2ce`, with isolated
SDK 10.0.401 rather than repository pin 10.0.302; paid calls remain zero.

## Remaining Boundaries

1. Qualify sustained local coverage, remembered off-window return, and explicit
   selection of another room without hidden-world guidance. The current mode
   stops at a material choice or scope boundary; it is not unbounded autoplay.
2. Accepted-quest inspection, explicit collection and host-proven return now
   have [canonical composed evidence](issue-11-canonical-corpus.md); these are no
   longer missing primitives. Autonomous guild acceptance/reward tooling remains
   later RPG work. Navigation still never authorizes collection.
3. The authored two-dungeon corpus is now ported to current generation/sight,
   with selected settled-boundary capacity recovery. Its full information and
   active-work recovery gates remain; newer bounded revisit/history I/O proofs
   do not establish arbitrary depth or history.
4. Keep any live-model gate separate, under confirmed provider limits and
   authorization. None is authorized by these provider-free checks.
