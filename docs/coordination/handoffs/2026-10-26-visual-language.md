# Construction and group-style direction

- Packet ID: `mb-visual-language-20261026-01`
- Kind: design/guidance supplement; prepared locally, no peer message sent
- Source: [vernacular architecture and coherent towns brief](https://docs.google.com/document/d/1WAYc38Adx6Ai5kpjTe2VEYkj8cnrAVPU4xvFunUoY6g/edit), read 26 October 2026
- Observed Google revision: `AHj4eMQD79Rv2FU6erpM377if15g1AWsY5g_A5bb41rjmCokKmKmm3MC79v24mwZo_JQmA72qvhhKaayXe4bFkTH8GSneexAO2POx1-ByE0`
- Consumer guidance branch: `codex/maze-agent-guidance`, extending `85d00dc12d5088d7262066b87040f7f2d906244e`
- Authority: the user explicitly requested incorporating the brief and future race,
  culture and faction styling while maintaining the game's core visual language

## Direction incorporated

Root guidance now requires construction/world context and consistent building
envelopes. The repo-local `maze-visual-language` skill handles bounded profiles and
style review; the existing geometry skill handles composed spatial qualification.
Detailed guidance is in `docs/design/visual-language-and-group-styles.md`.

Keep a maintained core game language, then compose explicit compatible regional,
race/species, cultural, faction, functional and instance variations. These groups
can overlap; a culture is not a race and a faction can include several cultures.
Profile traits need declared ownership/override rules and separate semantic,
visual and physical responsibilities. No default race, palette, nation or period
is selected by this change.

Buildings derive facade, usable/reserved interior volume, storeys, roof, openings,
supports and neighboring occupancy from one instance. A coherent but inaccessible
interior is valid; making the entire town playable is not an initial requirement.
The small three-building street remains a proposed future proof after current
geometry/stacking work stabilizes. No competing renderer or generator is added.

## Peer coordination and decisions still open

TileLab can supply researched construction families and original candidate assets
with measured supports, bounds, openings and material/source evidence. Maze Battle
supplies core style constraints, target context, profile application and consumer
admission. Exchange baseline/profile and independent geometry/material/placement
pins, explicit overrides and comparison views in addition to the spatial packet.
Each repository owns its own local instructions and skill implementation.

Open: approved core art references/constraints; first provisional region/style;
minimal profile composition and compatibility representation; stable semantic
group associations and disclosure policy; which future street interiors are
playable; and the smallest consumer fixtures needed for those decisions.

The pinned `spatial-contract-v0.1.md` and earlier acknowledgements are unchanged.
This supplement records consumer guidance, not bilateral adoption or runtime
profile support. Other repositories and active repair worktrees are untouched.

## Evidence limits

This change updates prose guidance and skill routing only. Both local skills passed
metadata validation; local links in 11 guidance files and the unchanged shared-
contract digest passed verification, as did whitespace checks. No new runtime,
historical field research, generated artwork, style-recognition experiment,
street scene, browser fixture or gameplay admission is claimed. These checks do
not establish that a future profile resolver or building compiler exists.
