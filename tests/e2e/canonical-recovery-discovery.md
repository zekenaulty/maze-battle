# Canonical Recovery Discovery

Base: Maze `174ec2dd7a0f40559a372dcafea8978b345e58c2`.
Provider-free native Chromium/IndexedDB qualification on isolated port 5270.
Existing GameSession and canonical writers create fixture evidence; service
replies are synthetic. This does not qualify a service, provider or mounted App.

## API

Import both operations from `src/persistence/canonical/agentica/recovery.ts`:

- `listAgenticaRecovery({ signal? })`: validated current fence, active root,
  selected pair and its immediate predecessor locator, and at most 16 local
  allocation rows. Navigation rows carry their exact original reference and
  reserve-source binding. Other allocation rows have `navigation: null`.
- `inspectAgenticaRecovery(fence, candidate, { signal? })`: inspect one explicit
  navigation locator. Revalidate its original action/result, grant, terminal,
  intent/claim and any committed ACK. Reject a changed fence or original binding.
  An acknowledged candidate must still be the selected immediate predecessor;
  this is not an arbitrary history browser.

Inventory is discovery, not a validated navigation ACK or an execution grant.
Inspection uses the public terminal validator, including historical ACK revision
cuts, without replacing originals with the current selected binding.
Both APIs report `pendingRemoteActions: 'unknown'` and `sessionClear: 'unknown'`.
Pending-only actions are not enumerated. Empty allocations never certify remote
quiescence. No caller should infer adoption permission from either response.

The opener guard aborts creation/upgrade and holds an existing current-schema
connection for the query lifetime. No new game, schema migration, history scan,
remote lookup, publication, selection, wake, Stop or ACK is performed.

## Checks

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-recovery-discovery.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-recovery-discovery.config.ts
```

The native cohort checks absent/legacy schema preservation, empty and pending-only
states, all 16 allocations at exhausted ordinary quota, exact action/binding,
reload and historical ACK, stale owner/revision and a write between inventory
transactions, captured input mutation, missing/corrupt source evidence, and
successive windows with constant source lookup counts beyond the fixed context.
Read audits compare every canonical store, require readonly transactions and
forbid history scans. HTTP beyond fixture assets and all WebSockets are blocked.
