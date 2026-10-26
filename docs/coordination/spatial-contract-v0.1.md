# World / asset spatial contract proposal v0.1

Status: **PROPOSED by TileLab; no Maze Battle acknowledgement recorded.**
This is a small coordination proposal, not an implemented runtime schema or a
replacement for `tilelab-material-export-v1/v2`, `tilelab-workshop-v1`, or
`maze-visual-model-pack-v1`. Its SHA-256 identifies the exact proposed text;
edits require a new digest and renewed acknowledgement of affected scope.

## Frames and conversion

| Frame | Current facts / required declaration |
| --- | --- |
| Source asset | Preserve model/texture closure and its original units, axes and pivots; Minecraft source UV16 is not world distance |
| TileLab authoring | Current `basis`: right handed, +X right, +Y up, +Z front, floor-center origin, units `blocks`; source normalization divides by 16 and offsets X/Z |
| Assembly / instance | Named origin and anchor, scale per axis, rotation convention, supported reflection policy, source/target frame IDs |
| Logical cell / room | Maze Battle-owned exact identity and adjacency; a cell can contain several visual components |
| Floor / portal | Maze Battle-owned elevation, connector, landing and aperture relations; preserve canonical travel semantics |
| World | Consumer-owned dimensional policy and placement; no automatic block/cell equality |
| Render / camera | Projection of permitted game information; any origin rebasing leaves canonical identities intact |

Specify whether vectors are columns and matrices multiply right-to-left before
using `T_world_from_part = T_world_from_floor * T_floor_from_room *
T_room_from_instance * T_instance_from_part`. Each conversion occurs once. Do not
silently turn this illustrative convention into the consumer's implementation.
Document anchor position, normal and up, and any nonuniform scale/normal handling.
Unsupported rotation/reflection should be rejected or remain unqualified.

The sampled game uses a 3.2-world-unit cell and 1.6 masonry repeat, while its
iron-door instance fits width and height independently from closed model bounds.
These observations do not settle project pitch, source-block scale or future
adapters. Canonical construction pitch and exact-index/continuous-offset policy
remain open. Prefer recomputation from indices/common origin over accumulated
floating-point offsets when placements share an exact lattice.

## Composition and surfaces

- One owner defines each shared wall/opening boundary. Both sides use the same
  aperture planes, dimensions and orientation. Record joint intent: abutting,
  watertight, designed overlap, visible material joint, or intentionally open.
- Derive floor top, slab bottom, ceiling, wall start/end, landing and stair voids
  from compatible reference planes after the full parent transform chain.
  Deck cuts must match apertures across all affected surfaces.
- Measure transformed edges/planes and required voids, not only local AABBs.
  Use named tolerances with units and purpose: position, overlap, clearance,
  angular and UV phase. Exact lattice equality is a separate assertion.
- Preserve structures during UV fixes. Masonry uses an agreed reference plane,
  physical repeat period, orientation and phase; beams preserve spanwise grain;
  log end grain and pinned door atlases remain distinct. Trims may terminate a
  field deliberately. A geometry-changing alternative carries an impact map.
- Track geometry/topology, UV, shading and behavioral clearance independently.
  A successful seam diagnostic does not establish lawful traversal or saves.

## Minimal handoff facts, without a new runtime format

Keep the existing authoring package and descriptor. Attach a versioned packet
that identifies semantic asset and installation intent; recipe, layout,
materials and placement revisions; source/local/consumer frames and conversions;
anchors, bounds, joints, support and reserved volumes; state/animation bindings;
material projection/atlas and phase; source/output hashes; fixture inputs,
measurements, screenshots and unresolved limitations.

Candidate, locally validated, visually reviewed and game-admitted are separate
facts. Maze Battle assigns consumer identity/adaptation and admits exact pins.
Replacing a placeholder keeps its semantic binding while advancing applicable
layout/material/placement revisions; it does not silently rewrite saves.

## Agreement needed from Maze Battle

| Decision | TileLab proposal / question | State |
| --- | --- | --- |
| World units and pitch | Keep explicit adapters; what world dimensional policy is accepted after the active repair? | OPEN |
| Exact placement | Which indices/offsets and canonical-to-render floor transform are authoritative? | OPEN |
| Boundary ownership | Use consumer shared-boundary identity; which scene interface exposes it? | OPEN |
| Door assembly | Export actual aperture, hinge/sweep, wall/floor anchors and both-face control reservations | OPEN |
| UV phase | Name datum/orientation/period per material role; confirm current repair policy | OPEN |
| Admission | Pin existing model/placement adapter and required local/browser/game checks; no implicit schema migration | OPEN |

Start with the iron-door assembly, then contiguous rooms, stacked floors/stairs,
long translated sequences and rotated/corner instances. Expand only from observed
fixture failures. Reload and 2D/3D parity remain consumer checks where affected.
