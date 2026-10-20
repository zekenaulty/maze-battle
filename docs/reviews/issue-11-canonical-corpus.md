# Canonical Cold-Start A/B Composition

2026-10-20. Issue #11 remains open. Production increment `c7558e2`;
actual-App fixture `5ba9c970b1141f636a25b49bdde26e2329dc64c2`, followed by
test-only review hardening. Agentica is unchanged at
`27cb2ce9717438edfe19487e3920faa183112c97`.

## Delivered

The authored `canonical-survey-v1` A/B worlds now run through the actual App,
GameSession, canonical IndexedDB, ordinary quest/chest/inventory rules, mounted
Agentic Play controls and real Agentica service. There is no second game/store.
The [native baseline](../../tests/e2e/canonical-corpus.report.md) documents the
authored topology and genesis receipts; this report adds service composition.

Fresh initialization refuses an existing game. Normal game perception reveals
30 starting cells, not the obsolete three-cell test: 25 entry-room cells and
five passage cells, using unchanged radius seven. Setup accepts the ordinary
guild fetch offer at the entrance and leaves town without moving/exploring.
No survey item, discovery route or completed objective is seeded.

New explicit `maze.inspect { scope: "objects", cursor? }` reads only object-bearing
cells in the current committed sight. It neither refreshes perception nor scans
hidden world records. Each bounded page contains positions, observed chest/stair
facts and original source references; no contents, rewards or interaction tokens.
Queries require an explicitly permitting retained grant. Cursors bind the
publication/query; stale/foreign values refuse. Interaction still requires its
own current-cell target and explicit command. Initial context remains small.

The same offline `decision-corpus` planner runs in A and B. It queries the
objective, visible objects and earned frontiers as needed, copies returned
selectors/coordinates, explicitly interacts, then returns to the disclosed
entrance. It never reads variant, seed, oracle, ideal route or hidden target.
Its first-frontier policy is intentionally simple. This proves adaptation to
public affordances, not strategic fork reasoning or live model competence.

## Observed Trace

| Measure | A | B |
| --- | --- | --- |
| Initial visible cells / setup movement | 30 / 0 | 30 / 0 |
| First approach | East | East |
| Later selected frontier direction | East | North |
| Actual third approach destination | `socket-1:passage`, row 0, column 2 | Same named passage, row 0, column 0 |
| Local outbound steps | 28 | 24 |
| Explicit collection | One chest; one seal in pack, none in stash | Same |
| Local return steps | 24 | 24 |
| Tool choices / planner instances | 22 / 7 | 22 / 7 |
| Refinements / explicit Continues | 15 / 6 | 15 / 6 |
| Final local proof / service outcome | Satisfied / succeeded, complete | Same |
| Paid provider calls | 0 | 0 |

The second frontier direction differs while both approaches still end on the
same junction tile. The third approach actually traverses the different branch;
tests now check its disclosed selector and reached position, not direction alone.
Routine return executes locally without per-cell planner activation. A's longer
outbound route is retained evidence, not an optimal-pathing claim.

Completion requires the original selected quest, carried item and earned
entrance. Returning/checking changes no inventory, stash, quest or chest records.
Navigation does not collect. Explicit Stop and verified root recovery settle
funded local allocations with no extra planner choices or repeat item.

## Verification And Retained Evidence

| Check | Result / evidence |
| --- | --- |
| Full production unit regression | 4,423 PASS, zero failures, one existing optional SKIP; `test-results/corpus-full-unit.json` |
| Objects/authority focused units | 114 PASS; `test-results/corpus-objects-unit.json` |
| Native corpus units / browser | 7 / 4 PASS; parent browser rerun 23.5s, no retries/skips |
| First corrected actual-service A/B | 2 PASS; `test-results/maze-start-service-WZw1UX/` |
| Integrated actual-App/pinned-service cohort | 36 PASS, 536.39s, zero failures/skips/retries; `test-results/maze-start-service-yj7oBO/` |
| Review-hardened A/B rerun | 2 PASS, zero failures/skips/retries; `test-results/maze-start-service-Hh8hlu/` (2.9m) |
| Production and service-fixture typechecks / isolated build | PASS; existing bundle-size warning only |

The cohort stores exact requests, action results, observations, HTTP records,
ordinary-game oracle snapshots, source hashes, progress, counters and screenshots.
Oracles are test-only and are not planner inputs. Desktop and 390x844 dialog bounds
are checked. Configured start payload is 3,571 bytes within the existing 3,584-byte
limit; observation bound remains 2,800 bytes. No limit was raised.
Desktop A and mobile B screenshots from the hardened rerun were also inspected:
the status, objective, Stop and Recovery controls fit without overlap.

