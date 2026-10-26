# Spatial domains and dungeon portals

Status: repository design guidance, 26 October 2026. This incorporates §6.6 of the
updated [architecture brief](https://docs.google.com/document/d/1WAYc38Adx6Ai5kpjTe2VEYkj8cnrAVPU4xvFunUoY6g/edit).
It corrects any reading of the earlier envelope/volume rules as a requirement for
one Euclidean embedding of town and all dungeons. It does not introduce runtime
realm/portal APIs, migrate saves or change the active geometry implementation.

## Classify physical continuity before measuring geometry

| Case | Spatial requirement |
| --- | --- |
| Town houses, castles, foundations, ordinary cellars, wells and sewers | Physically continuous within their local realm; solids, voids and excavations agree |
| A conventional mine, crypt, tunnel or castle dungeon | Shares that realm's occupancy when deliberately designated there; the gameplay name does not choose its spatial domain |
| A magical dungeon entrance in an inn cellar, gatehouse or cave | Local host/threshold fits physically; an approved portal connects to an independently framed realm |
| Dungeon rooms, adjoining passages, floors and stairs in one realm | Coherent local geometry, joins and lawful traversal; any further magical discontinuity is explicit |

Represent a position conceptually as realm/instance identity plus space/frame
identity and local coordinates. Do not key physical adjacency, collision, occupancy
or digging by a bare XYZ tuple, a floor number or a material/style association.
Compare geometry only after establishing a common physical domain and composing
the required local transforms. Matching local coordinates in separate realms are
not a collision, and distant coordinates can be linked topologically by a portal.

Do not assume each `spaceId` or dungeon floor is its own realm. Conversely, do not
assume a session's existing `worldId` already implements every intended realm
boundary. Mapping existing identities to this conceptual model is a separately
reviewed implementation decision with compatibility evidence.

A town well cannot uncover, displace or intersect a remote dungeon merely because
an imagined shared XYZ projection overlaps it. Same-realm cellars and mines still
must respect foundations, neighboring properties and existing excavations. A portal
designation cannot retroactively excuse contradictory geometry inside a building
or dungeon realm; it must be an explicit authored topological discontinuity.

## Portals connect approved endpoints

A magical threshold is a topological connection, not necessarily a physical tunnel,
stairwell or single affine transform joining two globally embedded volumes. Record
the intended source realm/entrance, destination realm/entrance or spawn, eligibility,
orientation/scale and visible transition treatment. The endpoints may have different
coordinates, bases and scales without requiring their surrounding solids to touch.

The local entrance must fit its host up to the threshold, with lawful access and
clearance. The destination must independently fit its realm and spawn constraints.
Destination geometry does not consume town cellar/foundation volume. Cross-realm
previews, culling or scene staging must not merge physics/occupancy indexes or
silently reveal hidden destination rooms. Visual continuity across a magical
threshold is an explicit presentation choice, not proof of physical adjacency.

Maze Battle owns the transition action, eligibility checks, committed actor
position, permitted observation, persistence and return behavior. Record the reverse
connection or a separately defined return connection; never assume an inverse
matrix alone restores the correct location. A return must resolve the intended
source realm/instance and entrance, including its orientation and allowed position.
Existing custody/revision fences and failure/reload semantics remain applicable.

TileLab may author entrance geometry, anchors, clearances and visual candidates.
An exported door, stair or portal-looking mesh cannot mint the canonical connection,
choose another realm's identity, authorize entry or disclose its contents.

## Realm identity, topology and generation are separate

A dungeon may be a finite authored complex, bounded procedural layout, persistent
but extensible floor sequence or pseudo-infinite generation policy. Endless descent
is not required for dungeon identity or portal behavior. Specify and version the
generation policy independently of realm/instance identity and entrance/return
topology; also retain seed, recipe/materializer and accepted layout pins as relevant.

Do not regenerate existing saved rooms or redefine connections merely by changing
a policy label. Any actual policy switch, finite-boundary behavior or migration
needs a bounded implementation plan and save/replay evidence. Group/style profiles
can apply across realms while keeping physical domains and generation independent.
Realm-specific geometry and runtime resource budgets remain explicit; separate
realms do not imply unlimited memory, floor count or generation work.

## Current-source evidence and implementation limit

At the inspected consumer lineage used for this guidance:

- `src/persistence/canonical/world/types.ts` has a `WorldHeader.worldId`,
  `WorldPosition` with level/cell, `WorldFloor.spatial` and optional `WorldStairs`
  placement. These facts do not establish the proposed realm-scoped portal model.
- `src/domain/expedition/vertical.ts` defines current floor/stair placement math;
  `src/services/game/SpatialView.ts` discloses bounded stair-room geometry.
  Neither is evidence that every floor is a separate magical realm.
- The existing opening-local architectural fit preflight checks limited candidate
  geometry only. It proves neither realm isolation nor canonical portal round trips.

Use current source again before implementation. Keep the frozen spatial proposal
as historical handshake text, and exchange this clarification in a separate
[coordination packet](../coordination/handoffs/2026-10-26-realm-portals.md). A later
shared contract revision must explicitly include domain identity and portal scope;
silently changing the old text/digest would lose its acknowledgement provenance.

## Required future proof cases

| Fixture | Required observation |
| --- | --- |
| Town well beside a magical dungeon entrance | Excavation and occupancy remain local; coincident remote dungeon coordinates are never hit |
| Conventional cellar/mine under the same town | Real overlaps with foundations/nearby excavations are detected; a dungeon label cannot bypass them |
| Same local XYZ in two different realm instances | Physics, occupancy, observations and persisted identity remain isolated |
| Approved portal enter/return, including reload/failure | Correct destination and source realm/instance/position, eligible travel only, no hidden-state disclosure or stale-custody commit |
| Different endpoint orientation/scale | Local thresholds/spawns remain valid; transition presentation does not imply one global physical transform |
| Adjacent rooms/floors within a dungeon realm | Existing seam, clearance, aperture and canonical movement rules still hold |
| Finite and extensible dungeon policies | Same portal abstraction works without assuming an infinite bottom; policy version changes preserve accepted identity/layout or use explicit migration |

These are acceptance requirements for future implementation, not completed tests.
Do not add excavation, a realm runtime or an infinite generator merely to update
agent guidance. Report realm-isolation and portal behavior UNKNOWN until actual
consumer fixtures establish them.
