import assert from 'node:assert/strict';

export function validateCompletion(record) {
  const final = record.final;
  assert.equal(final.questItems.length, 1, 'Exactly one quest-item stack');
  assert.equal(final.questItems[0].quantity, 1, 'Exactly one objective item');
  assert.deepEqual(final.checkpoint.position, record.setup.position, 'Returned to the original entrance');
  assert.equal(final.chest.chest.opened, true, 'Ordinary chest opened');
  assert.equal(final.quest.quest.status, 'complete', 'Ordinary quest objective complete');
  const replies = record.wire.sent.filter(x => x.frame.type === 'action.result').map(x => x.frame.payload);
  const completion = replies.findLast(x => x.completion);
  assert.equal(completion?.observation?.data?.status, 'satisfied', 'Host-proven objective completion');
  return { status: 'SATISFIED', position: final.checkpoint.position, completion };
}
