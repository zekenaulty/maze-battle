import fs from 'node:fs';
import path from 'node:path';
import { RATES } from './budget.mjs';

export const GRANT_ID = 'owner-2026-10-24-fresh-usd4';
// Pinned factory permits one JSON repair; runner permits 48 refinements and 16 continuations.
export const MAX_WINDOW_CALLS = 2 * (1 + 48 + 16);
export const CALL_RESERVE_USD = (65536 * RATES.inputPerMillion + 4096 * RATES.outputPerMillion) / 1_000_000;
export const WINDOW_RESERVE_USD = MAX_WINDOW_CALLS * CALL_RESERVE_USD;

function price(attempts, sourceCalls) {
  if (!Array.isArray(attempts) || !Number.isSafeInteger(sourceCalls) || sourceCalls < attempts.length || sourceCalls > MAX_WINDOW_CALLS)
    throw Error('Window call accounting is not reconciled; reservation retained');
  let chargedUsd = (sourceCalls - attempts.length) * CALL_RESERVE_USD, unknownCalls = sourceCalls - attempts.length;
  for (const call of attempts) {
    if (!call || typeof call !== 'object') throw Error('Invalid retained provider attempt');
    const u = call.usage;
    if (call.terminal === 'completed' && Number.isSafeInteger(u?.promptTokens) && u.promptTokens >= 0
      && Number.isSafeInteger(u?.outputTokens) && u.outputTokens >= 0)
      chargedUsd += (u.promptTokens * RATES.inputPerMillion + u.outputTokens * RATES.outputPerMillion) / 1_000_000;
    else { unknownCalls++; chargedUsd += CALL_RESERVE_USD; }
  }
  return { chargedUsd, unknownCalls };
}

/** Persistent coordinator estimates, not an invoice or a provider-side billing fence. */
export class RepairGrant {
  constructor(file) {
    this.file = file; this.lock = `${file}.lock`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { fs.writeFileSync(this.lock, JSON.stringify({ pid: process.pid, grantId: GRANT_ID }), { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') throw Error('Another live-test coordinator or retained lock owns this grant'); throw error; }
    try {
      this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))
        : { schema: 1, grantId: GRANT_ID, approvedUsd: 4, windows: [] };
      if (this.state.schema !== 1 || this.state.grantId !== GRANT_ID || this.state.approvedUsd !== 4
        || !Array.isArray(this.state.windows)) throw Error('Invalid retained repair grant');
      this.snapshot(); this.save();
    } catch (error) { this.close(); throw error; }
  }
  save() {
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2)); fs.renameSync(temporary, this.file);
  }
  snapshot() {
    const ids = new Set();
    for (const w of this.state.windows) {
      if (!w || typeof w.id !== 'string' || !w.id || ids.has(w.id) || typeof w.output !== 'string'
        || w.reservedUsd !== WINDOW_RESERVE_USD) throw Error('Invalid retained grant window');
      ids.add(w.id);
      if (w.status === 'reserved' && w.chargedUsd === null) continue;
      if (!['settled', 'settled-with-conservative-unknowns'].includes(w.status)
        || !Number.isFinite(w.chargedUsd) || w.chargedUsd < 0) throw Error('Invalid retained grant charge');
      const expected = price(w.attempts, w.calls);
      if (Math.abs(expected.chargedUsd - w.chargedUsd) > 1e-10 || expected.unknownCalls !== w.unknownCalls)
        throw Error('Retained grant charge differs from original attempt accounting');
    }
    const committedUsd = this.state.windows.reduce((n, w) => n + (w.chargedUsd ?? w.reservedUsd), 0);
    if (!Number.isFinite(committedUsd) || committedUsd < 0) throw Error('Invalid cumulative grant charge');
    return { ...structuredClone(this.state), committedUsd, remainingUsd: this.state.approvedUsd - committedUsd };
  }
  reserve(id, output) {
    if (this.state.windows.some(w => w.id === id)) throw Error('Execution window was already reserved');
    if (this.snapshot().remainingUsd + 1e-10 < WINDOW_RESERVE_USD) throw Error('Fresh $4 grant cannot fund another bounded execution window');
    this.state.windows.push({ id, output, reservedUsd: WINDOW_RESERVE_USD, chargedUsd: null, status: 'reserved' });
    this.save();
  }
  settle(id, attempts, sourceCalls) {
    const window = this.state.windows.find(w => w.id === id);
    if (!window || window.status !== 'reserved') throw Error('Original reserved window is required');
    const { chargedUsd, unknownCalls } = price(attempts, sourceCalls);
    window.chargedUsd = chargedUsd; window.unknownCalls = unknownCalls;
    window.status = unknownCalls ? 'settled-with-conservative-unknowns' : 'settled';
    window.calls = sourceCalls; window.attempts = attempts; this.save();
  }
  close() {
    if (fs.existsSync(this.lock) && JSON.parse(fs.readFileSync(this.lock, 'utf8')).pid === process.pid) fs.unlinkSync(this.lock);
  }
}
