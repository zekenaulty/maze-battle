# A2: Earned Frontier Approach

2026-10-12. First A2 implementation slice, based on `6b9ab2a` on
`codex/agentic-game-a1`. This is not whole-A2 or two-dungeon qualification.
No paid provider, user save or running user preview was used.

## Shared-Game Contract

- The ordinary game's Agentic Play dialog now offers an explicit Explore mode.
  Known-destination launches keep their five-tool manifest and completion rule.
  Exploration starts from the existing actor observation and memory, with no
  discovery prelude, hidden goal location or full-map preparation.
- `maze.frontiers` returns up to twelve current observed boundaries per page.
  Each entry has its observed anchor, direction and source. The neighbor must be
  absent from provenance-validated memory. Ordering is public row/column/cardinal
  order, not a concealed distance, reward or route ranking. It only point-reads
  bounded candidate neighbors; it does not scan the full remembered map.
- `maze.explore` selects one anchor/direction/source. Admission requires the
  current source, a genuinely unknown neighbor, and a nonzero known approach.
  It delegates that approach to the existing destination executor and receipted
  movement. Original selection, limits, elapsed deadline and usage persist in the
  existing travel record. No new database, world or inventory is introduced.
- Arrival produces a durable decision with fresh scoped observed cells, not
  governing-objective completion. It does not select another frontier, cross an
  unseen edge, trigger stairs or collect. The next intention requires another
  explicit tool selection. Source/revision/custody checks, Stop, original-result
  replay and explicit adoption remain on the existing paths.
- Current observation payloads now obey both a 32-cell and 60-KiB bound. A source
  review caught that legal long IDs could previously exceed the SDK's 64-KiB
  observation limit at a persisted frontier decision. Nearest cells, including
  the actor, are retained and truncation is truthful; source history is unchanged.

The selected-frontier approach is a deliberately bounded primitive, not an
implementation of the whole discovery policy. In particular, it does not yet
chain a forced corridor beyond the chosen anchor or detect a consequential
surprise partway through a long admitted approach. Those remain A2 work, not an
implicit permission to solve the rest of the dungeon. Radius-zero boundaries may
be inspected as facts but cannot admit a zero-movement exploration loop.

## Executed Evidence

| Check | Result and scope |
| --- | --- |
| Frontier query, parser, UI/controller and directed unit selection | 266 PASS in 12 files, including 33 frontier query cases and a dense-ID byte-bound regression. |
| Native Chromium/IndexedDB suite | 146 PASS, including six new cold-discovery cases. Existing destination, migrations, ownership, replay, deadline, command and archive cases remain green. |
| Expanded discovery selection | Six PASS again after extending both A/B cases through a second deliberate frontier intention and canonical child-run binding. |
| Existing real-service destination/recovery cohort | Ten PASS against the unchanged pinned Agentica `d65fb5b` fixture; these are regression checks, not new exploration qualification. |
| Actual App desktop/mobile selector | Two PASS; screenshots inspected. Explore selection hides target inputs, fits the dialog, and does not itself move or launch. Mobile is Pixel 7 emulation, not a physical phone. |
| Production build | PASS: TypeScript and Vite, 2,124 modules. Existing large-main-chunk warning remains (533.29 kB). |

The native A/B fixture uses the real GameSession, actual save/command/archive,
shared perception, SDK result validator and destination executor. Both start at
the same entrance with only three observed cells. An identical two-step frontier
approach reveals opposite junction obstruction evidence. A second explicit
selection from the newly returned frontier page approaches the junction and
reveals the ordinary chest. Neither approach opens it or changes inventory.
These are authored ordinary-game test layouts, not another game implementation.

The fixed-clock prefix comparison retains the raw contexts and compares initial
context, capability manifest, frontier query, first-step progress, observation,
usage and refreshed frontier query. Only scope/observation/snapshot/source IDs
are consistently aliased. Coordinates, timestamps, counters, limits, blocked
directions and unknown coverage are not removed. Pre-junction surfaces match;
legitimate junction observations then differ. This is a bounded prefix proof,
not Q's full UI/timing/work/corpus equivalence gate.

Other cases cover blocked, unearned, stale and zero-progress requests with no
world effect; admission replay; reload remaining paused until explicit adoption;
original selection/time/usage retained after adoption; and atomic rollback of
arrival, movement and receipt when decision persistence fails. No extra provider
activation is needed for local steps, but these native tests do not run an LLM or
a real service planner. Their child-run identities are explicit test fixtures.

Initial fixture failures were corrected, not counted as passes: the new test
incorrectly initialized the existing floor array as an object; a later test
included an undefined JSON argument that the SDK correctly rejected. An invalid
Testing Library option and capability-schema field were caught by TypeScript.
These corrections did not relax runtime validation.

## Reproduction And Remaining Gates

```powershell
node node_modules/vitest/vitest.mjs run src/components/agentic src/services/agentica/rpg src/persistence/rpgMemory/frontiers.test.ts src/services/agentica/directed --maxWorkers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/click-navigation.config.ts --grep 'Agentic exploration selection'
npm run build
```

Isolated origins are 5204 for native storage and 5203 for App layout. Browser
outbound requests are blocked and unexpected page errors fail the checks. Raw
prefix contexts are attached as `unnormalized-prefix-traces`; screenshots are
`exploration-dialog.png` in the desktop/mobile click-navigation result folders.

Follow-through: [real-service discovery handoff](a2-service-discovery.md) now
qualifies the frontier tools and deterministic planner with explicit
evidence-driven successor selection and restart/adoption. Bounded local
continuation/meaningful-observation policy remains next. Recheck generated-room scale and
human fog/tool parity at this discovery boundary. Then implement A3's explicit
ordinary quest collection/return and Q's full evidence/recovery matrix. Old
known-destination service regressions are a separate cohort, not exploration
qualification. Live competence still needs separately authorized provider limits.
