# Visual language, coherent architecture and group styles

Status: repository guidance and design direction, 26 October 2026. Profile field
names and resolution examples below are conceptual, not runtime APIs or a save
schema. No default historical region, fictional race, culture or faction is selected.

Sources: the [vernacular architecture brief](https://docs.google.com/document/d/1WAYc38Adx6Ai5kpjTe2VEYkj8cnrAVPU4xvFunUoY6g/edit),
the [shared geometry brief](https://docs.google.com/document/d/1J2fJ7NUnpP3aBx35Ppif8bvNSEIZWoIRIlLDkwLfxFY/edit),
and the user's direction that future races, cultures and factions need semantic and
visual styles while retaining the game's core visual language. The first brief
adds construction and regional-style context; group composition extends that
direction to the future game. Neither document confers implementation authority.

## One game, distinguishable groups

Maintain an explicit core art baseline against which group variations are reviewed.
Identify approved references and decisions before treating a palette, proportion,
material treatment or render technique as canonical. The current architecture
preview includes placeholders; it is not a complete approved art bible. Until a
baseline is chosen, label proposed traits and comparisons provisional rather than
silently adopting a historical country, century or current texture pack.

| Layer or concern | What it contributes | What remains shared or separately owned |
| --- | --- | --- |
| Core game language | Readability, silhouette/detail hierarchy, stylization, material response, lighting and interaction-cue rules | Approved game identity; world scale, geometric compatibility and canonical authority |
| Region/site | Climate, local resources, terrain, plots, neighboring construction and chronology | Global style limits and physical placement contract |
| Culture | Learned craft, construction traditions, finishes, motifs, spatial customs and symbolic meanings | Does not uniquely determine species, faction or every individual's appearance |
| Race/species | Authored bodily/ergonomic affordances and associated design vocabulary where relevant | Canonical dimensions and accessibility changes require explicit game-owned design; no automatic cultural/faction assignment |
| Faction/organization | Heraldry, institution, status, commissioned work, occupation, repair and selective finish rules | Overrides only declared traits; membership is not inferred from palette or ornament |
| Archetype/function | Inn, smithy, residence, guild hall, equipment role, wealth and practical use | Function remains recognizable across group variants; supports and occupancy remain coherent |
| Instance/history | Bounded variation, repairs, reuse, mixed influence, age and individual expression | Stable identity and pinned revisions; no unrecorded regeneration or incompatible random mixture |

This is a composition model, not a fixed precedence list. One race can participate
in several cultures and factions; a faction can include many races and cultures;
a region can contain mixed traditions. Record explicit associations and per-trait
ownership rather than assuming a one-to-one mapping. Canonical group facts remain
separate from aesthetic selection and actor knowledge.

The same group vocabulary can inform architecture, clothing, equipment, props,
signage and heraldry without requiring identical materials or repeated emblems
everywhere. Preserve cross-domain family resemblance through a constrained choice
of shapes, craft, motifs and material treatment. Established gameplay/interaction
signals must stay readable under those variations.

## Profiles are constrained, versioned design data

An eventual profile should name its semantic identity, revision, source/reference
pins, applicable group/asset roles, parent/core baseline and permitted combinations.
Separate these concerns instead of accumulating freeform prompt adjectives:

- Context and evidence: region/period or fictional influences, dated/source examples,
  observed versus inferred traits, intentional fantasy departures and rights limits.
- Form and construction: structural grammar, silhouette, support system, opening and
  roof families, joinery, proportions and variation bounds expressed in declared units.
- Materials and surfaces: palette, craft/finish, texture scale/density, UV policy,
  shared phase/joints, weathering, transparency and established render response.
- Meaning and use: culture/faction associations, building/object role, symbols,
  status, history, condition and which facts are available to an actor.
- Composition: allowed trait overrides, compatibility exclusions, mixed-group
  treatment, fallback behavior and the resolved provenance of each selected trait.

Hard geometry and core-language constraints apply before variations. Resolve only
the traits a profile owns. Missing or incompatible combinations should retain an
explicit compatible fallback or remain unresolved; do not randomly combine every
available motif. A fallback must not invent canonical membership or erase identity.

For example, a merchant house can retain its region's timber/stone construction,
use a culture's framing and carving grammar, and show a guild faction's sign and
maintenance finish. A new faction affiliation need not replace its roof or move
walls. If an ergonomic or architectural variant needs a wider entrance or different
floor layout, create and qualify that geometry/archetype revision explicitly.

Keep profile selection policy distinct from chosen asset/layout/material/placement
pins. A material recolor, geometry upgrade, faction change and topology migration
are different operations. Reapplying a profile must not silently change saves,
canonical rooms, apertures, actor knowledge or the gameplay random stream. Existing
absent-pin behavior and unsupported-version handling need qualification before any
future runtime profile system is enabled.

## Construction gives architecture its visual identity

Use historical construction as a researched grammar that can be deliberately
stylized. Avoid treating all medieval references as one interchangeable family.
Regional/chronological cards should identify materials, construction, function,
source quality and later alterations. Keep detailed research conditional on the
task; do not require a history survey for an unrelated code change.

A building instance must reconcile its parcel, outer envelope, wall thickness,
actual support system, interior reservations, storeys, stairs, openings, roof and
neighboring plots. Reserve access, stair voids, chimney paths and structural volumes
before adding furniture. Derive facade and interior from that common structure:

- A jetty adds supported upper-storey volume, constrained by joists/carrying members,
  street clearance and neighboring occupancy. An overhanging decorative ledge alone
  is not a coherent upper room.
- Eaves/gables follow actual roof geometry; roof slope constrains attic headroom.
  Chimneys have continuous routes, openings have wall-depth reveals, and windows
  correspond to real or deliberately reserved spaces.
- Major spans, openings and projections have plausible support relationships.
  Start with construction rules and dimensional/occupancy checks, not a required
  full structural-engineering or water simulation.
- Exterior/interior volumes and adjacent buildings cannot silently overlap. Model
  inaccessible buildings with bounded reserved interior space; immediate gameplay
  accessibility is a separate decision. Deliberate magical/non-Euclidean departures
  must be explicit authored exceptions, not hidden geometry errors.
- Weathering and finish respond to use/exposure rather than arbitrary noise.
  Detailed material effects, including optional offline cellular masonry bakes,
  cannot repair actual cracks, misplaced decks, collision or boundary ownership.

The current game-owned observation/travel/save contracts remain authoritative.
Building candidates do not create canonical door/stair links or disclose hidden
interiors. Renderer LODs and distant facades may simplify detail while preserving
the same instance's physical meaning and bounds.

## Review comparisons and a bounded future prototype

Review a core/neutral baseline, the same functional archetype under two provisional
group profiles, and distinct archetypes within one group. Use comparable camera,
scale and lighting. Record which choices preserve family resemblance, which convey
group identity and which preserve function. An inn should remain legible as an inn;
an attractive new theme alone is not proof of architecture or integration.

For the brief's proposed street proof, plan three adjoining footprints: a small
stone store/cottage, a merchant house with a real jetty and upper room, and a smithy
or compact inn. Keep the selected region/style provisional. After the active seam/
stacking repair is reconciled, compare eye-level/street, overhead and horizontal/
vertical sections with support, aperture and occupancy overlays. Reject unsupported
projections, interior/neighbor overlaps, blocked openings and contradictory roofs.
This is a prototype plan, not a current implementation or an entire city-generator
assignment. It does not require every interior to be playable.

Useful future acceptance cases include a faction sign/finish change that preserves
cultural construction and placed geometry; a mixed-culture faction using compatible
variants; a style request that conflicts with a core readability cue; and an
anatomy-driven doorway variant requiring explicit dimensional admission. Record
actual outcomes, not wording-matching tests or a claim that scenarios already pass.

Keep evidence separate for historical/source quality, core-language consistency,
group/function recognition, composed spatial fit, renderer/memory cost, canonical
behavior and final admission. Claims about playable interiors require real consumer
fixtures; authoring previews and images are insufficient.

## Ownership and rollout

TileLab owns reference analysis, candidate grammar/operators, material/geometry
families and portable provenance. Maze Battle owns admitted profile assignments,
building/world instances, layout reconciliation, canonical behavior and runtime
admission. Neither side should treat this design guidance as existing profile APIs.

Use the existing model/material/preview seams first; see
[reference-guided integration](../reference-guided-asset-integration.md) for current
implementation and the proposed room-profile boundary. Keep new style proposals
and peer responses in separate versioned packets under the
[coordination protocol](../coordination/README.md). Do not rewrite the pinned shared
spatial proposal to imply peer acceptance of new style rules. Each repo implements
its own local skill; no shared global skill installation is involved.
