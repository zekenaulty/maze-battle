import type { GameSession } from '../../src/services/game/GameSession';
import { captureHostCommand, type CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { HostCleanupError, type CanonicalRecoveryPort } from '../../src/services/game/CanonicalHostRecovery';
import { ControllerBarriers, type HostStage } from './canonical-decision-controller.barriers';
import { failRootWrite } from './canonical-decision-controller.fault';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

const stages: Record<string, HostStage> = { 'agentica.operation.decision': 'intent',
  'agentica.operation.decision-claim': 'claim', 'agentica.decision.grant': 'grant', 'agentica.action.reserve': 'reserve' };
export interface HostCall { operation: string; input: unknown; receipt?: unknown; failedRequest?: CanonicalRequest }

/** Instrument the actual session queue; never emulate a canonical write or grant. */
export class ControllerPort implements CanonicalHostPort, CanonicalRecoveryPort {
  readonly calls: HostCall[] = [];
  readonly session: GameSession;
  readonly barriers: ControllerBarriers;
  failNextStage: 'grant' | 'cleanup' | null = null;
  loseNextCleanupReply = false;
  constructor(session: GameSession, barriers: ControllerBarriers) { this.session = session; this.barriers = barriers; }
  get hostSignal() { return this.session.hostSignal; }
  submitHostCommand: CanonicalHostPort['submitHostCommand'] = async input => {
    const command = captureHostCommand(input), operation = command.kind === 'fresh' ? command.operation : command.request.operation;
    const call: HostCall = { operation, input: structuredClone(command.kind === 'fresh' ? command.input : command.request) };
    this.calls.push(call); const stage = stages[operation];
    if (stage) await this.barriers.hit(`${stage}:before`);
    const fail = stage === this.failNextStage && this.failNextStage !== null; if (fail) this.failNextStage = null;
    const receipt = await (fail ? failRootWrite(() => this.session.submitHostCommand(command)) : this.session.submitHostCommand(command));
    call.receipt = structuredClone(receipt);
    if (stage) await this.barriers.hit(`${stage}:after`);
    return receipt;
  };
  cleanupHostOperation: CanonicalRecoveryPort['cleanupHostOperation'] = async (command, signal) => {
    const call: HostCall = { operation: `cleanup.${command.kind}`,
      input: structuredClone('verify' in command ? { ...command, verify: undefined } : command) };
    this.calls.push(call); await this.barriers.hit('cleanup:before');
    try {
      const fail = this.failNextStage === 'cleanup'; if (fail) this.failNextStage = null;
      const result = await (fail ? failRootWrite(() => this.session.cleanupHostOperation(command, signal))
        : this.session.cleanupHostOperation(command, signal)); call.receipt = structuredClone(result);
      await this.barriers.hit('cleanup:after');
      if (this.loseNextCleanupReply) {
        this.loseNextCleanupReply = false;
        throw new HostCleanupError(result.request, Error('Fixture lost cleanup reply after native commit'));
      }
      return result;
    } catch (error) {
      if (error instanceof HostCleanupError) call.failedRequest = structuredClone(error.request);
      throw error;
    }
  };
}
