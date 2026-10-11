import { describe, expect, it } from 'vitest';
import { readCohortOutput } from './cohort-output.mjs';
import { renderReport } from './render.mjs';
const start = { type: 'start', generator: 'ordinary', levels: [1, 2, 3], seeds: [42] };
const sample = level => ({ type: 'sample', row: { seed: 42, level, status: 'complete' } });
const output = records => records.map(x => JSON.stringify(x)).join('\n');

describe('D0 failure evidence', () => {
  it('retains the completed prefix on timeout and truncated output', () => {
    const result = readCohortOutput('ordinary', { stdout: output([start, sample(1), sample(2)]) + '\n{"type":', status: null, error: 'timeout' });
    expect(result.status).toBe('failed');
    expect(result.rows.map(x => x.level)).toEqual([1, 2]);
  });
  it('retains identified sample errors and later successful samples', () => {
    const result = readCohortOutput('ordinary', { stdout: output([start, sample(1),
      { type: 'sample', row: { level: 2, seed: 42, status: 'error', error: 'fixture' } }, sample(3), { type: 'complete', probes: {} }]), status: 0 });
    expect(result.rows).toHaveLength(3);
    expect(result.status).toBe('failed');
  });
  it('rejects duplicate identities rather than faking full coverage', () => {
    const result = readCohortOutput('ordinary', { stdout: output([start, sample(1), sample(1), sample(3), { type: 'complete' }]), status: 0 });
    expect(result.status).toBe('failed');
    expect(result.rows).toHaveLength(2);
  });
  it('renders a current failure artifact even without example maps', () => {
    const failed = readCohortOutput('ordinary', { stdout: '', status: 1, stderr: 'failed fixture' });
    expect(renderReport({ sourceHead: 'current-head', cohorts: [failed] })).toContain('FAILED');
    expect(renderReport({ sourceHead: 'current-head', cohorts: [failed] })).toContain('failed fixture');
  });
});
