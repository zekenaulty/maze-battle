import type { AgenticaHost, AgenticaHostOptions, AgenticaMessage, HostDecisionAdoption, HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { ControllerBarriers, type RemoteMethod } from './canonical-decision-controller.barriers';
import { DecisionRemote } from './canonical-decision-controller.remote';

type Sdk = Pick<AgenticaHost, 'connect' | 'close' | 'listOperations' | 'signalOperation' | 'wakeOperation' | 'adoptDecision' | 'stopDecision'>;
export interface SdkCall { connection: number; method: RemoteMethod | 'close'; input: unknown; observed?: unknown }
export class DecisionSdkFixture {
  readonly barriers = new ControllerBarriers();
  readonly calls: SdkCall[] = [];
  readonly options: AgenticaHostOptions[] = [];
  readonly remote: DecisionRemote;
  private readonly observe: () => Promise<unknown>;
  constructor(remote: DecisionRemote, observe: () => Promise<unknown>) { this.remote = remote; this.observe = observe; }
  private async call<T>(connection: number, method: RemoteMethod, input: unknown, work: () => T | Promise<T>) {
    this.calls.push({ connection, method, input: structuredClone(input), observed: await this.observe() });
    await this.barriers.hit(`${method}:before`);
    const value = await work(); await this.barriers.hit(`${method}:after`); return value;
  }
  factory = (options: AgenticaHostOptions): Sdk => {
    const connection = this.options.push(options) - 1;
    const wake = async (event: HostOperationEvent, adoption?: HostDecisionAdoption) => {
      const frozenEvent = structuredClone(event), frozenAdoption = adoption && structuredClone(adoption);
      const started = await this.call(connection, adoption ? 'adopt' : 'wake', { event: frozenEvent, adoption: frozenAdoption ?? null }, () => {
        const reply = this.remote.wake(frozenEvent, frozenAdoption);
        options.onMessage?.({ protocolVersion: 1, type: 'started', requestId: 'fixture-wake', runId: reply.runId, payload: reply });
        if (this.remote.fastState) this.emit({ protocolVersion: 1, type: 'outcome', runId: reply.runId,
          payload: { status: this.remote.fastState } }, connection);
        return reply;
      });
      if (this.remote.loseWakeReply) { this.remote.loseWakeReply = false; throw Error('Fixture lost committed wake reply'); }
      return started;
    };
    return {
      connect: () => this.call(connection, 'connect', null, () => { options.onStatus?.({ state: 'connected' }); }),
      close: () => { this.calls.push({ connection, method: 'close', input: null }); },
      listOperations: request => this.call(connection, 'list', { hostId: request.hostId, sessionId: request.sessionId }, () => this.remote.list()),
      signalOperation: event => this.call(connection, 'signal', event, () => this.remote.signal(event)),
      wakeOperation: event => wake(event), adoptDecision: (event, adoption) => wake(event, adoption),
      stopDecision: event => this.call(connection, 'stop-decision', event, () => this.remote.stop(event)),
    };
  };
  emit(message: AgenticaMessage, connection = this.options.length - 1) { this.options[connection].onMessage?.(structuredClone(message)); }
}
