# Owner-Bound Quest Return

2026-10-20. Issue #11 remains open. This increment establishes the immutable
host objective and bounded evidence readers needed for the next return/completion
vertical. It does **not** yet expose an objective-inspection tool, mount an owner
quest picker, emit completion, claim a guild reward, or qualify the two-dungeon
corpus. Free-text launches retain their existing behavior.

## Implemented Boundary

An explicit `prepareGameLaunch(..., { returnQuestId })` binds one already accepted,
floor-one, single-item fetch quest to the original launch/objective identity.
The initial canonical publication contains:

- The selected quest's stable ID, accepted timestamp, title, item specification
  and exact source record reference.
- A town entrance selected only from earned observation and remembered cells.
- The original launch and objective IDs.

The existing publication transaction retains the choice atomically, under its
normal source/snapshot witness. No new database, authoritative mission store,
compatibility reader or additional transaction writer exists. The selection is
private host data: the initial Agentica request and capability manifest do not
grow or disclose internal quest/room identifiers.

Admission and historical launch reads require matching launch/objective IDs.
Fresh grant checks return the original bound objective separately from the current
publication, including when checking a successor. Renewals and successor
selections cannot introduce a replacement typed objective. Ordinary publications
remain unchanged.

## Bounded Evidence

`readTownReturn` validates the actor's current earned observation. It prefers
one visible floor-one town stair; otherwise it point-reads observation sequence
one. It revalidates the selected cell against current remembered knowledge.
Missing, ambiguous or contradictory evidence refuses. It never reads floor
geometry, guesses coordinates, scans observation history, or grants sight.
Observation one without an earned town stair is an explicit unsupported case,
not permission to search hidden world records.

`readCarriedQuest` reads the selected accepted quest, its matching contract,
pack/stash headers and the canonical single collectible. It validates primary
records and both quest/ownership indexes. At most five world point reads and
two one-candidate scans are needed by this reader. A missing index cannot invent
zero stock; contradictory ownership or duplicate candidates fail closed.

The evidence distinguishes pack from stash. Ordinary `complete`/`claimed` quest
progress without the item yields no carried item. This reader alone proves neither
chest provenance, arrival, return travel nor completion. Its snapshot must be
pinned by the caller.

## Next Exact Boundary

1. Mount an explicit owner quest selection and an on-demand
   `maze.inspect { scope: "objective" }` projection through the existing game.
   Unbound free-text objectives must not acquire an inferred success predicate.
2. Revalidate the stable selected quest definition while allowing its legitimate
   progress record to advance. Compare carried item evidence with the exact
   bound entrance and current game-owned position/observation.
3. Retain source-bound objective-check evidence in the existing action result.
   Historical result replay must not consult current state or refresh unseen
   facts. Reject completion on unrelated actions or without the exact private
   source proof and original objective ID.
4. Emit the existing Agentica completion contract only when that predicate holds.
   Returning, collecting, completing a tool and releasing an operation reserve
   are not interchangeable. Do not auto-claim a guild reward or release unresolved
   root obligations.
5. Prove explicit collection followed by a nonzero earned return route in the
   actual App and pinned local Agentica service, including reload, replay,
   refusal and funded cleanup. A known-return-route case is not yet the unknown
   exploration/intention-revision or authored two-dungeon Q proof.

## Qualification

Runtime candidate `821f09a`; integrated source/test candidate `93c7617`. Subsequent
changes in this increment are tests and documentation only.

- PASS: **1,455 affected unit tests**, zero skips/failures, in
  `test-results/return-objective-focused-final.json`. Command:
  `npx vitest run src/persistence/canonical/agentica src/persistence/canonical/knowledge src/persistence/canonical/content src/services/agentica/game --maxWorkers=2 --reporter=json --outputFile=test-results/return-objective-focused-final.json`.
  This is a focused regression, not a new whole-repository test count.
- PASS: **17 new native binding cases** at integrated candidate `93c7617`,
  zero skips/retries/failures, 32.3 seconds, in
  `test-results/canonical-return-objective-integrated/results.json`. Command:
  `node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-return-objective.config.ts`,
  with `MAZE_RETURN_RUN=canonical-return-objective-integrated`. The fixture
  TypeScript check also passes without dependency overrides in the parent checkout.
- PASS: **33 existing actual-App/pinned-Agentica service cases**, zero
  skips/retries/failures, 341.56 seconds, in
  `test-results/maze-start-service-H6EirW/`. Command:
  `node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`.
  This preserves existing Start, Continue, adoption, navigation, interaction,
  journal and recovery behavior; it does not exercise a new typed return journey.
- PASS: production typecheck, service-fixture typecheck and Vite production
  build to `test-results/return-objective-build-821f09a/`, leaving `dist` intact.
  Existing bundle warning remains: 782.16 KB minified, 238.04 KB gzip.
- Independent source review found no additional defects in the corrected
  candidate and supplied 41 binding/admission/grant regressions. Its successor
  certificate is stubbed at the validated certificate boundary; native/source
  binding evidence is described separately below.

The [new native qualification](../../tests/e2e/canonical-return-objective.report.md)
uses actual GameSession guild/stair commands and canonical publication/launch
contracts, with generated quests and fresh native IndexedDB. Its offline service
announcement is a typed fixture, not an actual-service admission. The monitored
publication callback performs three world gets, 49 knowledge gets, three
knowledge witnesses, no scans and one publication write for a 99-cell initial
observation. World reads are restricted to the selected quest and contract, not
entrance geometry. These are logical API calls, not physical disk bytes.

The owner's `5198` preview was inspected without navigation or reset: the dungeon
canvas and Ready state render. It continues serving the prior checked build.

Intermediate evidence is retained:

- `return-objective-focused.json`: 1,402 affected tests passed before the final
  objective-selection tests.
- `return-objective-selection.json`: eight new policy tests initially failed on
  invalid fixture reference prefixes, before reaching the policy under test.
  Their references were corrected without weakening validation.
- Inspection of that failure also found a real initial implementation defect:
  the private **world quest** reference incorrectly used the **Agentica execution**
  reference validator. The codec now validates the exact quest namespace instead.
- `return-objective-selection-fixed.json`: 14 tests passed after those repairs.
- `return-objective-root-grant.json`: three root/successor separation and custody
  tests passed.
- The isolated native fixture first passed 15/16 cases; its combined renewal
  test attempted another fresh command after an intentional failure had correctly
  withdrawn GameSession control. Separate fresh contexts fixed the fixture
  sequencing; the runtime and refusal assertions were not weakened. The linked
  native report retains both runs.

The service remains pinned to clean Agentica `27cb2ce`; its explicitly isolated
SDK 10.0.401 is not repository-pin 10.0.302 qualification. No paid provider,
repository-SDK-pin or physical-disk-I/O claim is made. Issue #11 and the umbrella
goal remain open.
