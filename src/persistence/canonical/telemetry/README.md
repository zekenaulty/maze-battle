# Canonical gameplay trace

Internal diagnostics only, never gameplay authority, earned knowledge or an Agentic capability.
`readGameplayTelemetry(snapshot)` requires a pinned canonical snapshot and returns at most 64
chronological facts. Older games with no header have an empty trace. No migration or repair is implicit.

The execution-area header and fixed slots commit atomically with gameplay. Manual saves restore
world/knowledge, not this trace: its revisions describe committed chronology, including abandoned
save branches, not lifetime totals for the currently restored world. Exact receipt replay adds nothing.
Ordinary cooldown waits, unchanged commands and stale intents add nothing; entering a stall pause does.

Actor HP/MP/XP/level/gold are named before/after values, not gross damage, healing or XP-earned metrics.
Actor gold is separate from the inventory wallet. Pending reward values are before/after the action;
walletGoldDelta and lootAwardCount describe actual victory payout. Loot counts count award instances,
not quantities or newly occupied slots. Trigger and returnMode are not controller identity claims.

Bounds: 64 slots, each complete record at most 4096 bytes, plus a header at most 1024 bytes.
Read: one header plus at most 64 exact slot gets. Append: at most three gets and two record sets
(canonical index-node IO is additional and charged to the existing work budget). No history scan.
This bounds the current readable trace, NOT physical compaction: immutable superseded records/nodes
still consume the existing canonical quota. No new archive, pruning authority or provider traffic exists.