Independent objects review found no actionable issue; thirteen additional
probes covered paging, source integrity, grant refusal and input mutation.
Corpus review found three weak assertions: direction without branch arrival,
any outcome instead of succeeded/complete, and combined pack/stash custody.
The recorded runs met the stronger conditions; tests were tightened accordingly.

The first actual-service attempt (`maze-start-service-hyCNYD`) failed because
the shared fixture had initialized a default game before authored initialization.
The initializer correctly refused. A fixture-only `freshCorpus` option now skips
that earlier boot; no destructive fallback or compatibility path was added.

This uses the real pinned service but an offline planner and isolated cached
.NET SDK 10.0.401, not qualification of repository SDK pin 10.0.302. The owner
preview on 5198, its existing build and its browser data were not changed.

## Quota And Reload At Collection Boundaries

2026-10-20: fixture `ab099ee`, with history/adoption fixtures through `3e8a110`.
The parent seven-case focused cohort passes **7/7**, 299.48 seconds, zero
failures/skips/retries: `test-results/maze-start-service-2gbJUv/`. Four cases
cover A/B before and after explicit collection; three cover historical notice
retrieval after Continue, reload/adoption, and transferred navigation/adoption.
Production and service-fixture TypeScript checks pass. Production code is
unchanged by this increment; this is not a fresh full-unit or full-service run.

Each quota case traverses the ordinary cold-start journey to the unopened chest
or its just-applied collection decision. Audit-only world data checks the
reached location but never selects the route. The fixture saturates the logical
ordinary-work allowance by setting its ceiling to used bytes plus the existing
control reserve and outstanding operation reservations. Manual settings remain
excluded while Agentic Play owns control. On reload, takeover succeeds but
ordinary resume refuses at capacity, exposing the real failed-load recovery UI.

Explicit local Stop preserves the settled original. Root Stop is initially
pending at the service; the UI delivers and acknowledges the original parked
action before the second root Stop can acknowledge it. Exact original bindings,
terminal events, progress, admission IDs and both ACK source receipts are checked.
Both allocations are released and reserved bytes/count reach zero. The ceiling
and control reserve remain unchanged. Checkpoint, game/generation, world and
knowledge roots, inventory, stash, quest and chest state remain exact. Before
collection there is no seal; after collection exactly one is retained in the
pack. No new planner activity or WebSocket action is authorized by recovery.

Intermediate evidence is retained: `vqE1DA` expected a quota error from a
manual command that correctly refused Agentic control; `qAfq0G` incorrectly
expected Ready rather than failed-load recovery; `3ogagf` assumed immediate root
Stop completion rather than pending custody; `EGUVhj` passed both pre-collection
cases but used the navigation button label for interaction cleanup. The final
fixture follows the actual protocol and distinct UI labels. No runtime guards,
quotas, or test timeouts were weakened. Independent source review found no
remaining evidence gaps after exact-custody/quota/checkpoint assertions were added.

This proves settled decision-boundary recovery in the authored journeys. It
does not prove interruption during a step/effect, browser physical quota,
unbounded history, whole-session remote clearance, or the complete Q matrix.
SDK 10.0.401 remains alternate-pin evidence; paid calls are zero and the owner
preview/database remain untouched.

## Still Open

- Full fixed-action A/B UI/tool/memory/progress and storage-work comparison.
  The native baseline compares selected earned semantic projections through
  first lawful divergence; raw timing/read differences remain unqualified.
- Corpus-specific interruption, exact replay, takeover and storage-limit
  matrix. Existing service recovery regressions pass but do not substitute for
  all checkpoints of these longer journeys.
- Material-notice retrieval was not included in this corpus increment. The
  subsequent [decision-history query](issue-11-decision-history-query.md) now
  qualifies explicit same-owner retrieval separately; adoption/post-transfer
  variants now have composed proof in the focused cohort above. Renewed actor
  context does not silently become history. Arbitrary transfer ancestry and
  remote query replay remain unqualified.
- Sustained room coverage beyond this small corpus, generated-world retrieval,
  depth/revisit/storage-growth and multi-controller final qualification.
- Live model competence only under separately confirmed provider limits and
  authorization. Guild rewards, full RPG parity and combat remain later work.

## Reproduce

```powershell
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.unit.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
```

The service runner requires the exact clean Agentica pin above and records
runtime/fixture hashes. Use `--grep "cold-start survey"` for the two-case subset.
All runs use isolated browser contexts, not the owner's preview database.
