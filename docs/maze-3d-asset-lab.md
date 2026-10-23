# Maze Battle — 3D Projection and Reference-Image Asset Lab

Experimental branch: feature/maze-3d-projection-asset-lab
Merge status: unverified, do not merge without review.

## Historical lineage

- Maze Quest (zekenaulty/maze-quest): wwwroot/assets/block_names.html and block_names.js extract block names and per-face textures, producing textureMaps.json and textureMapsAlt.json. The blockBuilder.js factory maps images to six block faces and Three.js instances.
- Maze Quest BasicRoom, Passage and Space: room bounds, north/east/south/west openings, floors, walls, roofs and block-instanced geometry.
- Blockscape / Blockforge IDE: earlier block, room and map authoring surfaces.
- December 29, 2024 tileset discussion: dark-gray dungeon masonry, irregular weathered brick, seamless repeating edges and repeated-grid visual testing.
- Maze Battle's existing 2D graph, visibility, movement, state, procedural structured rooms, encounter rules, and saves are authoritative.

## First implementation slice

- Expedition settings -> Experimental 3D projection (visual only) toggles the new WebGL2 first-person view; default remains the 2D map.
- Uses an immutable projection of only visible, locally bounded maze cells.
- Every canonical linked pair within a room is open; links at room/corridor boundaries are displayed as doorway openings. Unlinked edges are walls.
- Renderer uses existing Maze Battle stone textures; no Minecraft/Sphax binary assets were copied into this branch.
- The same existing directional controls drive both views, with no additional write authority, movement mechanics, or save fields.
- No interaction props, doors/locks, puzzles, chest visualization, stair models, or scene authoring UI have been connected yet.
- The WebGL renderer may eventually be swapped for a richer Maze Quest/Blockforge voxel/instancing renderer; the projection contract should remain separable.
- This is a first-person room graph visualization, not yet full arbitrary 3D construction or mesh import.

## Optional OpenAI image-edit operation

The asset authoring script runs in Node only. It posts a human-selected PNG/JPG/WebP visual reference to the OpenAI Images Edit API, asking for an original re-interpretation, not a replication.

Preview the exact prompt and provenance without an API call:

    node scripts/edit-tile-reference.mjs --input examples/stone.png --output local-assets/new-stone.png --columns 1 --rows 1 --source-label "Stone texture example" --dry-run

After setting OPENAI_API_KEY outside the source repository, the explicit paid call is:

    node scripts/edit-tile-reference.mjs --input examples/stone.png --output local-assets/new-stone.png --style "original dark stone with geometric mineral seams" --model gpt-image-2.5-flare --source-label "Original reference source noted" --source-license "Review source rights before redistribution"

Change model to gpt-image-2.5-sunburst when editing precision matters more than cost or speed. It writes one PNG plus a provenance JSON receipt with prompt, source hash and label, model, output hash, timestamp, rights note, and a review status. No API key is written to that receipt.

The edit endpoint is generative. It cannot guarantee nonderivativeness, mathematically seamless texture edges, pixel-perfect tile-cell counts, or source license compliance. Do not automatically import output into a game asset pack. Verify visually and with repeated-tile previews. Both 1024/columns and 1024/rows must be integers, so grid dimensions are restricted to 1, 2, 4 or 8.

### Licensing is independent of edit intent

The existing Maze Quest texture library includes Minecraft and PureBDcraft/Sphax materials. They remain acknowledged as original historical references, not silently copied into Maze Battle. BDcraft publishes detailed and restrictive terms for altered resource packs and ports; permissions depend on exact usage and redistribution: https://bdcraft.net/downloads/purebdcraft-minecraft/ and https://bdcraft.net/eula/ . AI editing does not itself grant a license. Review rights for each reference and generated output before redistribution or commercial use; favor original schematics, self-owned samples or appropriately licensed textures for publishable assets.

## Puzzles and scenarios (future)

- Retain canonical room/cell/connection graph as the gameplay source; geometry must not become a second, conflicting source of movement authority.
- Define visuals as compiled projections from semantic fixtures such as room ID, grid cell, local offset, appearance/material reference, and source-event reference.
- A lever, locked door, trap, or quest clue should have a deterministic authoritative state transition via existing game commands, receipts and gates. A 3D visual cannot silently unlock or complete a puzzle.
- Scenario layouts can be authored in reusable room-module schematics with explicit ports, branches, dead ends, optional loops, and puzzle affordances.
- Visibility should remain bounded to prevent leaking unobserved puzzles, secret passages or objective positions.

## Qualification before merge

1. Run npm ci, npm test and npm run build; confirm no failures or TypeScript diagnostic errors.
2. Browser-smoke WebGL2 on desktop and mobile, including context loss and repeated movement. Check first-person facing and room connections against 2D map, especially at room/corridor boundaries.
3. Verify the 2D default and map overview, keyboard/touch controls, save/load, autoplay, dungeon floors, and fog of war are unchanged.
4. Examine representative generated tiles in a repeat-grid comparison and record manual acceptance, origin, and rights status.
5. Keep further scene-generation, puzzle affordances and asset imports in branch until their contracts pass independent tests.

Note: this branch was developed through GitHub connector writes without a local dependency-installed checkout. Build/tests and runtime visual QA were not executed during these commits.
