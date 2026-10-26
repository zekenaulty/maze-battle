# Realm-scoped geometry and dungeon portal clarification

- Packet ID: `mb-realm-portals-20261026-01`
- Kind: guidance/design clarification, prepared locally; no peer message sent
- Source: [architecture brief §6.6](https://docs.google.com/document/d/1WAYc38Adx6Ai5kpjTe2VEYkj8cnrAVPU4xvFunUoY6g/edit)
- Observed Google revision: `AHj4eMS-uj-JD3ejoU7cdc1s4BzNsIr3HzVGFNgkO0XyXTz691NrybtW1gC2jxDPjQGFZoigwj-R40KbYy606BuhRMXkJgYBJOYDVuXGlAg`
- Consumer branch: `codex/maze-agent-guidance`, extending `9a1cebec79cf40e9452e694f196edf4ac6960233`
- Supersedes: any blanket single-world volume interpretation of
  `mb-visual-language-20261026-01`; that packet remains intact as an earlier snapshot

## Material change

Real-world towns, buildings, conventional cellars, wells and sewers conserve
physical volume within their realm. An explicitly magical dungeon entrance can
connect to a separate realm with its own coordinates and geometry budget. The
remote dungeon need not fit under the inn, gatehouse or cave threshold. A nearby
town excavation cannot hit its geometry because of overlapping numerical XYZ.

This does not excuse contradictions within either realm. Conventional mines,
crypts and castle dungeons can share the town realm when deliberately designated.
The gameplay name "dungeon" does not establish a pocket dimension. Each domain's
local rooms, joints, supports, floors, clearances and traversal remain coherent.

## Required handshake additions

1. Supply realm/instance and space/frame identity with coordinates. Establish
   physical continuity before calculating shared occupancy or transforms.
2. Classify entrances as same-realm physical connections or explicit magical portal
   endpoints. For portals, state approved source/destination, eligibility,
   spawn/orientation/scale treatment and reverse or separately defined return.
3. Keep generation policy/version and geometry/resource budgets independent of
   realm identity and portal topology. Finite authored, bounded procedural,
   extensible and pseudo-infinite dungeons are valid choices; none is implied by
   the existence of a portal.
4. Preserve existing saves, recipe pins, custody and lawful observations. A mesh
   cannot authorize a transition or disclose hidden destination geometry. Shared
   race/culture/faction styles can span realms without merging physical domains.
5. Qualify the town-well/nearby-portal example, same-realm underground overlaps,
   coincident coordinates in separate realms, eligible enter/return with reload,
   and local dungeon coherence. Local aperture/seam success is insufficient.

TileLab supplies entrance/anchor/clearance and presentation candidates at declared
frames; Maze Battle owns canonical realm/topology mapping, placement, transition,
observation, persistence and admission. The exact existing `worldId`/floor/space
mapping and future runtime representation remain implementation decisions, not
newly assumed APIs. Do not rewrite current floor/stair data under this guidance.

## Recorded repo changes and evidence limits

Root `AGENTS.md`, both repo-local skills, the visual-language design notes and
consumer geometry notes now apply physical coherence within realms. The new
`docs/design/spatial-domains-and-portals.md` describes the distinction and future
acceptance cases; coordination packets now request domain and portal information.

The pinned `spatial-contract-v0.1.md` and earlier acknowledgement bytes remain
unchanged. This supplement must be included in a future shared revision before
claiming bilateral agreement about domains. No peer acceptance is fabricated.

This is guidance work only. Existing `WorldPosition`/floor/stair and `SpatialView`
types were inspected; they do not establish implemented realm isolation or magical
portal behavior. No runtime realm model, excavation, generator or save migration
is added. Actual town/dungeon isolation and portal fixtures remain UNKNOWN.

Guidance verification: both local skills pass metadata validation; local links in
13 guidance files, whitespace checks and the unchanged shared-contract digest pass.
These are document/packaging checks, not runtime realm or portal qualification.
