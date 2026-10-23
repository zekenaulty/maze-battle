# S4 Atomic Initialization Capacity Bound

Base: `c8a7f1852915faa11e5f3ad570780b9b5123e9a6`. Pure helper and focused
writer-size evidence only. No kernel, lifecycle, game initializer, schema, quota,
Auto, SDK or provider integration. No new authoritative store or world copy.

## API And Scope

`src/persistence/canonical/game/initializationCapacity.ts` exports:

```ts
INITIALIZATION_BOOT_POLICY = 'canonical-rpg-default-v1'
initializationCapacity({ floor: PreparationPublicBounds, bootPolicy })
// {
//   version: 'canonical-game-initialization-v1',
//   scope: 'initialization-and-floor', bootPolicy,
//   publicBirth: { recordsBytes, nodesBytes, budgetBytes },
//   privateFloor: PreparationCapacity, birthBytes, budgetBytes
// }
```

Inputs are copied and exact-field checked. Only floor 1 and the explicit default
boot-policy version are accepted. Floor bounds retain the existing public-recipe
validation; seed, world data, generic RosterState and extra fields refuse.
No RNG or storage is accessed. The tag is a calculator contract, not proof that
an arbitrary caller actually wrote the correct public boot values.

`publicBirth` is explicitly public roster/settings overhead, not private world
geometry. `privateFloor` is the existing preparation envelope, including its one
prospective immutable allocation-anchor allowance. `birthBytes` is that metadata
allowance plus bootstrap plus public birth; `budgetBytes` is the entire first
floor plus public birth. These are overlapping views, NOT additive allocations.
The head remains separate and charged once; schema-marker IO remains subject to
the existing work limits. Neither is silently reclassified as a private row.

## Fixed Public Producer

The actual `game/initialize.ts:createCanonicalGame` callback writes one settings
row, then `roster/write.ts:seedRoster` projects ten roster rows. Current defaults
come from `domain/party/factory.ts`, `domain/items/inventory.ts`,
`domain/items/inventoryPolicy.ts` and `game/settings.ts`.

| Rows | Record key length | Encoded value bytes | Index key length |
| --- | ---: | ---: | ---: |
| Settings | 13 | 33 | none |
| Party / pack | 12 / 11 | 162 / 60 | none |
| Stash / policy | 12 / 13 | 50 / 148 | none |
| Warrior / mage / healer | 57 / 54 / 56 | 500 / 522 / 484 | none |
| Health herb / mana vial / town portal | 48 each | 292 / 289 / 277 | 71 each |

Values include stored actor/item wrappers, strict optional-field omission and
UTF-8 item tokens. Actors have UUID36-plus-role identities; supplies have UUID36
identities, fixed common level-1 values, pack ownership and orders 1-3. Stash is
empty, pack capacity/gold are 36/35, and settings throttle is 500 ms.
The full policy golden also includes every hero stat, skill, flag and policy
value; it does not merely check record sizes. Only exact dynamic actor/item
identities are normalized in this test-only golden. Unexpected fields and
same-byte settings changes are demonstrated to change it.

`preparationRecordBytes` charges complete store/key/record wrappers with maximal
128-character game/generation identities, UUID36 references and maximal revision
width. For these fixed public rows the resulting ceiling is **9,865 B**. The
maximal-width complete-writer cases attain it exactly.

## Union Tree Argument

There are 11 primary paths plus 3 item-index paths, disjoint from the private
bootstrap's keys. The longest is 77 characters, including the `index/` wrapper
and 16-digit item-order component. Starting with empty roots, inserting each new
path into the private bootstrap trie adds at most two retained nodes and two
edges (a leaf and optional split parent). Existing ancestors are replaced while
pending; `rpgMemory/tree.ts:flush` retains them only once. Existing prefixes and
fixed-width references do not grow when ancestor identities change.

Thus 14 public paths add <=28 nodes and <=28 edges. Price every added node at
the full 77-character prefix with a value, even when actually valueless. Add the
maximal non-escaping edge charge, including node-witness duplication, using
`preparationNodeBytes(77, 2) - preparationNodeBytes(77, 1)`. This yields
**27,496 B** of public union-tree overhead. It covers shared-ancestor child growth
without attributing individual shared nodes to public or private work.

