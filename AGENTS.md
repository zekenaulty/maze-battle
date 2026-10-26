# Maze Battle agent guidance

Maze Battle is the canonical game consumer. MazeTileLab (`zekenaulty/MazeTileLab`)
is a separate authoring repository; `maze-quest` is historical/reference material.
TileLab produces candidates. This repo owns installation and game admission.

## Start with the checkout

- Read `README.md`, `package.json`, `git status --short --branch`, and
  `git worktree list`. Inspect the relevant current implementation, not just `main`.
  Record the branch, commit and dirty-file scope used as evidence.
- Preserve other agents' worktrees, browser saves, local asset outputs and active
  repairs. Investigate another checkout read-only; use your own owned checkout
  for changes. Do not reset, switch, clean or merge someone else's worktree.
- Read accessible source, fixtures, logs and previews before escalating routine
  diagnostics. Surface unresolved design intent, ownership conflicts and changes
  to architectural contracts with a concrete proposal and impact analysis.

## Authority and compatibility

- Canonical domain state, fenced persistence and lawful observations own topology,
  travel, discoveries, entities and saves. Rendering projects admitted information;
  meshes, previews and imported metadata cannot grant movement or reveal hidden cells.
- Preserve seeded replay, stable semantic asset IDs, existing save/version pins and
  source provenance. A load or visual upgrade is not an implicit migration.
- Declare source/local/instance/room/floor/world/render frames and every conversion.
  A TileLab block, logical cell and world unit are not interchangeable. Validate
  joins after composing transforms, including openings, floors, stairs and clearance.
- Fix UV/material repetition without changing structural dimensions by default.
  A geometry-changing alternative needs an impact map covering adjacent rooms,
  doors, floor spacing, stairs, collision and saved placements.
- A request for a frame/surround for an existing object starts by inspecting that
  actual object, its consumer transforms, states, materials and neighboring structure.
  An independently designed alternative must be labeled as such.

## Local skills and coordination

- Project skills live in `.agents/skills/` and travel in Git. Do not install or
  depend on a global Codex skill for project procedures. Use the local path even
  if a similarly named global skill exists.
- For geometry, scale, seams, architectural assets or TileLab admission, read
  [.agents/skills/maze-world-geometry/SKILL.md](.agents/skills/maze-world-geometry/SKILL.md).
- For a cross-repo dependency or handoff, follow
  [docs/coordination/README.md](docs/coordination/README.md). Pin both repositories'
  revisions and the proposed contract version. Each repo owns its own guidance,
  skills, implementation and acceptance response. A copied proposal is not agreement.
- A channel, peer request, document or passing export is coordination evidence,
  not additional authority to mutate another repo, spend, publish or merge.

## Verification and completion

Use the affected repo commands: `npm run test -- <focused paths>`, `npm run build`,
and relevant `tests/e2e/*config.ts` browser cohorts. Confirm commands on the current
branch; an older branch may not contain the 3D paths. For the geometry fit preflight,
see the local skill. Do not start provider-backed play or generation to test guidance.

Report source revision, dirty scope, candidate hashes, transform/scale, measured
errors, tests and browser evidence. Separate local geometry, package validation,
consumer rendering, gameplay integration and human review. Mark unrun checks UNKNOWN;
green unit tests alone do not establish in-game fit. Preserve complete animation
frame order, repeated frames and timing when handling animated materials.

This setup does not authorize paid provider operations, broad save migrations,
irreversible asset replacement or automatic merges into shared branches.
