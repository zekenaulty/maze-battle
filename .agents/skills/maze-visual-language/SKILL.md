---
name: maze-visual-language
description: Design and review Maze Battle architectural grammar and coherent semantic/visual styles for regions, races, cultures and factions. Use for group style profiles, material families, building identity and related asset handoffs; skip unrelated UI, combat and geometry-only repairs.
---

# Shared visual language and group styles

Read root `AGENTS.md` and the repo-owned
[design guidance](../../../docs/design/visual-language-and-group-styles.md).
This skill governs design and review; proposed profiles are not implemented APIs.

## Establish the shared baseline

Locate the current approved game references, actual consumer assets and relevant
world/geometry revision. Separate approved core traits from provisional placeholders
and new proposals. If no art baseline is recorded, identify that gap and propose a
small comparison set; do not declare a current preview or historical region to be
the final game style. Consult only the relevant reference family, not a whole
medieval-history survey for each edit.

Record the target function, setting, group associations and scope. Distinguish a
race/species, a culture, a faction, a region and an individual instance. They can
overlap and vary independently. A group's appearance cannot establish undisclosed
membership, canonical ownership, allegiance or gameplay behavior.

## Compose a bounded profile

Keep core readability, shape/detail hierarchy, material/render response, declared
scale/frame conventions, shared joins and established interaction cues consistent.
Record which core traits are approved and which remain open; do not invent numeric
art rules.

Describe a versioned profile as structured design data with stable identity,
parent/reference pins, applicable asset roles, allowed variations and explicit
override rules. Keep provenance, semantic associations, construction grammar,
materials, silhouette, motifs, condition and fantasy departures distinct. Do not
apply every motif to every asset or express the whole profile only as an image prompt.

Compose relevant region/material/climate constraints, cultural craft traditions,
race/species affordances, faction symbols and building/object function. Resolve
trait ownership explicitly: a faction banner may override heraldry without
replacing its host culture's roof grammar. Conflicts remain recorded design choices;
never silently use an unrestricted last-wins stack or random mixture.

For buildings, express function through actual plan and construction. Tie exterior,
ordinary interior, walls, openings, storeys, stairs, roof, chimneys and same-realm
neighbor occupancy to one envelope. Read
[spatial domains and portals](../../../docs/design/spatial-domains-and-portals.md)
when a magical threshold leads to a dungeon realm: fit the entrance to its local
host while qualifying the remote realm independently. Conventional cellars, mines
and crypts remain ordinary physical volumes when designated in that realm.
Jetties carry real upper-floor volume and plausible supports; eaves
belong to actual roof geometry. Use the existing
[geometry/admission skill](../maze-world-geometry/SKILL.md) for composed fit checks.

## Compare in context

Use a neutral/core reference and a small set of explicitly provisional style
variants at the same scale, lighting and relevant view. Compare the same functional
archetype across groups and different archetypes within one group. The group should
remain recognizable while the inn, smithy, residence or equipment role stays legible.
Include mixed affiliation or adapted/occupied buildings when the design concerns
overlapping groups. A texture swap alone does not prove architectural variety.

For architectural acceptance, inspect street/eye-level, overhead and horizontal/
vertical cutaways. Check support relationships, interior bounds, roof headroom,
openings, street projections and same-realm neighboring plots. Cross-realm previews
do not create physical overlaps or disclose an unobserved destination. Shared visual
language and group styles can span realms without merging their occupancy, topology
or generation policy. Detailed engineering simulation
and making every interior playable are not prerequisites for a coherent candidate.

Record PASS/FAIL/UNKNOWN separately for core-language consistency, group identity,
historical/source evidence, composed spatial fit, renderer cost and canonical
behavior. Do not claim a style profile or preview is runtime admission.

## Preserve and hand off

Keep semantic IDs stable and independently pin profile, geometry/layout, materials
and placement revisions. Reproducible selection uses stable admitted identity and
a separate visual derivation policy; styling must not consume gameplay RNG or
silently regenerate existing saved layouts.

Use the [coordination protocol](../../../docs/coordination/README.md). TileLab owns
candidate construction/reference evidence; Maze Battle owns profile application,
world placement and admission. Supply resolved profile pins, core constraints,
trait overrides, source status, comparison views and limits in the handoff. Each
repo retains its own local skill; this does not amend the frozen spatial proposal.
