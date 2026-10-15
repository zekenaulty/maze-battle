function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
export type RemoteMethod = 'connect' | 'list' | 'signal' | 'wake' | 'adopt' | 'stop-decision';
export type HostStage = 'intent' | 'claim' | 'grant' | 'reserve' | 'cleanup';
export type BarrierPoint = `${RemoteMethod | HostStage | 'prewake-read'}:${'before' | 'after'}`;

/** Explicit entry/release promises, never sleeps or fake IndexedDB transaction scheduling. */
export class ControllerBarriers {
  private readonly gates = new Map<BarrierPoint, { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> }>();
  hold(point: BarrierPoint) {
    if (this.gates.has(point)) throw Error(`Barrier already held: ${point}`);
    this.gates.set(point, { entered: deferred(), released: deferred() });
  }
  async hit(point: BarrierPoint) {
    const gate = this.gates.get(point); if (!gate) return;
    gate.entered.resolve(); await gate.released.promise; this.gates.delete(point);
  }
  entered(point: BarrierPoint) {
    const gate = this.gates.get(point); if (!gate) throw Error(`Missing barrier: ${point}`);
    return gate.entered.promise;
  }
  release(point: BarrierPoint) {
    const gate = this.gates.get(point); if (!gate) throw Error(`Missing barrier: ${point}`);
    gate.released.resolve();
  }
  releaseAll() { for (const gate of this.gates.values()) gate.released.resolve(); }
}
