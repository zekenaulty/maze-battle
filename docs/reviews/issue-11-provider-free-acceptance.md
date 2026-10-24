# Noncombat Agentic Play Acceptance

2026-10-24. **PASS: bounded provider-free qualification (M3).**
This report maps the existing goal to the bounded provider-free deliverable;
it does not authorize provider spending, close #11, merge, deploy, replace the
owner's preview or reset owner data. The umbrella goal remains active.

## Scope And Identity

The actual Maze Battle App, Manual, Auto and Agentic Play share GameSession,
canonical IndexedDB, ordinary movement and explicit interaction commands. The
qualification fixture supplies a deterministic planner, not a parallel game.
Combat is disabled for this vertical. Routine navigation executes locally under
the original authority; it does not require a model choice for every cell.

Production remains the exact `5125cbe` lineage. Subsequent S2/S5/S6 changes are
test fixtures and reports, not runtime, dependency or budget changes. The final
ledger composes compatible exact source identities rather than pretending every
command ran at one SHA. The [rolling ledger](issue-11-s6-qualification.md)
retains original failures, fixes, reruns and evidence locations.

Final integrated fixture candidate: `7e08f6d57cb717353236018dd3370812594a1653`.
The [47-gate ledger](issue-11-s6-gates.json) publishes exact result/source hashes.

- Frozen service source: Maze `60c1346df4091418b30f83eb4f18d9ff8e35dc7b`.
- Agentica: `27cb2ce9717438edfe19487e3920faa183112c97`, clean dedicated checkout.
- Browser SDK SHA-256, LF-normalized:
  `46d88c25bda57ee1371fc05209445f321dd3183e52f71a12abce221094a5a9dd`.
- Environment: Windows x64, Node 22.13.0, npm 11.6.2, TypeScript 6.0.3,
  Playwright 1.61.0, installed Chrome 155.0.8059.85.
- Actual-service builds use explicitly selected alternate .NET **10.0.401**.
  Agentica repository SDK pin **10.0.302 is not qualified** by these runs.

## Goal Mapping

| Slice | Delivered boundary and evidence |
| --- | --- |
| D0: construction diagnosis | Retained deterministic diagnostics identify forced chains, poor walkable density and growing fallback pressure. [Findings](../dungeon-d0-findings.md) and the reviewed [repair plan](../dungeon-d1-repair-plan.md) preserve the original review gate. |
| D1: branching socket construction | Versioned bounded module/room construction, reciprocal joins, role/safe-room preparation, structural qualification and honest capacity refusal. [Historical D1 qualification](d1-qualification.md) is source-specific; current canonical quality, world, role and generated-depth suites provide later regression evidence. No infinite-world claim. |
| A0: authority audit | [Original source map](a0-capability-authority-map.md) distinguishes engine knowledge, perception, navigation and voluntary effects. Its retired-store findings are historical, not current APIs. Canonical adoption and writer-retirement reports in the [plan](../canonical-persistence-plan.md) supersede them. |
| A1: actual-game host | Shared GameSession, earned projections, scoped room/map tools, retained destination execution, explicit interactions, original-attempt reconciliation, funded Stop and verified ACK. Manual/Auto/Agentica effect parity and known-destination regression use the same authoritative rules. |
| A2: earned exploration | Cold-start authored A/B starts with ordinary earned sight, chooses a bounded frontier, follows observed connections and yields on material evidence. On-demand detailed room versus room/connection map scopes remain separate; no persistent full-world context dump or hidden routing. [Corpus composition](issue-11-canonical-corpus.md), [room map](issue-11-room-map-integration.md), [S2](issue-11-s2-integration.md). |
| A3: deliberate retrieval and return | Explicit ordinary quest selection and collection, carried-item custody, earned entrance return and a separate host objective proof. Arrival alone is not completion; checking does not collect or award rewards. Final native objective-check 13/13 passes with source-bound observation integrity and execution-only historical replay. |
| Q: bounded qualification | Deduplicated exact-case manifest, actual App/service corpus, recovery cuts, information isolation, capacity/work limits, generated endurance, static/build and mobile/desktop checks pass. Exact source/terminal evidence reconciliation and independent closing audit find no blocking gap. |

