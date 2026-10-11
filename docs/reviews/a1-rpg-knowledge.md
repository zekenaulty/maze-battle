# A1 RPG Earned Knowledge Domain Lane

2026-10-11. Base: `857447df77df643cdc15ee7046973174e866bfbd`.
Branch: `codex/a1-rpg-knowledge`.
Worktree: `C:/Users/Zythis/.codex/worktrees/a1-rpg-knowledge/maze-battle`.
Scope: new `src/domain/agentic/knowledge/*` and this report only. No existing
types, runtime, UI, persistence, dependencies or parent checkout were edited.

Status: pure-domain implementation and provider-free tests. This does not qualify
transactional GameSession integration, durable source retrieval, Agentica travel,
UI/fog parity, A2 discovery, A3 collection/return, or Q cross-runtime behavior.

## Integration Interface

Import from `src/domain/agentic/knowledge/index.ts`:

```typescript
const observation = observeRpg(game, {
  id: observationId,
  revision: { owner: control.owner, epoch: control.epoch, revision: control.revision },
  observedAt: checkpointTimeIso,
}); // RpgObservation (status: 'observed') | RpgRefusal

if (observation.status === 'observed') {
  const knowledge = projectRpgKnowledge(previousKnowledge, observation);
  // RpgKnowledge (status: 'known') | RpgRefusal
  if (knowledge.status === 'known') {
    const route = knownRpgRoute(knowledge,
      { floor: 1, row: 0, column: 0 }, { floor: 1, row: 0, column: 2 },
      { maxVisits: 512, maxSteps: 256 });
    // ready: path excludes origin, directions, distance, visits, sources
    // unknown: origin_unknown, target_unknown, no_known_route
    // refused: invalid arguments, cross_floor, visit_limit, step_limit
  }
}
```

The caller supplies the canonical checkpoint, exact game/control revision,
receipt ID and observed time; there is no clock, RNG, persistence or service call
in this lane. `RpgRevision` is structurally compatible with `SaveControl`, without
importing persistence types. Game ID comes from the supplied checkpoint; every
actor/cell/chest position includes an explicit floor.

Call observation and projection inside the canonical command transaction. Commit
the exact receipt with its game effect and knowledge, not a later reconstruction.
Archive immutable source receipts by game lineage and ID in the caller-owned
durable source archive. Never deduplicate using current geometry. A reused latest
source ID returns `duplicate_source`; historical ID uniqueness, original-request
replay, imported-data validation, save-replacement lineage and transactional
retention belong to the host. These APIs consume trusted typed domain inputs,
not arbitrary model JSON or unvalidated persisted records.

Projection rejects another game, decreasing epoch/revision/time, and another
owner within the same epoch. Equal revision with a new observation ID/time is
permitted for a fresh read of the same checkpoint. It does not authenticate the
supplied custody or imply permission to move. Route success describes remembered
connectivity, not guaranteed current physical traversability; the canonical
executor must still resolve movement and earn a new observation at its checkpoint.

## Evidence Policy

- `computeVisibleCells` supplies the existing linked-path BFS, default radius 7,
  using the checkpoint's configured radius without silently changing it.
- Receipts contain visible positions, open directions only when both endpoints
  are observed, and missing exits at observed cells. An open direction cropped
  by the sight boundary is omitted, not invented as either a link or a wall.
- Chests expose only ID, opened flag and floor/position. Stairs expose only the
  visible `town`/`up`/`down` affordance, not a destination floor's contents.
- Room association exposes observed room IDs only. Role/name/tags/center/bounds,
  total room counts, layout connections/main paths, loot, quests and other saved
  floors are not evidence. Overlapping legacy rooms retain all observed IDs;
  hidden roles do not choose an association.
- Legacy `visited` and `visibility.explored` are never read. No historical links
  are inferred from fog coverage. Adoption starts with the current lawful sight.
- The producer copies allowlisted data and deeply freezes receipts. Projection
  produces an independent frozen state, preserving prior receipts, loaded input
  and historical snapshots without freezing or modifying caller-owned objects.

