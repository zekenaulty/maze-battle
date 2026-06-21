# Maze Battle

React and IndexedDB rewrite branch for the legacy Maze Battle browser game.

## Scripts

- `npm run dev` starts the local Vite server.
- `npm run build` type-checks and builds production assets.
- `npm run test` runs unit tests.
- `npm run e2e` runs Playwright tests.

## Migration Notes

The old vanilla JavaScript implementation was intentionally removed from this branch. Use git history for cross-reference, for example:

```powershell
git show main:battle/gameLevel.js
git show main:battle/saveData.js
git show main:mazes/maze.js
```

The new state foundation lives in `src/domain`, and browser persistence lives in `src/persistence`. Existing `localStorage` save slots are imported into IndexedDB once and converted into the new versioned schema.
