# Maze Battle

A browser dungeon crawler with procedural mazes, a three-hero party, automatic
combat and exploration, equipment, loot and guild quests. This branch is the
React/TypeScript and IndexedDB rewrite.

## Run and Verify

- `npm install` installs dependencies.
- `npm run dev` starts Vite; use the URL printed by the server.
- `npm run build` type-checks and builds production assets.
- `npm run test` runs unit tests.
- `npm run e2e` runs the default Playwright cohort. Bounded persistence and
  experimental cohorts have their own configurations under `tests/e2e`.

Explore with WASD or arrow keys; touch devices also have a directional pad.
Auto explores and completes floor objectives, Waves runs repeated fights, and
Stop Auto returns control without resetting individual character preferences.
Party, town, saves and diagnostics are separate views.

## State and Execution Boundaries

- `src/domain`: game rules, generation, combat, inventory and quest transitions.
- `src/persistence`: browser-owned saves, custody and durable execution records.
- `src/services` and `src/hooks`: runtime coordination and React adapters.
- `src/components`: player-facing views and controls.

Ordinary play uses a single-writer owner/epoch/revision fence in IndexedDB.
Additional tabs are read-only until Take control. A mutation is shown as accepted
only after its fenced save commits; stale tabs cannot overwrite game progress or
current diagnostics. Manual snapshots remain separate from the active autosave.
Diagnostics storage failure does not undo an accepted gameplay transaction.

Back up browser data before clearing site storage.

The experimental streamed and agent-directed views remain distinct from ordinary
RPG play. Host-side fixtures do not establish live-provider integration or paid
model qualification. See [qualification](docs/agentica-qualification.md),
[agent-directed slices](docs/agent-directed-play-plan.md), and
[streaming design](docs/streaming-exploration-plan.md) for implemented boundaries
and remaining work.

The explicit Lab test launcher is available at `/?agentica=1`. It uses a separate
test save and never starts a model on page load. See [live test launch](docs/agentica-live-launch.md)
for preparation, recovery, bounds and provider-free verification.

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