This proof requires one final flush and empty roots. It does not cover continuing
an existing game, an intermediate persisted tree, changed key/index grammar,
arbitrary boot inventory, extra observation/knowledge writes or extra anchors.

## Totals And Evidence

| Quantity | Bytes |
| --- | ---: |
| Public birth records + union tree | 37,361 |
| Birth including prospective anchor and private bootstrap | 1,478,056 |
| Entire first-floor envelope | 5,163,857 |
| Default floors 1-16 preparation plus public birth once | 239,493,859 |
| Remaining after 256 MiB less 8 MiB recovery and 12 KiB head | 20,540,701 |

**This is a sixteen-floor preparation-fit claim, not a sixteen-floor played
journey-fit claim.** The prior approximately 20-MiB retained samples measure
preparation writers only. Ordinary movement history and Agentica events consume
additional capacity. Meaningful native depth/travel, action IO and quota behavior
remain the separate S5 gate; no quota increase, reclamation or release of hidden
slack is proposed to force that gate to pass.

The harness intercepts only the lifecycle call and invokes the actual complete
`createCanonicalGame` initializer callback with real CanonicalPages and one
flush. No copied initializer callback is used. It separately runs the matching
private bootstrap writer to check union deltas. This is test-only in-memory
comparison, not a second production world representation.

Six cases use late-diverging, early-diverging and split-prefix UUID streams;
seeds 0, 42 and 4294967295; and normal/maximal wrapper widths. Wide cases inject
128-character game/generation IDs and maximal record revision only at the test
storage boundary. They are width proofs, not a claim genesis normally has that
revision. All run under unchanged work limits and refuse any backing-store read.

| Pattern / seed | Normal / wide record bytes | Normal / wide node bytes | Added nodes/edges | Wide union delta |
| --- | ---: | ---: | ---: | ---: |
| Late / 0 | 15,213 / 22,779 | 27,182 / 40,154 | 21 / 21 | 18,462 |
| Early / 42 | 15,468 / 23,325 | 27,718 / 40,966 | 21 / 21 | 18,392 |
| Split / 4294967295 | 14,377 / 21,652 | 26,050 / 38,470 | 22 / 22 | 19,228 |

These are actual logical appended record/node costs, not budget amounts or
physical IndexedDB bytes. Complete cases use 70-75 staged writes and zero retained
reads; maximum measured work bytes are 50,587. Head/schema/anchor/receipt writes
are not executed by this harness. Their prospective allowances are not a native
ledger qualification. Raw staged records/nodes, policy values, counters and bounds
are retained in `test-results/initialization-capacity/*.json`.

Qualification: **41 focused PASS** (17 new + 24 floor-helper regressions), 28.74 s;
root `tsc --noEmit` PASS. Final output is
`test-results/initialization-capacity-final.json`. The initial golden-capture run
is retained as `initialization-capacity-first.json`; its six failures were the
deliberate unset policy-hash placeholder, not bound overruns. No native, service,
provider or emitted build run was performed.

Commands:

```powershell
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-capacity.unit.config.ts src/persistence/canonical/game/initializationCapacity.test.ts src/persistence/canonical/game/initializationCapacity.writer.test.ts src/persistence/canonical/world/preparationCapacity.test.ts src/persistence/canonical/world/preparationCapacity.shapes.test.ts src/persistence/canonical/world/preparationCapacity.tree.test.ts src/persistence/canonical/world/preparationCapacity.generated.test.ts --reporter=default --reporter=json --outputFile=test-results/initialization-capacity-final.json
node node_modules/typescript/bin/tsc --noEmit
```

## Preparation With Populated Public Namespaces

Follow-up on `b5e1cba7a6ba9afe89cfa6c4efd824154355ce44`: two actual-writer
cases use seeds **42 and 781**, the split-prefix birth UUID stream and normal
wrappers. Each imports the actual complete initializer's retained records/nodes
into the existing preparation harness. A matching private-bootstrap snapshot
uses the same world identity, recipe, checkpoint and revision as the control.
No production helper, formula or work/storage bound changes.

