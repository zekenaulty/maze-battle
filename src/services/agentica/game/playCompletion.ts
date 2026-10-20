import { actionFingerprint, actionKey, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';

export function completionMessage(outcome: boolean, unconfirmed: boolean) {
  if (unconfirmed) return 'Host objective satisfied. Service delivery is unconfirmed. Retained cleanup still requires Stop.';
  return outcome ? 'Host objective satisfied; Agentica outcome received. Retained cleanup still requires Stop.'
    : 'Host objective satisfied. Stop remains available for retained cleanup.';
}

/** Seal execution, not the socket or the canonical grant's retained cleanup custody. */
export function completionHooks(hooks: AgenticaHostOptions): AgenticaHostOptions {
  let sealed = false;
  return { ...hooks,
    async saveAction(key, input) {
      const record = structuredClone(input);
      if (record.status === 'completed') {
        // Persistence after onAction only verifies the already committed result, even after withdrawal.
        check(equal(await hooks.loadAction(key), record), 'Play cannot manufacture a committed result');
        if (record.result?.completion) sealed = true;
        return;
      }
      check(!sealed, 'Host objective completion sealed fresh action admission');
      await hooks.saveAction(key, record);
    },
    async onAction(input) {
      const action = structuredClone(input);
      if (sealed) {
        const record = await hooks.loadAction(actionKey(action));
        check(record?.status === 'completed' && record.fingerprint === actionFingerprint(action) && record.result,
          'Host objective completion sealed fresh action execution');
        return structuredClone(record.result);
      }
      const result = await hooks.onAction(action);
      if (result.completion) sealed = true;
      return result;
    },
  };
}
