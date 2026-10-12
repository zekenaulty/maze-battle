# A2: Explicit Corridor Continuation

2026-10-12. Integration branch `codex/agentic-game-a1`, based on `1613f37`
and the pure-policy commit `8086436`. Agentica remains at
`d65fb5b7a5d4895921f8854054215b1d6279852e`; no Agentica source or SDK changes.
SDK SHA-256: `64ab0860aad5d09f18c253f304782096793372296c87626be5d7daa558c22d26`.
This is an actual-game corridor vertical, not full A2/A3/Q completion.

## Authority And Execution

`maze.explore` accepts optional `continuation: "corridor-v1"`. Without it,
existing requests and saves retain their approach-only meaning. With it, the
same browser-owned operation may continue along a unique observed corridor,
including turns. The original selected frontier stays immutable; the current
destination becomes a one-cell local waypoint after the approach. This is
explicitly selected authority, not a default auto-loot/exploration policy.

Each movement still calls the ordinary game command within the existing atomic
save, observation, command, travel and outbound-event transaction. The policy
reads the new committed perception receipt and provenance-validated prior
memory. It does not inspect hidden geometry or rank unseen destinations.
The next edge must be reciprocal and present in that receipt. A chosen direction
can be followed at its original known anchor; subsequent forks require a choice.

The action yields before another movement for a newly observed junction,
new/changed/visibly missing chest or stair, or a directly contradicted passage.
It can yield during the approach, before reaching the original anchor. Routine
room-association changes alone do not wake the planner. A dead end, uncertain
next edge, revisited trail, or full trail also yields a checkpoint. No chest,
quest, stair, portal or town interaction is authorized by this policy.

All steps, replans, sequence, start time, deadline and limits belong to the
original operation. Local waypoints do not renew them. Null limits remain
supported, but do not remove storage/custody checks. The visited trail contains
at most 256 unique addresses; a 255-step cold corridor reaches that checkpoint
without overflow. An adoption that would consume its last slot is refused
without revoking game ownership or making a movement.

The same original action is checked against retained continuation permission and
frontier identity. Admission receipts cannot acquire or lose permission merely
by being resealed; the canonical witness detects consistency, not authentication
against a script with arbitrary browser-storage access. Existing known travel
must also retain its original navigation target.

## Paired Proof

The added A/B fixture starts at (6,0) with radius two, three observed cells,
no observed chest and encounters disabled. Both select the frontier at (6,2)
eastward. Five steps produce progress only. Step six reveals a genuine
three-way junction at (6,8): east/south/west in A, north/south/west in B.
The action yields at (6,6), not at the old anchor and not after entering the fork.

The real Agentica service receives a decision and makes a new query/choice pair.
The deterministic fixture chooses east in A and north in B from the public
frontier page. It receives no variant, recipe, hidden route or target coordinates.
Its explicit corridor opt-in is fixture configuration, not hidden navigation
information. There are four planner responses: two context requests and two
intentions, with no planner response during the six intervening local steps.
Tests explicitly cancel after the second admission; they do not invent completion.

Native tests additionally execute the second chosen action for three steps and
stop at chest discovery, with chest and inventory unchanged. Another chest placed
within early sight interrupts the first approach after one step. Successful
decision replay returns the exact original event/receipt without another move.
An injected decision-write quota failure rolls back movement, perception,
trail and receipts; the controller intentionally fences further work.

The restart test closes the browser and restarts the actual service after four
steps, already beyond the selected anchor. Recovery remains paused. Explicit
adoption retains the original action/trail/waypoint/grant, consumes one replan
on continuation, then delivers the fork decision through the new custody epoch.

The fixed-action comparison covers actor/cell facts, observed counts, truncation,
local waypoint, movement count, trail and notice across both variants. These
match through step five and diverge lawfully at step six. Original observations,
queries, admissions, events and travel records are retained in its attachment.
Nonsemantic run IDs and timestamps are excluded from this selected semantic
comparison, not erased from retained evidence. This is not Q's complete
UI/schema/recall/cost/timing comparison matrix.

## Review Repairs And Failed Runs

- A real 254-step journey followed by a manual move exposed adoption at exactly
  256 trail entries. Admission previously succeeded without room for the next
  checkpoint. The guard now refuses it, with a browser regression.
- Repeated cropped sightings could rediscover a junction because memory retained
  an older blocked edge. Structural notices now use the latest cell receipt's
  wall provenance without rewriting older navigation evidence.
- Complete current object lists now detect visible disappearance. Unobserved
  cells are not scanned for notices.
- Resealed inconsistent admission/journey records now fail original-authority
  checks before another movement. This is persisted-record integrity evidence,
  not a demonstrated service authentication bypass.
- The long-corridor fixture initially used an empty chest list, which ordinary
  save normalization populated. Its legitimate early chest discovery stopped
  the test. The corrected fixture places an ordinary chest beyond this test's
  traversal, rather than changing normalization or suppressing perception.
- A preliminary rollback test attempted to keep issuing commands after an
  injected storage failure had fenced its controller. Rollback and successful
  replay are now separate tests; no fence was weakened to satisfy the fixture.

## Verification

| Gate | Result |
| --- | --- |
| Focused policy, action validation, context projection | 173 unit tests PASS, including 45 pure policy tests. |
| Deterministic fixture selection and sequence guards | Five Node tests PASS. |
| Native Chromium/IndexedDB aggregate | 163 PASS, including 16 corridor cases and the existing command/memory/travel/controller regressions. |
| Actual-service paired aggregate | 16 PASS: three corridor, three original cold-discovery, ten known-destination/recovery cases. |
| TypeScript and production build | PASS, 2,126 modules; existing over-500-kB main-chunk warning remains. |
| Independent review | Four actionable consistency defects repaired with focused regressions; final wording correction covers visible disappearance. |

No skips or flaky retries in either browser aggregate. The prior 159-test run
also passed before the additional authority-integrity regressions; it is not
counted twice. Browser/service proofs are provider-free, not live competence.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=1 src/domain/agentic/explorationPolicy.test.ts src/services/agentica/rpg/validation.test.ts src/services/agentica/rpg/views.test.ts
node --test scripts/rpg-discovery-provider.node-spec.mjs
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
$env:AGENTICA_FIXTURE_SOURCE='C:\Users\Zythis\.codex\worktrees\maze-operation-stop\Agentica'
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-agentica-paired.config.ts
npm run build
```

Native browser origin 5204, paired browser 5212, service/provider 5092/5093.
Tests use isolated native IndexedDB, temporary service storage, and outbound
network guards. No paid provider, credentials, user saves or preview were used.
Evidence remains in ignored `test-results/rpg-commands/results.json` and
`test-results/rpg-paired-report.json`, with corridor proof/restart/capacity,
equivalence, environment and public-planner attachments. The final equivalence
rerun in `test-results/corridor-final-results.json` additionally retains the
complete observe action/result envelopes, not only their disclosed data fields.

## Still Required

This policy follows forced corridors, not a full room-level exploration behavior.
Open rooms contain many grid junctions; reducing repeated strategic decisions
there needs room/exit-scoped evidence rather than claiming every cell is a
meaningful room exit. Human fog/tool parity, generated-layout and growing-history
work measurements, and Q's complete fixed-action information matrix remain.
A3 still needs explicit ordinary quest collection, duplicate/recovery protection
and return under host-proven completion. Full RPG parity and combat remain later.
