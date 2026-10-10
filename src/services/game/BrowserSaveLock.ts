/** Presence hint only. IndexedDB owner/epoch/revision checks remain authoritative. */
export class BrowserSaveLock {
  held = false;
  private finish?: () => void;
  private generation = 0;
  private readonly lost: () => void;
  constructor(lost: () => void) { this.lost = lost; }

  get supported() { return typeof navigator !== 'undefined' && !!navigator.locks; }

  async acquire(steal = false): Promise<boolean> {
    if (this.held) return true;
    if (!this.supported) return false;
    const generation = ++this.generation;
    return new Promise(resolve => {
      void navigator.locks.request('maze-battle:auto', steal ? { steal: true } : { ifAvailable: true }, async lock => {
        if (!lock || generation !== this.generation) { resolve(false); return; }
        this.held = true;
        const released = new Promise<void>(done => { this.finish = done; });
        resolve(true);
        await released;
      }).catch(() => {
        resolve(false);
        if (generation === this.generation) { this.held = false; this.finish?.(); this.finish = undefined; this.lost(); }
      });
    });
  }

  release() {
    this.generation++;
    this.held = false;
    this.finish?.();
    this.finish = undefined;
  }
}
