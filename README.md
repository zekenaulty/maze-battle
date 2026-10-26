# Maze Battle

A browser dungeon crawler with procedural mazes, a three-hero party, automatic
combat and exploration, equipment, loot and guild quests. This branch is the
React/TypeScript and IndexedDB rewrite.

Current qualification build: manual noncombat play and Auto use one canonical
IndexedDB game. Combat/Waves remain disabled while issue
[#11](https://github.com/zekenaulty/maze-battle/issues/11) is completed. Agentic play
requires explicit host/provider configuration and user Start; without configuration
the panel exposes recovery only. All earlier
Maze Battle save formats are intentionally discarded, not migrated.

## Run and Verify

Agent setup lives in [AGENTS.md](AGENTS.md), with the repository-owned
[geometry/admission skill](.agents/skills/maze-world-geometry/SKILL.md) and
[cross-repo coordination protocol](docs/coordination/README.md). The shared spatial
contract is a proposal until both repository owners record agreement.

- `npm install` installs dependencies.
- `npm run dev` starts Vite; use the URL printed by the server.
- `npm run build` type-checks and builds production assets.
- `npm run test` runs unit tests.
- `npm run e2e` checks the actual
  desktop/mobile App, recovery, Auto and depth-local movement.
- Canonical persistence/Agentica cohorts have focused configurations under
  `tests/e2e`; run each with its own `--config`. These isolated fixtures are not
  mixed into the default actual-App run.

Explore with WASD or arrow keys; touch devices also have a directional pad.
Click an earned tile for bounded pathfinding. E interacts, M toggles the map,
I opens inventory and T consumes a town portal scroll. Auto explicitly selects
exploration, collection and town care; ordinary movement never opens chests.
Stop Auto returns control. Hostile objectives currently stop as combat-required.

## State and Execution Boundaries

- `src/domain`: game rules, generation, combat, inventory and quest transitions.
- `src/persistence`: browser-owned saves, custody and durable execution records.
- `src/services` and `src/hooks`: runtime coordination and React adapters.
- `src/components`: player-facing views and controls.

The actual game uses a single-writer owner/epoch/revision fence in IndexedDB.
Additional tabs are read-only until Take control. A mutation is shown as accepted
only after its fenced transaction commits; stale tabs cannot overwrite progress.
Compact heads reference independently persisted rooms, items, quests, earned
knowledge and immutable receipts. Named checkpoints retain page roots, not whole
dungeon copies, and never restore execution custody.

Back up browser data before clearing site storage.

All former `?expedition=` and `?agentica=1` routes mount this same game. No separate
Lab game is launched, and no model starts on page load. The canonical Agentica
binding is under qualification; host fixtures do not prove live-provider behavior.
The obsolete RPG, expedition and directed persistence writers are removed; the
remaining radix-tree helper is shared by the canonical store, not a second save system.
See the [current persistence plan](docs/canonical-persistence-plan.md),
[next-slice ledger](docs/agentic-play-next-slices.md) and
[retirement map](docs/reviews/issue-11-p4-retirement-map.md). Earlier architecture
and evidence documents describe historical builds unless explicitly updated.

## Preserved Original

The annotated `legacy-final` tag identifies the original vanilla JavaScript
implementation at `05f30282955e711e558169a3e279ddfbeba83c8f`. It retains the
original gameplay documentation, generators, heroes, skills and save producer.
Use this fixed reference instead of `main`, which will eventually advance:

```powershell
git show legacy-final:README.md
git show legacy-final:battle/gameLevel.js
git show legacy-final:battle/saveData.js
git show legacy-final:mazes/maze.js
```

The legacy game uses ES modules served over HTTP and localStorage. Its old
static-server instructions apply to that tag, not this Vite source tree.
Historical archive files from main are retained as reference, not runtime code.
