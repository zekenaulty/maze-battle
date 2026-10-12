# A3: Shared Quest Retrieval and Durable Interaction

2026-10-12. Checked runtime implementation: `3b54d9b`, on `codex/agentic-game-a1`.
Final full-suite qualification includes test-only cost repair `f28a157`.
Includes shared collectibles `240efce`, normalization preservation `021ce37`,
quest selection `7c12a07` and selection recovery `1582dfe`.
Status: bounded A3 retrieval/effect/recovery PASS. Whole A2/Q and the umbrella
goal remain incomplete. This is provider-free protocol evidence, not model competence.

## Shared Game Behavior

- New ordinary Guild fetch contracts can require a physical quest collectible.
  The accepted quest supplies the item specification; opening an eligible chest
  in its target room awards it alongside normal rolled loot. Unaccepted quests
  create no collectible. Old fetch tasks without an item retain their meaning.
- Manual, Auto and Agentic Play use the existing chest/loot/quest rules. Domain
  tests compare Manual and Auto awards under equal rolls; native Agentica tests
  commit through the ordinary game-command transaction and actual IndexedDB save.
  There is no second quest, inventory or world store.
- Quest items are protected from sale, automatic junk sale, consumption and
  equipment. Stash ownership counts for ordinary quest progress; this retrieval
  objective specifically requires the item in the pack when returning.
- Navigation never opens a chest, accepts a quest or claims its reward. An
  ordinary completed quest remains unpaid until a separately authorized claim.
  Mandatory movement rules remain in the existing movement command.
- New item specifications, existing quest status/timestamps, pack/stash items and
  chest award history survive normalization without replaying automation. A
  malformed present specification is rejected, not silently downgraded to a
  legacy opened-chest task.

## Agentica Boundary

The actual game's Agentic Play dialog adds an accepted single-item fetch quest
selector. Its return location is the already-observed floor entrance. The
existing known-destination and exploration catalogs remain unchanged.

Retrieval binds two additional tools:

| Tool | Authority and evidence |
| --- | --- |
| `maze.open-chest({ chestId })` | Deliberate interaction with an observed unopened chest at the actor's current cell. Evidence eligibility precedes authoritative world lookup. Remote, guessed and nonexistent IDs receive the same refusal. |
| `quest.status({})` | Own accepted objective, carried count and known return location. It does not disclose private quest IDs, target rooms, hidden chest locations or solved routes. |

The private binding retains the selected quest identity and expected item. The
public projection never reads target-room fields, hidden topology or world chest
lists; getter-trap tests enforce those boundaries. Completion requires all three:
the matching physical item in the actual pack, ordinary completed quest progress,
and the party at the bound known entrance. Arrival alone cannot finish retrieval.

The chest action commits its ordinary command receipt, loot, quest progress,
observation source, SDK result, operation link, decision event and launch pointer
in one transaction. Its retained operation is an **interaction decision**, not a
fabricated travel operation. A crash before return travel admission can therefore
reconcile the original result and explicitly adopt or stop that decision.
Duplicate delivery returns the exact original receipt, even after reload,
takeover or deadline expiry; a different action against the opened chest refuses.

An explicit pre-admission `connection.busy` reply retries the same persisted
decision after backoff. A new-owner adoption retains its identity across that
retry. Pause/Stop revoke the in-memory retry authority. Unknown delivery errors
are not converted into automatic replacement attempts.

## Paired Evidence

Both authored A/B scenarios run through real GameSession movement, source
observations, durable memory, actual loot/quests and the pinned .NET service.
The fixture provider reads only delivered public context. It has no variant,
seed or private target lookup, and caps each retrieval at twelve responses.

| Measured property | A | B |
| --- | --- | --- |
| Initially disclosed cells | 3 | 3 |
| Deterministic planner responses | 7 | 7 |
| Local game movement steps | 22 | 22 |
| Junction continuation selected from evidence | East | North |
| Maximum serialized public-context bytes | 2,920 | 2,913 |
| Real collectible / return completion | PASS | PASS |

The seven selected tools are `frontiers`, `explore`, `frontiers`, `explore`,
`navigate`, `open-chest`, `navigate`. These are two queries and five explicit
action selections, not seven claims of live-model reasoning. Routine corridor
and return steps run locally. Context byte figures measure the captured public
context object, not the entire provider request, tokens or total storage work.

The six retrieval service cases cover A/B completion; reload after collection
with return travel already admitted; crash before return admission; the same
crash with a lost chest effect reply and injected busy adoption refusal; and
Stop after collection through browser/service restart. Stop retains the item
and historical decision, makes no return move, and authorizes no further plan.
The busy fault is a test-injected protocol refusal; its successful retry is
then handled by the real service with the original adoption and observation.

## Verification and Identity

Agentica: `d65fb5b7a5d4895921f8854054215b1d6279852e`.
Unchanged bundled SDK SHA-256:
`64ab0860aad5d09f18c253f304782096793372296c87626be5d7daa558c22d26`.
Authored corpus: `corridorDungeon(A|B)` plus ordinary accepted fetch/chest state,
not a generated-room scaling proof. Native browser port 5204; paired browser
5212; isolated service/provider 5092/5093. No paid models, credentials, merge,
deployment, user saves or port-5190 preview changes.

