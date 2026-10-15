export const serviceOrigin: string;
export function fixtureEnvironment(): Record<string, string>;
export interface ServiceProof {
  source: string; processId: number; created: number; entered: number; cancelled: number;
  paidProviderCalls: number; emittedActions: number;
}
export class ServiceProcess {
  constructor(dll: string | undefined, storage: string | undefined, log: string | undefined);
  start(): Promise<ServiceProof>;
  stop(): Promise<void>;
  restart(): Promise<ServiceProof>;
}
