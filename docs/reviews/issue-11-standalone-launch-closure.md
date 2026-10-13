# Issue #11: Standalone Launch Store Closure

Baseline: parent `e779e5a`, merged as `df8a848` with an identical tree. Read the
retirement map and selected one complete authority closure: the unmounted
`maze-agentica-launch` v1 launcher. This is not retirement of canonical launch,
directed v1, topology/stream storage, or the old RPG Agentica client.

## Exact Closure

The pre-edit TypeScript import graph included value/type imports, re-exports,
import types, literal dynamic imports and mocks. Neither this launch family nor
`persistence/directed/` was reachable from `src/main.tsx`, including type edges.
The only import into `services/agentica/launch/` from outside that directory was
`tests/e2e/launch-scenario-fixture.ts:1` -> `launch/scenario.ts`.
Including its exclusive fixture/spec/configs gives zero incoming edges.

Removed 14 files as one unit:

- `src/services/agentica/launch/{journal,lease,session}.ts`: sole DB opener and
  reader/writer of `journal` key `active`, coalescing writer, same-name Web Lock,
  and unmounted session/controller. No hook or mounted UI caller remains.
- `launch/{configuration,telemetry,scenario}.ts`: exclusive provider defaults,
  Lab metadata/feed/usage adapter and seed-55 three-room preparation writer.
  The scenario also wrote to the existing topology/stream repositories; those
  repositories have other consumers and are not deleted here.
- `launch/{configuration,scenario,session}.test.ts`: exclusive old journal,
  controller and scenario tests. No relocation of the old format or validators.
- `tests/e2e/launch-scenario-{fixture.html,fixture.ts}` and
  `launch-scenario.{spec.ts,config.ts,vite.config.ts}`: the exclusive executable
  native fixture, tests, selector and server configuration.

Post-edit AST relative-path/string scan has zero references to deleted files.
`rg` over `src`, `tests`, `scripts`, package/config files and `.gitignore` found
no remaining old launch path, symbol, fixture selector or `maze-agentica-launch`
reference. Historical docs/README are unchanged, not executable callers.
No migration, compatibility adapter or physical database cleanup was added.

## Retained Invariants And Boundaries

- Vendored SDK, `directed/wire.ts` exact comparison, `rpg/network.ts` bounded
  fetch and `clientPolicy.ts` endpoint/deferred helpers are unchanged. They have
  live canonical and/or retained RPG/general/directed consumers outside this
  closure. No shared network helper was deleted or replaced by launcher code.
- Endpoint rejection remains in `services/agentica/client.test.ts` and current
  canonical launch validation. Exact wire and client start/cancel/ambiguity
  assertions remain in `directed/wire.test.ts`, `client.lifecycle.test.ts` and
  the retained RPG suites. Launch-only defaults, feed truncation/coalescing and
  old journal shapes are retired requirements, not portable invariants.
- The scenario's reusable earned-route/no-loot/limits assertions already live
  in canonical navigation planner/validation and native navigation tests, and
  retained directed adapter/executor suites. Its fixed seed, room target menu
  and 4,000-command preparation recipe are not canonical contracts. No new
  legacy fixtures or speculative invariant ports were needed.
- Canonical radix, D1 module generators, canonical/game code, GameSession, App,
  `services/agentica/game` and old RPG Agentica semantics are untouched.
- `services/agentica/contracts.ts` still imports `StreamControl` for the old
  `AgenticaGameBinding`. That coupling does not block this closure; it remains
  unchanged. Any later generic-contract split needs parent coordination first.

## Verification

- `npm run build`: PASS, project typecheck and production Vite bundle.
- `npm test -- src/services/agentica src/persistence/canonical src/persistence/rpgMemory src/domain/expedition/topology/modules src/domain/directed src/services/expedition/directed`:
  PASS, 1,125 tests / 67 files.
- `npx tsc -p tests/e2e/canonical-launch.tsconfig.json`: PASS.
- Existing canonical launch Playwright config: 65 tests / 5 files collected;
  the complete native suite was not rerun.
- Ad hoc native smoke: PASS in a fresh Chromium context, using only a temporary
  in-process Vite server on `127.0.0.1:5222` and current exported canonical APIs.
  Checked admission/dispatch, read-only reload, exact admission/dispatch replay
  before and after terminal acknowledgement, rejection of a new dispatch,
  funded cancel/ACK and zero remaining reservations. Browser IDB instrumentation
  allowed only `maze-battle`; no obsolete DB opens occurred. All non-5222 HTTP
  requests were blocked and none were attempted. No network client/provider was
  started. This is local persistence evidence, not mounted-client qualification.
- Smoke browser/server closed; no remaining listener on 5222. Parent/preview
  services were not used. `git diff --check`: PASS.

## Next Separate Unit

`maze-battle-directed-v1` remains a candidate, not a blocker for this commit.
Its external import users are the mixed `domain/directed/{inspection,
inspectionReview,sourceArchive.review}` tests and directed storage/crossing/
history/deadline fixtures. Those need their own pure-assertion disposition and
complete fixture/config closure before deletion. This increment deliberately
stops after the smaller standalone launcher store is fully closed.
