# Accepted Quest Context

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-20.
This is a bounded continuation of the [source audit](issue-11-quest-context-boundary.md),
not the completed quest-return loop or final qualification.

## Implemented Boundary

The existing `maze.inspect` capability now supports explicit journal queries:

```json
{"scope":"quests","status":"active"}
{"scope":"quests","status":"active","cursor":"<returned opaque continuation>"}
{"scope":"quest","target":"<returned opaque selection>"}
```

Status can be `active`, `complete` or `claimed`. Lists are restricted to the
publication's current floor and accepted quests. Initial actor context remains
small and contains no journal. No new capability, automatic query, acceptance,
claim, inventory mutation or interaction is implicit in a navigation action.

The dedicated canonical reader verifies the accepted status index, quest and
contract records. It cannot read room geometry, target chests, awards, inventory
or hidden topology. Queries inspect at most four index candidates at a time,
with explicit local ceilings of 32 world reads and 128 KiB logical read data.
These are logical bounds, not physical disk measurements.

Lists expose title, status, objective/noun, progress/requirement and gold reward.
Explicit detail adds the accepted description, target's display name, acceptance
and completion/claim times when present, plus display item name or monster tags.
Raw quest/origin/target/item identifiers and collectible tokens never enter these
DTOs. A display name does not establish an earned route or target address.

## Selection, Replay and Authority

Opaque selectors contain only the publication, original action reference and
row ordinal. A cursor selects the next page from an original result. Private
quest-record membership and index positions live in the canonical execution
result, covered by its existing immutable source receipt. They are not part of
the SDK observation or result. There is no separate journal store or writer.

New reads require the retained publication's world, knowledge and checkpoint.
Selectors must resolve through exact original query/result receipts under the
same grant and publication. Invalid selection fails explicitly; corruption is
not reinterpreted as an empty journal. Original replies can still replay their
exact retained bytes after the world or owner changes, without refreshing facts.

The original byte limits remain: 3584-byte start, 4096-byte operation binding,
2800-byte observation and 4096-byte result. Large pages continue after the last
returned row. An individual record that cannot fit is explicitly refused,
never silently truncated or skipped. Only `maze.inspect` permits eight schema
fields; other capabilities retain their six-field limit.

Narrow/old grants do not acquire either new scope. Required fields, status,
cursor and target allowlists are enforced locally as well as through the service.
The private query proof is copied before asynchronous source reads, preventing
trusted-caller alias mutation from changing its retained membership.

## Qualification Record

The candidate runtime was committed at `f0e7527`, after the accepted reader
`e97bacc`. The [native fixture report](../../tests/e2e/canonical-agentica-quests.report.md)
records the independently tested 18-case initial cohort and its exact evidence
limits.

An initial sixth-capability design exceeded the existing launch/binding budget;
it was rejected rather than raising that budget. The narrower inspection scopes
measure 3491-3517 bytes for the checked 512-character ASCII start variants.
Existing multibyte/escaping overflow tests remain.

Review reproduced four failures in narrowed-grant enforcement and mutable
private-proof ownership; the fixes include those regressions and partial-page
multibyte continuation coverage. An initial service test reached the journal,
detail and parked navigation actions, then its read-only audit used concurrent
canonical reads. The fixture was corrected to read serially; runtime transaction
guards were not weakened. Its failed trace is retained at
`test-results/maze-start-service-JjzWJO/`.

The first full unit run had 4048 PASS, 31 FAIL and one existing optional SKIP
(`test-results/accepted-quest-full-unit.json`). All failures came from the
pending-action HTTP recovery reader's old six-field inspection cap. The reader
now accepts the same eight inspection fields as launch validation, with tests
that preserve six fields for other tools and reject changed bindings. The
post-repair focused run passed 256 tests in 13 suites. The first successful
actual-service journal run is `test-results/maze-start-service-1i0zQQ/`; it does
not replace the full integrated qualification below.

## Integrated Evidence

Runtime and fixtures pinned at `05fe98f`:

- Full unit run: **4088 PASS / one existing optional SKIP**, zero failures.
  `test-results/accepted-quest-full-unit-final.json`.
- Native IndexedDB/GameSession journal cohort: **18 PASS**, zero failures,
  retries or skips, 48.54s.
  `test-results/canonical-agentica-quests-final/results.json`.
- Complete operation-browser regression: **120 PASS**, zero failures, retries
  or skips, 208.67s. `test-results/accepted-quest-operation-final.json`.
- Complete actual-App/pinned-Agentica service cohort: **33 PASS**, zero failures,
  retries or skips, 353.08s. `test-results/maze-start-service-wP4Eyc/` retains
  exact source/assembly hashes, wire and HTTP traffic, screenshots and service log.
  This includes previous navigation, explicit chest, Continue, adoption,
  lost-reply, reload, restart and funded Stop/ACK cases.
- The actual service emitted manifest
  `sha256:cb6cb478e1c34ed7e214bc00279e309a8655c3d2e6c6c7701ab6edeadb8bf73a`,
  matching the JavaScript digest. Agentica remains clean/pinned at `27cb2ce`;
  the isolated build uses cached SDK 10.0.401, not repository-pin 10.0.302 proof.
  The offline injected planner cannot invoke a paid provider. This is not
  billing telemetry or LLM decision-quality evidence.
- Production/fixture typechecks and production build: **PASS**.
  `test-results/accepted-quest-build-final.log`. Existing bundle-size warning:
  778.50 KB main JavaScript, 236.87 KB gzip.
- Built preview smoke on port 5198: fresh isolated browser context, no page
  errors, nonblank canvas and no horizontal document overflow at 1280x800 and
  390x844. After resize, canvas backing dimensions are 1272x689 and 382x548.
  Screenshots: `test-results/accepted-quest-preview-1280.png` and
  `test-results/accepted-quest-preview-390.png`. The owner database was untouched;
  this is not a claim about an uninspected existing browser save.

## Remaining Work

Accepted quests are now available for explicit reasoning, but acceptance itself
is still an ordinary shared-game setup action in this proof. The offline service
planner reads a journal page and one returned detail, then parks on the original
earned tile. That third action is only a custody/decision check: it is not travel,
collection, a meaningful return, reward payment or objective completion.

Next, bind an explicit ordinary-quest objective to actual carried-item custody
and an earned return destination; prove a nonzero return under the same canonical
game and durable protocol. Guild claim needs its own explicit eligibility and
exact-once reward boundary. Do not equate ordinary quest progress, arrival,
navigation ACK or a planner statement with host-proven completion.

Sustained exploration, observation-driven intention revision, full two-dungeon Q
and broader depth/revisit/capacity qualification remain open. No paid-provider
gate is authorized or claimed. Issue #11 and the umbrella goal remain open.
