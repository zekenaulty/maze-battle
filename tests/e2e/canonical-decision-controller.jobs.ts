export type JobResult = { status: 'pending' } | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; error: string };

/** Keep rejected async hooks observable without leaking unhandled browser rejections. */
export class ControllerJobs {
  private readonly jobs = new Map<number, { result: JobResult; settled: Promise<void> }>();
  begin(work: () => Promise<unknown>) {
    const id = this.jobs.size + 1, job = { result: { status: 'pending' } as JobResult, settled: Promise.resolve() };
    this.jobs.set(id, job);
    job.settled = Promise.resolve().then(work).then(value => { job.result = { status: 'fulfilled', value }; },
      error => { job.result = { status: 'rejected', error: String(error) }; });
    return id;
  }
  result(id: number) {
    const job = this.jobs.get(id); if (!job) throw Error(`Missing fixture job ${id}`);
    return structuredClone(job.result);
  }
  async wait(id: number) {
    const job = this.jobs.get(id); if (!job) throw Error(`Missing fixture job ${id}`);
    await job.settled; return this.result(id);
  }
}
