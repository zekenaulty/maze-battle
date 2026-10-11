const OWNER_KEY = 'maze-directed-controller-v1';
let owner: Promise<string> | undefined;

/** A reload can reuse its token only when no other document holds it. */
export function directedDocumentController(): Promise<string> {
  // Document lifetime, not React mount lifetime (including StrictMode remounts).
  return owner ??= acquire();
}

async function acquire(): Promise<string> {
  let id = sessionStorage.getItem(OWNER_KEY);
  if (!navigator.locks) {
    // Without presence arbitration, copied storage must never restore custody.
    id = crypto.randomUUID();
  } else if (!id || !await hold(id)) {
    id = crypto.randomUUID();
    if (!await hold(id)) throw new Error('Unable to establish document custody. Reload to retry.');
  }
  sessionStorage.setItem(OWNER_KEY, id);
  return id;
}

function hold(id: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    void navigator.locks.request(`maze-battle:directed-controller:${id}`, { ifAvailable: true }, lock => {
      resolve(Boolean(lock));
      // Browser destruction releases this lock. No copied storage can release it.
      return lock ? new Promise<void>(() => {}) : undefined;
    }).catch(reject);
  });
}
