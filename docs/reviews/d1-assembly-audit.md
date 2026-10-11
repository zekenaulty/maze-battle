# D1.2 Independent Assembly Audit

2026-10-11. Reviewed `3bf4292de8c3f466e96f8ca95a22de36baf5a6bb` against
`docs/dungeon-d1-repair-plan.md` and the owner second-review attachment
`6f184959-f7f1-4981-a72f-8a22e18cf6f0/Pasted text.txt`.
Worktree: `d1-assembly-audit/maze-battle`; branch: `codex/d1-assembly-audit`.
Only the new `moduleAudit.test.ts` and this report are changed. No runtime,
projection/default/types, providers, browser, or user state was touched.

## Findings

Integration follow-up on `codex/dungeon-d1`: all three retained reproductions now
pass. Automatic finish identities skip committed requests; role centers are
copied; exit/hub ties use stable identities. The projector also rejects the
133,176-cell fixture below before allocating its dense RPG cell array. Combined
audit/projection run: 34 passed; TypeScript check passed. Original findings and
initial failed-run evidence are retained below, not rewritten as historical passes.

1. **P2: `finish()` collides with valid public request identities.**
   `modules/assembly.ts:85` generates `expand-${revision}` without checking its
   receipt map. With `recipeFor(2, 13)` (world `d1-audit`, level 1, default policy),
   commit `builder.propose(0, 'expand-1')`, then call `builder.finish()`.
   It throws `Module request identity reused with different input` at revision 1
   instead of completing the remaining rooms. Ordinary eager-only usage is not
   affected; mixing the public incremental API and eager completion is broken.
   Parent repair: allocate collision-free automatic identities without weakening
   exact replay or the reused-request rejection.
2. **P3: role results share mutable centers with their source footprints.**
   `maze/moduleRoles.ts:43` shallow-spreads each footprint. After assigning the
   same 13-room fixture, `source[0].center.row += 1000` also moves the returned
   start center from 4 to 1004 while its bounds remain unchanged. The reciprocal
   alias also exists. Parent repair: copy the nested center at the ownership
   boundary. This is a reproduced alias, not an observed gameplay/save failure.
3. **P3: graph enumeration order changes gameplay roles for identical geometry.**
   `maze/moduleRoles.ts:34` selects the first maximum-distance room in BFS order.
   Reverse only the same fixture's `state.joins`; exit changes from
   `socket-4:room` to `socket-11:room`, and boss/treasure/safe assignments change.
   Structural room IDs stay intact. A stable ID tie-break would make equivalent
   graph enumeration deterministic. This is a defensive graph-order invariant;
   the pinned assembler itself emits stable order, so a live regeneration bug
   has not been established. Hub ties similarly use footprint enumeration.

All three reproductions remain ordinary failing tests, not skips or expected
failures. The parent owns runtime fixes. Direct parent notification was attempted
but the app rejected messaging a native ancestor; reproductions were surfaced in
commentary and are preserved here for the native completion handoff.

## Bounded Evidence

**PASS: 560 sweep floors**, with no generated overlap, invalid join, spatial
exhaustion, or default-policy structural/coverage/capacity failure observed:

- 192 default floors: 24 seeds excluding the original six, at each of
  7/11/13/16/32/64/128/256 rooms. Every floor checks its own gates; no median
  masks failures. Independent rectangle and all-roots graph-distance oracles
  check geometry, reservations, ports, connectivity, depth, diameter and roles.
- 240 variant floors: first 12 audit seeds, budgets 7/13/32/64, five policies:
  fixed 5/direct, fixed 15/direct, fixed 5/passage length 1, fixed 15/passage
  length <=7 (all with 32 attempts), and full-range mixed with one attempt.
  Minimum coverage respectively: 48.48%, 48.48%, 34.67%, 30.60%, 28.44%.
  Maximum projection envelope respectively: 3,300 / 29,700 / 4,615 / 47,064 /
  19,817 cells. These viable variants all passed the existing structural gate,
  25% coverage and 15% cohort-median fork-fraction checks at 32/64 rooms.
- Another 128 seeds, `(Math.imul(i + 1, 2654435761) >>> 0)` for i=0..127, at
  256 rooms. This stress cohort checks structural quality, count, direct joins,
  coverage and projection envelope, not the full independent geometry oracle.
  Maximum envelope 56,826 cells; minimum coverage 33.10%.