Both prepare floors 1-16 to retain the real preceding tree. Assertions focus on
every phase at floors **1, 2 and 16**: 14 phase groups per seed, 28 total. Floor 1
bootstrap is already present and remains covered by the complete-birth tests
above. Each phase's record, node and receipt components fit the existing bounds;
call counts match. The harness still splits later bootstrap from first expansion
and flushes separately, conservatively retaining extra COW nodes.

| Seed / floor | Record bytes | Node bytes | Receipt bytes | Extra node bytes vs private-only |
| --- | ---: | ---: | ---: | ---: |
| 42 / 1 (after birth) | 70,901 | 218,874 | 9,550 | 10,084 |
| 42 / 2 | 100,240 | 348,368 | 13,651 | 14,380 |
| 42 / 16 | 369,985 | 1,985,390 | 49,604 | 51,102 |
| 781 / 1 (after birth) | 66,846 | 207,348 | 9,550 | 10,084 |
| 781 / 2 | 100,057 | 350,844 | 13,651 | 14,380 |
| 781 / 16 | 377,271 | 1,987,838 | 49,604 | 51,192 |

The shared-ancestor cost is measured, not assumed zero. Every selected phase
flushes a shared root/record ancestor. Its largest phase delta is **27,602 B**
in floor 16 generation; the larger actual node cost is **1,430,052 B**, below
that phase's unchanged **15,756,746 B** node bound. Focused per-call maxima are
226 reads and 121,032 read bytes, within the unchanged 256-read/1-MiB limits.
Preparation writes no roster/settings row. Point reads preserve every original
public record including its identity/value; the three pack index rows and roster
subtree witness also remain exact through each selected floor.

Raw costs are retained before bound assertions and again on failure/exit in
`test-results/initialization-capacity-populated/seed-{42,781}.json`: exact focused
phase components, controls, bounds/deltas, all intermediate per-call costs, work
counters, staged node prefixes, original public rows and birth root identities.
The paired tests pass independently (46.51 s); the combined cohort is **43 PASS**
in 46.77 s, with root `tsc --noEmit` PASS. Final suite output is
`test-results/initialization-capacity-populated-final.json`; the initial paired
run remains `initialization-capacity-populated-first.json`.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-capacity.unit.config.ts src/persistence/canonical/game/initializationCapacity.test.ts src/persistence/canonical/game/initializationCapacity.writer.test.ts src/persistence/canonical/game/initializationCapacity.preparation.test.ts src/persistence/canonical/world/preparationCapacity.test.ts src/persistence/canonical/world/preparationCapacity.shapes.test.ts src/persistence/canonical/world/preparationCapacity.tree.test.ts src/persistence/canonical/world/preparationCapacity.generated.test.ts --reporter=default --reporter=json --outputFile=test-results/initialization-capacity-populated-final.json
node node_modules/typescript/bin/tsc --noEmit
```

This closes the populated-default-namespace writer-size caveat for the declared
cohort, not a native integration gate. Storage is in memory, receipt wrappers
are synthesized, and the harness positions the checkpoint at the preceding
exit to prepare the next floor without playing a journey. Intermediate floors
are retained-tree setup, not new movement/depth evidence. No kernel allocation,
native ledger, quota rollback, service, provider or owner data was exercised.

## Required Integration Checks

- Capture the public boot inputs once before awaits, validate exact versioned
  policy values and write those same owned snapshots. Calling factories again,
  checking only the policy string, or checking only serialized lengths is not
  sufficient. Any producer/default drift requires policy review/versioning.
- Bind the immutable birth allocation to the initialization-and-floor scope and
  exact policy/recipe/source identity using the existing anchor contract. Reuse
  its metadata allowance; do not duplicate roster/world data or create a store.
- Measure actual additions, enforce the envelope atomically and retain raw IO.
  Keep public birth separate in the contract; later floor preparation receives
  no authority to rewrite public boot state. No allowance renewal on restore.
- Preserve lifecycle staging before destructive reset writes, fixed head charging,
  unchanged transaction limits and original funded recovery. Callback-free cleanup
  and exact replay must not depend on a fresh initialization-capacity calculation.
- The populated-default-namespace writer cohort above passes unchanged bounds.
  Native ledger, failure rollback and useful played endurance remain integration
  gates, not proven by these writer-size tests.
