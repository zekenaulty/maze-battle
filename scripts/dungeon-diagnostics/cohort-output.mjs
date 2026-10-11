/** Preserve completed samples even when the next one crashes or times out. */
export function readCohortOutput(generator, processResult) {
  const result = { generator, status: 'complete', levels: [], seeds: [], rows: [], examples: [], probes: null, errors: [] };
  let started = false;
  let complete = false;
  const seen = new Set();
  for (const line of (processResult.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line);
      if (value.type === 'start' && !started && value.generator === generator) {
        result.levels = value.levels;
        result.seeds = value.seeds;
        started = true;
      } else if (value.type === 'sample' && started && !complete) {
        const { seed, level } = value.row;
        const key = `${seed}:${level}`;
        if (!result.seeds.includes(seed) || !result.levels.includes(level) || seen.has(key)) throw new Error('Invalid sample identity');
        seen.add(key);
        result.rows.push(value.row);
        if (value.example) result.examples.push(value.example);
      } else if (value.type === 'complete' && started && !complete) {
        result.probes = value.probes;
        complete = true;
      } else throw new Error('Unexpected cohort record');
    } catch (error) { result.errors.push(String(error)); }
  }
  if (!started || !complete || result.rows.length !== result.levels.length * result.seeds.length) result.errors.push('Incomplete cohort');
  if (processResult.error || processResult.status !== 0) result.errors.push(String(processResult.error ?? processResult.stderr ?? 'Worker failed'));
  if (result.rows.some(row => row.status === 'error')) result.errors.push('One or more sample errors');
  if (result.errors.length) result.status = 'failed';
  return result;
}
