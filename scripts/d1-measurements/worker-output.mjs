export function parseWorker(cohort, processResult) {
  const result = { cohort, status: 'complete', manifest: [], rows: [], errors: [] };
  let ended = false;
  let started = false;
  const seen = new Set();
  for (const line of (processResult.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line);
      if (value.type === 'start' && !started && value.cohort === cohort && Array.isArray(value.manifest)) {
        result.manifest = value.manifest;
        if (new Set(value.manifest).size !== value.manifest.length) throw new Error('Duplicate manifest identity');
        started = true;
      } else if (value.type === 'row' && started && !ended && result.manifest.includes(value.row?.id) && !seen.has(value.row.id)) {
        seen.add(value.row.id);
        result.rows.push(value.row);
      } else if (value.type === 'complete' && started && !ended) {
        ended = true;
      } else throw new Error('Unexpected worker record');
    } catch (error) { result.errors.push(String(error)); }
  }
  for (const id of result.manifest) if (!seen.has(id)) {
    result.rows.push({ id, status: 'infeasible', reason: 'Worker ended before recording this fixture; timeout/heap/process failure, not a product capacity result' });
  }
  if (!started || !ended) result.errors.push('Incomplete worker protocol');
  if (processResult.error || processResult.status !== 0) result.errors.push(String(processResult.error ?? processResult.stderr ?? 'Worker failed').slice(-2000));
  if (result.rows.some(row => row.status === 'error')) result.errors.push('One or more fixture errors');
  if (result.errors.length) result.status = 'failed';
  else if (result.rows.some(row => row.status !== 'complete')) result.status = 'partial';
  return result;
}