| Check | Observed result |
| --- | --- |
| Focused shared domain, normalization, UI and agent boundary | 322 tests / 17 files PASS |
| Deterministic discovery/retrieval fixture guards | 9 Node tests PASS |
| Native Chromium/IndexedDB aggregate | 183 PASS, including 20 retrieval cases and prior command/memory/travel/custody regressions |
| Real-service paired aggregate | 22 PASS: 6 retrieval, 3 corridor, 3 discovery and 10 known-destination/recovery |
| Final dialog styling | 2 additional desktop/mobile viewport checks PASS; both screenshots inspected |
| Production build / TypeScript | PASS; 2,130 modules. Existing large-main-chunk warning remains. |
| Independent source review | Initial crash-window defect repaired; follow-up found no additional concrete defect. |
| Final full unit aggregate | **PASS: 2,563 tests / 160 files**, 240.79s, including the repaired audit. Level-1000 case: 46.971s. |
| Initial full unit aggregate | **FAIL: 2,561 PASS / 1 timeout**. The unchanged `spaces-v2` level-1000 adversarial audit exceeded its 60-second limit. |
| Pre-repair isolated audit | **FAIL: 6 PASS / 1 timeout**. All 64 seeds produced 2,006 rooms with no spatial-limit failures, but the level-1000 case took 72.445s. |

The browser aggregates have no skips or flaky retries. Earlier failures are not
erased: initial normalization dropped the new item specification; review exposed
the unretained post-chest crash window; a real service busy race required bounded
retry; three added assertions initially rejected .NET's optional-null and UTC
serialization. The final wire assertions use the existing narrow typed-field
allowlist, preserving observation data, identities, revisions and old evidence.

The audit timeout was traced to assertion-framework bookkeeping, not changed
generation. The agent's matched profile at level 1000 measured 1,026,560 hot-loop
predicates over 128,320 expansions: 61.544s before versus 41.606s after using
native strict assertions in that loop (32.4% lower test duration). The patch
preserves all 64 seeds, every predicate, final audits and the 60-second ceiling;
a new boundary test checks numeric typing, equality, overflow and NaN behavior.
Production `spaces-v2` code is untouched. This is a faster verifier, **not a game
generation performance improvement**. The final integrated full-suite run above
confirms the timing gate now passes without deleting the earlier failures.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=1 src/domain/quests src/domain/guild/contracts.test.ts src/domain/gameFactory.questItems.test.ts src/domain/gameFactory.preservation.test.ts src/domain/items/inventoryConservation.test.ts src/services/agentica/rpg src/services/agentica/directed/wire.test.ts src/components/agentic
node --test scripts/rpg-discovery-provider.node-spec.mjs scripts/rpg-quest-provider.node-spec.mjs
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
$env:AGENTICA_FIXTURE_SOURCE='C:\Users\Zythis\.codex\worktrees\maze-operation-stop\Agentica'
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-agentica-paired.config.ts
npm run build
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=test-results/a3-unit-final-results.json
```

Raw evidence is retained locally in ignored `test-results/rpg-commands/results.json`,
`test-results/rpg-paired-report.json`, `test-results/a3-ui-final`,
`test-results/a3-unit-results.json`, `test-results/a3-adversarial-isolated-results.json`
and `test-results/a3-unit-final-results.json`.
Paired attachments preserve contexts, selected arguments, original/recovered
events, complete checkpoints, service entries and environment/network audits.

## Remaining Goal Gates

Room-level exploration and shared human-fog/tool perception parity remain.
Q still needs its complete fixed-action, pre-disclosure information matrix across
UI/tool/memory/progress surfaces, generated-layout retrieval, and growing-world
read/work measurements. The authored successful corpus does not establish those.
Live A/B model competence is NOT RUN and requires separately confirmed limits
and authorization. Full inventory/town/combat parity remains a later goal.

Next bounded work, based on source inspection rather than a passing-corpus claim:

1. Human/tool perception parity. `createMazeViewModel` still supplies live world
   geometry and `drawMaze` uses it for explored-but-unseen walls/chests and room
   overlays. Move the displayed facts onto current observations plus retained
   evidence. Prove unseen mutations do not update either projection; do not
   substitute a fog overlay for a knowledge boundary.
2. Room-scoped exploration. `corridorExit` correctly yields at cell junctions,
   including ordinary open-room cells. Add a separately admitted room exploration
   policy using observed membership/frontiers, bounded local work and meaningful
   room exits. It must not consult authoritative room bounds, unseen targets or
   ideal routes to choose a destination.
3. Complete Q's cross-surface counterfactual matrix and generated/growing-world
   measurements. `observeRpg` currently scans room/chest associations while
   projecting nearby cells; measure and bound actual work, not just final JSON.
   Keep the seven-response authored example as regression evidence, not as a
   required response count or a substitute for the remaining gates.
