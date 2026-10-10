import * as actions from '../../src/persistence/expeditionActionRepository';
import * as repository from '../../src/persistence/expeditionRepository';
import { durableFixture, durableOutcome, durableRequest } from '../../src/persistence/expeditionAction.testSupport';
import type { ExpeditionActionRequest } from '../../src/domain/expedition/protocol';

const slot = 'durable-fixture';
const harness = {
  actions, repository, slot, fixture: durableFixture, outcome: durableOutcome, request: durableRequest,
  async setup(maxActions = 16) {
    const record = durableFixture();
    await repository.saveExpedition(slot, record.plan, record.checkpoint, null);
    await actions.claimExpeditionSession(slot, 'owner-a', null, maxActions);
    return record;
  },
  async execute(request: ExpeditionActionRequest) {
    const begun = await actions.beginExpeditionAction(slot, request);
    if (begun.status === 'existing') return begun.receipt;
    return actions.settleExpeditionAction(slot, request, durableOutcome(begun, request));
  },
};

declare global { interface Window { durable: typeof harness } }
window.durable = harness;
