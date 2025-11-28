# Maze Battle
Browser-based dungeon crawler that mixes procedural mazes with an auto-battling trio of heroes. Built as a lightweight ES module app meant to run anywhere a static web server can serve `index.html`.

## Quick start
- From the repo root run a simple server (modules need HTTP, not `file://`):
  - `python -m http.server 8000` or `npx http-server .`
- Open `http://localhost:8000` and the game boots immediately; eruda is preloaded for mobile debugging.

## Gameplay loop
- Each dungeon level spawns a fresh maze using one of several generators (Aldous-Broder, Wilsons, Hunt-and-Kill, Recursive Backtracker, Prim's, Growing Tree). Maze scale grows with level.
- Explore with the on-screen d-pad. A random-encounter toggle lets you roam peacefully or trigger battles as you move.
- Clear fights, reach the exit, and the party advances to a bigger, denser layout. Health/mana are restored on level-up and between waves as designed.
- Failing a fight wipes the party and restarts at level 1; progress autosaves frequently.

## Controls and UI
- Header buttons: `AUTO PLAY` (maze navigation AI), `FIGHT WAVES` (continuous combat), `CHARACTERS` (inspect/allocate stats), `SAVES` (local save/load/new run).
- Joystick footer: movement buttons plus a checkbox for enabling random encounters.
- In battle: top buttons for pause/auto-play/waves; action bars for manual casts; double-click a nameplate to pop a detail sheet without leaving combat.

## Heroes and skills
- **Vor (Warrior):** Strength-scaling frontline with `slash`, charged `cleave` (multi-target), and `slam` (room-wide burst). Auto-spends points into Strength/Vitality.
- **Ayla (Healer):** Intellect-scaling support with `heal`, `group heal`, `resurrect`, and a free `smite`. Prioritizes revives and party health before attacking.
- **Zyth (Mage):** Intellect burst/AoE via `arcane blast`, `magic missles`, `arcane wave`; `wand` regens mana; `teleport` is usable out of combat to reposition in the maze.
- All heroes have auto-battle logic tuned to their kits and will self-assign level-up points; manual action bar input always works when battles are unpaused.

## Combat system
- Encounters: Moving in the maze rolls several dice; if conditions match and random battles are enabled, a fight starts. Separate `FIGHT WAVES` mode chains battles endlessly for farming.
- Enemies: Spawn count varies (1-10) with levels loosely around the dungeon depth. Targeting biases toward the Warrior but swaps if targets fall.
- Loot/XP: Each kill grants gold and XP (scaling with enemy level). Level-ups award spendable attribute points; damage and resource pools scale off those stats.
- Failure/Reset: When the party dies, combat stops, an alert pops, and the game restarts at dungeon level 1.

## Maze generation and movement
- Canvas-based renderer with start/end/active markers; optional solution/histogram overlays are supported in the renderer.
- AutoPilot mode pathfinds toward the exit using the current maze distance map, automatically investing level-up points and toggling combat modes as needed.
- Teleportation: Rare random teleports can occur after moves; the Mage's `teleport` skill deliberately relocates the party at a mana cost.

## Saving and persistence
- `localStorage` holds an auto-save slot plus user-created slots (capped to a handful). Most movement, maze completions, and generator finishes trigger an auto-save.
- The Saves modal lists summaries, loads runs, deletes slots, and can wipe the auto-save to start a new game.

## Project layout
- `app.js` wires the UI (header, stage, joystick) to `GameLevel`, AutoPilot, wave fighter, and save management.
- `battle/` contains actors, skills, combat UI (battle modal, action bars, spawner), and persistence helpers.
- `mazes/` holds the grid/cell logic, multiple maze generators, and the canvas renderer/scaler.
- `ui/` provides shared components (modals, loader, header, joystick, alerts, stage) and styling hooks.