Cell details and directional edges carry source ID, game/control identity and
observed time. Newly observed blockage replaces the current edge fact. The
unseen neighbor retains its old source and facts; reciprocal known-open routing
cannot cross the newly blocked endpoint. Cropped directions retain older edge
facts with their original ages, so remembered routes are not erased by a narrow
later view. A previously blocked cropped direction remains conservatively
blocked until both endpoints are observed open. Unseen world changes cannot
refresh knowledge. The reducer does not accumulate a source-history array;
replaced sources remain in the caller's archive and any retained old snapshots.

## Bounded Queries

`knownRpgRoute` uses the existing `shortestRoutes` unit-cost BFS with point reads
on reciprocal remembered edges, deterministic north/east/south/west ordering,
and no GameState or hidden-map fallback. It stops expanding after discovering
the target. Visit budgets include staged search nodes, not just path length;
budget exhaustion is refusal, never proof that no route exists.

`rpgLocalContext(knowledge, origin, { roomId?, radius, maxCells, asOf })` searches
only the bounded remembered neighborhood inside the selected room. Without an
explicit room ID, it selects the origin's first sorted observed association;
`null` selects unassociated cells when the origin has no known room. No hidden
room role selects the context. `rpgRoomContext(knowledge, { floor, roomId },
{ offset, limit, asOf })` reads an indexed room page, not every known cell.
Offsets belong to the supplied immutable knowledge snapshot. It reports only
the remembered cell count, not the room's actual size or exploration completion.
Other rooms appear only as page-local connection IDs/source references; their
interior cells, chests, coordinates and metadata are omitted. Connection summaries
are not a complete map. Both contexts clip open edges to returned cells and mark
`edgeScope: 'returned_cells'`; omission is not evidence of blockage.

`asOf` is caller supplied. Cell and edge `ageMs` are computed independently from
their original source times; recall never refreshes facts. A clock preceding the
latest observation is refused. Queries return `unknown` for missing knowledge,
`refused` for unsupported inputs/work, and `ready` for a bounded result.

| Limit | Maximum |
| --- | --- |
| Observation radius / cells | 16 / 545 (radius-16 grid diamond) |
| Visible chest records / room IDs per cell | 8 / 8 |
| Retained cells / floors | 2,048 / 16 |
| Route visited nodes / returned steps | 512 / 256 |
| Local context radius / cells; room page cells | 7 / 64; 64 |
| Room-page connection IDs / sources per connection | 12 / 16 |
| Identity or room/chest ID length | 128 characters |

Unsupported limits are refused, not clamped. Projection has no automatic
eviction, and a capacity refusal does not return a partially updated state.

## Verification

Run from this worktree, using the existing parent dependency root through a local
`node_modules` junction; no installs, providers, services or test ports:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --cache=false src/domain/agentic/knowledge src/domain/maze/visibility.test.ts src/domain/maze/solver.test.ts src/domain/maze/clickRoute.test.ts src/domain/maze/localLookup.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --cached --check
```

PASS: 61 tests in eight files (45 new knowledge tests and 16 existing visibility,
solver, click-route and lookup regressions). PASS: full TypeScript no-emit check.
Coverage includes exact hidden-world output equality (links/chests/room metadata,
counts and geometry outside sight), forbidden-read getters, legacy exploration,
immutable sources, observed blockage versus unseen changes, edge age, floor
scope, equal-cost routing, caps, room-only pagination and no full-floor query
enumeration. Seeded actual structured-v3 floors 1/10 (seed 42), sparse/reordered
legacy cells and the maximal 545-cell sight diamond are exercised.

## Remaining Retrieval Work

This is a bounded resident knowledge projection, not a far-map implementation.
Projection copies at most the retained cap; route/local/room queries use bounded
point reads. Observation still uses existing `mazeCellAt`, whose sparse-save
fallback can scan the cell array. Room association and chest extraction scan the
existing room/chest arrays for each visible cell; their CPU cost is not independent
of stored world size. Those work counts/timings are not actor evidence. Dense
structured-v3 visibility is tested without a full topology scan, but this is not
an arbitrary-world constant-work claim.

Next retrieval work needs host-owned indexed observation lookup, source archive
validation/retention, paged floor/room knowledge with snapshot-bound cursors and
bounded loading/eviction, then deliberate far-room routing or retrieval. Do not
implement an all-world scan followed by output slicing as a substitute. No
hierarchical far-map graph or unseen target selection is added here.
