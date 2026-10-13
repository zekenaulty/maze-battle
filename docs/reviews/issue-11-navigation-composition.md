# Issue 11: Navigation Transaction Composition

2026-10-13. Follow-up to `4b642cf`, informed by the protocol audit read from
`427e48c:docs/reviews/issue-11-agentica-adoption-audit.md`. This implements a
bounded host composition API, not the canonical SDK adapter or its activation.
Production edits stay under `canonical/navigation/`; no new kernel, GameSession,
App, SDK, operation-state-machine, or reservation-policy changes.

## Composition API

`executeNavigationCommand(request, { signal?, host? })` accepts a trusted
`NavigationHostHooks` object, exported from `navigation/commands.ts`:

```ts
interface NavigationHostHooks {
  prepare(view: NavigationPreparation): Promise<void>;
  commit(view: NavigationCommit): Promise<NavigationHostRefs>;
}
```

The same API handles funded `operation.admit`, one-tile `navigation.advance`, and
funded `operation.settle`. These still enter the original canonical admission /
execution / settlement functions. No caller-provided operation can replace their
reservation and live-owner/epoch validation. Admission does not settle navigation.

1. `prepare` runs inside that transaction, before navigation effects. It can
   validate retained action/run/grant/publication sources and the cancellation
   gate. Metadata (`head`, `request`, `operation`, `receiptRef`) is cloned.
2. Navigation stages its existing effects and exact progress record.
3. `commit` receives the resulting `progress` and `checkpoint`, plus the same
   metadata/readers. It appends exact action-result/event records with
   `appendExecution(key, jsonValue)` and returns `{ actionResult?, event? }`.
4. Navigation includes those refs in `receipt.result.host`. Movement, observation,
   progress, host records, operation ledger changes, and the receipt commit together.

Both hooks expose `getExecution`, `savedSnapshot`, `sourceReceipt`, `liveOperation`, and a
knowledge-only `KnowledgeRead` facade. No world writes, hidden-world reads,
checkpoint setter, restore, raw database, or independent transaction is exposed.
Hooks may await only transaction work, never timers/network/provider operations.
`head` remains the BEFORE head; `commit.checkpoint` is the AFTER checkpoint,
including the exact newly earned observation. Settlement's operation context is
the validated admitted row; `request` names the proposed settlement disposition.

Append is create-only, has no indexes, and rejects the navigation namespace.
At most eight records may be appended per hook, under existing record/work/quota
bounds. Return refs must exactly match records appended by THIS hook invocation:
`{ key, recordId, revision, sourceAttemptId, recordWitness }`. The witness binds
the full immutable record body; each reference is capped at 12 KiB and the whole
receipt retains the existing 16 KiB bound. The enclosing receipt supplies
generation/game identity. Auxiliary chunks may be linked from those root records.
The hook cannot return fabricated or earlier records as newly committed effects.

Errors, caught capability failures, unawaited work, oversized settlement, or native
write failures abort the whole transaction. Exact replay returns the old complete
receipt without invoking either hook, even with different supplied hooks later.
Protocol records must therefore retain original payloads/sources before dispatch;
never regenerate a result under an existing action/event ID after reconciliation.

Refs identify exact immutable records; this layer does not define SDK payload
schemas or their content digests. The protocol layer must validate original full
action identities, payload bytes/digests, source refs, event ordering and delivery.
It also owns when hooks are required: plain local navigation remains supported.
Do not call GameSession and then perform a second SDK-result write.

## Publication Tokens

No wire `expectedRevision` field is added to navigation. The outer request uses
the current canonical fence. The protocol hook maps its retained publication token
and compares the appropriate world/knowledge roots, checkpoint, identity and
grant/custody. Execution-only bookkeeping need not invalidate that publication.
Actual commit revisions remain separate; the hook's `receiptRef` is
`{ generation, gameId, attemptId }`, usable as a committed receipt only on success.

## Terminal And Cancellation Proof

Use `readDestinationTerminal(id)`, or `loadDestinationTerminal(pages, id)` inside
one existing canonical read. Its `.value` contains a version-1 stable proof:
`operationId`, `disposition`, exact retained `progress`, and `admission`,
`progressSource`, `terminal`, each with the original `{ ref, receipt, source }`.

This validates kernel custody sources, navigation provenance, terminal ordering,
cancellation result shape or settled usage. The value contains no refreshed owner,
current observation, new clock, event ID or mutable acknowledgement state. It is
identical after later takeover/acknowledgement/reload. The read envelope's current
head/snapshot are NOT part of deterministic cancellation projection.

Cancel and acknowledge still use `operateCanonical` directly, with NO hooks or
ordinary outbox write. Project versioned event/result bytes from the cancellation
receipt (stable attempt ID and committed timestamp), retained action/event refs
in admission/progress receipts, and original cumulative usage. Pass the exact
`terminal.ref.attemptId` to kernel acknowledgement after protocol reconciliation.
Corruption fails proof reads closed but does not introduce a prerequisite outbox
write for cancellation. No SDK-specific cancellation event schema is invented here.

## Evidence And Limits

- Native Chrome/IndexedDB on 5222: **56 passed**, including 20 new composition /
  terminal cases. Covers all three atomic phases, result-write failure, immutable
  replay, publication/bookkeeping distinction, hook capability bounds, reservation
  fences, oversized and at-quota settlement, and zero-write cancellation projection
  at normal quota after owner change, acknowledgement, and reload.
- Canonical/destination-policy unit run: **326 passed / 16 files**.
- Full project and navigation-fixture TypeScript: **PASS**.
- No network/paid provider calls; non-5222 fixture HTTP requests are blocked.

Reproduce with the existing `canonical-navigation.config.ts`, the canonical unit
command and TypeScript commands in [the navigation report](issue-11-canonical-navigation.md).
This does not qualify SDK start/wake ambiguity, parked decisions, delivery/ACK,
provider usage accounting, protocol digest validation, or application recovery.
Parent retains Auto/integration ownership; no incomplete client is mounted.

The later [canonical action-binding increment](issue-11-agentica-records.md)
adds guarded snapshot reads and record witnesses to this API. The 56 native
navigation cases pass again after that extension and the mutable-input repairs.