Issue #11's owner-approved disposable-development-save boundary supersedes the
old goal's save-preservation wording. There are no fallback/migration stores;
failed-load recovery is explicit, and unresolved funded obligations prevent a
destructive reset. No owner database was reset by qualification.

## Gate Summary

| Gate | Result at this checkpoint |
| --- | --- |
| Clean locked install | PASS: 123 packages, checkout-local dependencies. Earlier DLL-lock/network attempts remain separate. |
| Root units | PASS: 5,017; one existing optional pinned-assembly digest proof skipped. It is not counted as passed. |
| Supplemental fixture units / Node audits | PASS: 20 / 46. |
| Frozen browser/service manifest | **1,575/1,575 PASS**: 1,521 native, including seven endurance, plus 54 actual-service. No duplicate credit for partial/retried runs. |
| Pinned actual-service full suite | PASS: 54/54, 44.4m, fresh build/provenance and zero skips/retries at `60c1346`. Earlier 53/1 and invalid-port attempts remain retained. |
| S5 generated endurance | PASS, bounded: seven cases, two seeds; retained depths 1/8/16; two separate 1,024-command histories; paged recall/returns and active two-tab transfer. [Method and limits](issue-11-generated-endurance.md). |
| Types / production build | PASS: frozen nine-project checks plus fresh parent root, broad canonical, App recovery and custody checks. Broad canonical types pass after the final objective integration. Fresh isolated output build passes; existing bundle warning retained. |
| Production visual/controls | PASS: desktop, phone portrait/landscape, nonblank canvas, fitting controls, no page errors/external requests; separate native desktop-wheel/phone-touch camera checks pass. Emulation is not physical-device certification. |
| Source compatibility | PASS at final `7e08f6d`: frozen 1,689 inputs unchanged, production/packages match baseline, SDK matches service provenance. All changed helper dependents rerun, including transport-review 11, corpus-navigation 2 and objective-check 13. |
| Independent closing evidence review | PASS at `7e08f6d`: no blocking delta or proof-integrity findings; all exact IDs/result hashes verified, objective attachments checked, source closure refreshed. Not an owner acceptance or historical D1 re-audit. |
| Paid live-model gate | NOT RUN, not authorized. Actual provider choices, usage, cost and latency require a separately bounded run. |

Local evidence roots are `test-results/s6-d57884d/`, `s6-2c67b31/`,
`s6-60c1346/` and `maze-start-service-NUOwKR/` in the isolated qualification
checkout, plus `test-results/s6-closeout-audit/` and the named parent repair runs.
The exact-case checker rejects missing/extra IDs, retries, skips, flaky results
and runner errors. Source closure is checked separately; a count alone is not
qualification. Raw evidence remains ignored local artifacts, not production data.

Final coverage SHA-256:
`7f4d7749a3183784de5e396ca4dc2cf86a14ab5e47c9c2bd73ae6c3aa297a8a5`.
Final source-audit SHA-256:
`086678ac851555e19e3db5fd77475b3c84745aa374d396688798242a90a61723`.
The existing optional unit skip is
`tests/agentica-service-custody-probe/manifest-digest/manifest-digest.proof.test.ts`,
the typed pinned-assembly digest comparison; it is explicitly not a passed gate.

## Limits And Next Gate

The generated samples are finite and separated. Retained depth setup is not a
played descent, history growth is not combined with every deep-floor sample,
and logical byte counters are not physical disk I/O. Native timings on a busy
machine are observations, not network/model latency benchmarks. The retained
128-seed route search did not find a native >64-step route; it proves neither
impossibility nor that unrun route. The actual off-window journey spans 22 steps.

Provider-free planners prove lawful composition and adaptation to available
affordances, not live model strategy. Full RPG parity, combat ownership, general
remote mechanisms, unlimited-world coverage and history compaction remain later
goals. Do not add them to this closeout to move the finish line.

All mandatory provider-free execution and reconciliation gates are complete.
Next is owner review and a separately authorized live-provider two-dungeon gate
with confirmed model and cumulative call/token/cost/time limits. Report its
choices and outcomes independently. The prior 8-16 focused-hour S6 estimate is
historical, not remaining work. The planned live setup/execution/report allowance
is 2-4 focused hours after authorization, excluding waiting and any demonstrated
repair. Owner review, live-model qualification, merge and deployment are distinct
decisions. No paid run has been started.
