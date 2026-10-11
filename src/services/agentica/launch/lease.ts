/** One live launcher per origin. Taking a lease never resumes an old execution. */
export async function claimLaunchLease(): Promise<() => void> {
  if (!navigator.locks) throw new Error('Web Locks are required for exclusive launch ownership.');
  return new Promise((resolve, reject) => {
    void navigator.locks.request('maze-agentica-launch', { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('Another launch tab owns this test. Close it before recovering here.')); return; }
      await new Promise<void>(release => resolve(release));
    }).catch(reject);
  });
}
