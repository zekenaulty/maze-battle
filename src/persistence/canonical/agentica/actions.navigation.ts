import type { AgenticaResult } from '../../../services/agentica/contracts';
import type { NavigationCommit } from '../navigation/host';
import { operationActionHooks } from './actions.operation';
import type { PreparedAction } from './types';

export function navigationActionHooks(identity: PreparedAction,
  resultFor: (view: NavigationCommit) => AgenticaResult | Promise<AgenticaResult>) {
  return operationActionHooks(identity, 'navigation', resultFor);
}