Default 24-seed cohort measurements (distances are room-graph edges, not RPG steps):

| Rooms | Median coverage | Median fork fraction | Max chain | Entry depth | Diameter | Leaves | Max side-depth range | Max cells |
| ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: |
| 7 | 46.79% | 28.57% | 2 | 2 | 3-4 | 4-5 | 1-2 | 1,722 |
| 11 | 44.33% | 27.27% | 2 | 2 | 4 | 7-8 | 2 | 3,192 |
| 13 | 41.35% | 30.77% | 2 | 2 | 4 | 8-9 | 2 | 3,660 |
| 16 | 40.94% | 31.25% | 2 | 2-3 | 4-6 | 9-11 | 2-3 | 4,200 |
| 32 | 41.75% | 34.38% | 3 | 3-4 | 6-8 | 15-19 | 3-4 | 9,047 |
| 64 | 39.75% | 32.81% | 4 | 5 | 9-10 | 24-33 | 4-5 | 16,254 |
| 128 | 39.00% | 31.64% | 6 | 6-7 | 12-14 | 42-57 | 6-7 | 30,276 |
| 256 | 40.10% | 30.86% | 8 | 9-10 | 18-19 | 78-101 | 9 | 52,920 |

Side depth is leaf distance back to an entry-to-farthest-room route. At 32+ rooms
the worst sampled 5x5 non-entry-room share is 20.63%; this measures actual minimum
footprints, not whether a particular candidate was a fallback. Coverage does not
halve between 32 and 128 rooms. Small floors are shallow: all default 13-room
fixtures have depth 2, so passing fork counts alone should not be sold as rich
layout variety. Larger floors do have multi-step side branches, not just a star.

Actual seed-2, 13-room, fixed-5/direct assembly (one letter = one 5x5 room,
`S` = entry; only drawn lines are doors; nearby rooms need not be connected):

```text
    K
    |
  J-C H
    | |
L-D-S-B-I
    |
  G-A-F
    |
    E
```

**PASS:** every-commit pending reservation disjointness; stale/foreign/forged
proposal rejection followed by valid completion; late exact JSON replay;
constructor/proposal/snapshot/commit clone isolation; three join modes with
prefetch/retry/JSON transport versus eager equality; invalid role graph rejection;
over-module-capacity rejection; synthetic whole-floor chain quality rejection.

## Integration Boundaries

- **Projection enforcement remains the parent projector's obligation.** The
  assembler validates but never uses `maxProjectionCells`. Seed 0, 256 rooms,
  minSide=maxSide=15, mixed joins, attempts=1 completes with **133,176** envelope
  cells, exceeding 65,536. This is a reproducible integration gate fixture, not
  proof that the unreviewed D1.3 projector publishes an oversized floor. It must
  reject before allocation/publication and never silently clamp. `finish()` also
  does not call `assertModuleQuality`; the floor publication boundary must do so.
- No genuine spatial exhaustion occurred in these unconstrained-plane fixtures;
  the `spatial` error branch is not dynamically qualified by this sweep.
- Candidate/local-check counters account for committed proposal work; proposal
  retries and commit revalidation execute additional work. Index queries count
  physical calls. Do not present these mixed counters as total execution cost.
- No native persistence, eager save bytes, render timing, RPG travel, safe-room,
  resize, mixed-version default integration, or live-provider qualification.

## Commands and Results

All commands ran in the isolated audit worktree, Node v22.13.0, Vitest 4.1.9;
`node_modules` is the authorized junction to `maze-live-launch/maze-battle`.

```powershell
npx vitest run src/domain/expedition/topology/modules/moduleAudit.test.ts --maxWorkers=1 --disableConsoleIntercept
# FAIL: 24 passed, 3 failed, 27 total; 16.38s. The three failures are listed above.
npx vitest run src/domain/expedition/topology/modules/assembly.test.ts src/domain/maze/modulePolicy.test.ts --maxWorkers=1
# Initial run: 22 passed, 1 failed on the existing 5s timeout at 256 modules (22.46s total).
# Unchanged rerun: PASS, 23/23, 8.49s. No timeout or source adjustment.
npx tsc --noEmit
# PASS
```

The first exploratory audit run had an oracle error: it treated opposite faces of
a one-cell passage as a reused port. The test now keys ports by cell AND outward
direction; no product gate was relaxed. No runtime repair is included in this lane.
