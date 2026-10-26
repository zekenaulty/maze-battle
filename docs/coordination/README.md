# Repository coordination

This is the Maze Battle half of the
[26 October joint handoff](https://docs.google.com/document/d/1J2fJ7NUnpP3aBx35Ppif8bvNSEIZWoIRIlLDkwLfxFY/edit).
It establishes a reviewable local workflow. It does not claim that MazeTileLab has
adopted this proposal or authorize edits to its active checkout.

## Ownership and discoverability

| Repository | Owns | Local entrypoint |
| --- | --- | --- |
| `zekenaulty/maze-battle` | Canonical state/knowledge, placement, consumer adapters, runtime and installation admission | `AGENTS.md`, `.agents/skills/maze-world-geometry/SKILL.md` |
| `zekenaulty/MazeTileLab` | Reference analysis, authored geometry/materials, portable candidates and producer validation | Its own `AGENTS.md`, `.agents/skills/tilelab-architectural-authoring/SKILL.md` and `coordination/` (observed as new local files; not a release claim) |
| `zekenaulty/maze-quest` | Historical/source experiments | Reference only for this contract |

Keep every project's skill source inside that project's Git tree. Do not solve
coordination by sharing a global skill folder, adding a dependency on a developer's
home directory, or running another repository's skills as if they governed this repo.
Each repo's root guidance should link its local skill and local copy of the agreed
contract. Pin the counterpart's exact commit/path when exchanging a contract copy;
compare content/hash, version and accepted scope before claiming compatibility.

The shared proposal is [spatial-contract-v0.1](spatial-contract-v0.1.md), copied
byte-for-byte from TileLab's proposed contract. Use this common text/digest for
the handshake, rather than two independently named spatial standards. Our
[consumer baseline](consumer-geometry-baseline.md) holds the implementation facts
and proposed integration seam. The
[consumer response](handoffs/2026-10-26-maze-battle-response.json) pins the peer
text and acknowledges the coordination requirements; numeric and installation
decisions remain OPEN. TileLab has not acknowledged that response here.
The initial outgoing packet and concrete open questions are in
[handoffs/2026-10-26-maze-battle.md](handoffs/2026-10-26-maze-battle.md).

For construction grammar and future regional/race/culture/faction styles, use the
[visual-language guidance](../design/visual-language-and-group-styles.md) and local
`maze-visual-language` skill. The
[style-direction handoff](handoffs/2026-10-26-visual-language.md) records the source
brief, group-composition requirements and open decisions. This supplements the
exchange without changing the frozen spatial proposal or claiming peer agreement.

## Handshake

1. Inspect both source baselines read-only. Record repository, branch, full commit,
   dirty files and ownership. Uncommitted observations are provisional; they cannot
   be reproduced from a commit alone. Preserve an active repair before designing a
   competing implementation.
2. Record a proposal under a unique version. Both owners must respond to the same
   contract content, fixtures and scope. Keep it `proposed` until responses are
   recorded; silence, identical terminology and a Google document are not agreement.
3. Implement within separately owned branches/worktrees. A contract change gets a
   new revision plus an impact map; do not silently edit the meaning of an accepted
   version. Schema/save changes need their own reviewed implementation decision.
4. Exchange one explicitly selected immutable candidate with descriptor and payload
   hashes, dimensions, anchors, units, material/UV rules and producer evidence.
5. Maze Battle validates the portable closure and adapts the candidate at a pinned
   consumer revision. Check local geometry, composed installation, actual rendering
   and canonical behavior separately. Failed or incomplete fit remains unadmitted.
6. Record results and the consumer decision against that exact candidate/placement.
   Replacements retain semantic identity but get new geometry/material/placement
   pins as appropriate. Neither a commit nor a merge is an admission receipt.

Use this compact packet for requests and responses (Markdown is sufficient; this
is not a runtime API):

```text
Packet ID / supersedes / in-reply-to:
Kind: proposal | question | response | evidence | admission-decision
Contract version + content hash or immutable repository commit/path:
Producer repo / branch / full SHA / dirty scope / owned checkout:
Consumer repo / branch / full SHA / dirty scope / owned checkout:
Scope and exact interface or invariant:
Candidate semantic ID / descriptor SHA-256 / geometry-layout / material pins:
Placement revision / frame chain / axes / units / scale / pivots:
Joint ownership / opening and clearance / UV policy and phase:
Fixtures / commands / numeric tolerances and results / screenshots:
PASS, FAIL and UNKNOWN per evidence level:
Decision or question / responsible repo / dependencies / next action:
```

For a style-bearing asset or building, also include the core baseline and resolved
style-profile IDs/revisions; group/region and functional scope; per-trait overrides
and fallbacks; source versus invented traits; material/projection constraints; and
neutral/group comparison views. Pin proposed conceptual fields as design evidence,
not as an implemented runtime schema. Core style compliance and group recognition
are separate from physical fit, canonical identity and installation admission.

Keep handoffs append-only by adding a new packet and linking what it supersedes.
Record a peer's response verbatim or with a source link and explicit attribution;
never fabricate acceptance or speak as the other agent. Transport may be a reviewed
PR, an explicitly authorized chat message or a user-designated Google channel.
Transport does not grant authority. Do not send peer messages or update shared
documents unless the user has authorized that transport. Prepare the local packet
and continue independent investigation in the meantime.

## Evidence levels

| Level | Establishes | Does not establish |
| --- | --- | --- |
| Producer validation | Local geometry, provenance and package checks actually run | Consumer compatibility or rights |
| Consumer import/preflight | Selected closure, supported conversion and measured constraints checked | Installed joint fit, door swing or gameplay admission |
| Browser preview | Actual renderer behavior at the recorded camera/scale/state | Canonical travel, hidden-state safety or save compatibility |
| Integration fixture | Named installation and affected canonical behavior at pinned revisions | Untested layouts, all devices or future asset revisions |
| Review/admission | Explicit decision for the candidate and placement in scope | Approval for other installations, merges or paid work |

Investigate accessible facts autonomously. Escalate the smallest unresolved design
choice with measurements and alternatives; do not ask the owner to supply facts
already present in source. Report remaining joint work honestly.
