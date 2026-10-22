import { describe, expect, it } from 'vitest';
import { readTownReturn } from './townReturn';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { blockKey, observationKey } from './keys';
import { awayCell, cells, header, memory, refuses, returnFixture, townCell } from './townReturn.test-support';

describe('town return evidence refusals', () => {
  it('refuses absent knowledge without any I/O', async () => {
    const f = knowledgeFixture();
    await refuses(f, /requires earned observation/); expect(f.reads).toEqual([]);
  });

  it('does not search later history when the initial observation has no town stair', async () => {
    const f = knowledgeFixture(); await f.observe([awayCell()]); await f.observe([townCell()]); await f.observe([awayCell()]);
    await refuses(f, /initial observation has no town return/);
  });

  for (const key of [observationKey(1), `${observationKey(1)}/0`]) it(`refuses missing original source ${key}`, async () => {
    const f = await returnFixture(); f.records.delete(key);
    await refuses(f, /missing|replaced/);
  });

  it('refuses a replaced original source identity', async () => {
    const f = await returnFixture(); f.records.get(observationKey(1))!.id = crypto.randomUUID();
    await refuses(f, /observation integrity evidence changed/);
  });

  for (const away of [false, true]) it(`refuses ambiguous town addresses (${away ? 'initial' : 'current'})`, async () => {
    const f = knowledgeFixture(), other = { ...earnedCell(0, 0, 'other'), stairs: ['town'] as const };
    await f.observe([townCell(), { ...other, stairs: [...other.stairs] }]);
    if (away) await f.observe([awayCell()]);
    await refuses(f, /ambiguous town return/);
  });

  for (const away of [false, true]) it(`refuses duplicate source addresses (${away ? 'initial' : 'current'})`, async () => {
    const f = knowledgeFixture(); await f.observe([townCell(), awayCell()]);
    if (away) await f.observe([awayCell()]);
    cells(f)[1] = structuredClone(cells(f)[0]);
    await refuses(f, /observation chunk integrity changed/);
  });

  it('refuses an initial town flag from a foreign floor', async () => {
    const f = knowledgeFixture(), foreign = townCell(); foreign.at.level = 2;
    await f.observe([foreign]); await f.observe([awayCell()]);
    await refuses(f, /source is not floor 1/);
  });

  it('refuses a foreign cell mixed into an otherwise floor-1 source', async () => {
    const f = await returnFixture(); cells(f)[0].at.level = 2;
    await refuses(f, /observation coverage|foreign observation level/);
  });

  it('refuses a later observed removal of the remembered town stair', async () => {
    const f = await returnFixture(false); await f.observe([{ ...f.town, stairs: [] }]); await f.observe([awayCell()]);
    await refuses(f, /not supported by current memory/);
  });

  for (const defect of ['missing', 'facts', 'source', 'future'] as const) it(`refuses ${defect} current memory`, async () => {
    const f = await returnFixture();
    if (defect === 'missing') f.records.delete(blockKey(f.town.at));
    if (defect === 'facts') memory(f).stairs = [];
    if (defect === 'source') memory(f).source.id = crypto.randomUUID();
    if (defect === 'future') memory(f).source.sequence = f.checkpoint().knowledge!.sequence + 1;
    await refuses(f, /not supported|source evidence|missing or replaced|ahead/);
  });

  for (const away of [false, true]) it(`refuses an oversized ${away ? 'initial' : 'current'} observation`, async () => {
    const f = await returnFixture(away); header(f).count = 114;
    await refuses(f, /exceeds cell bound/);
  });

  it('refuses a changed knowledge witness or current actor', async () => {
    const f = await returnFixture(), checkpoint = f.checkpoint();
    checkpoint.knowledge!.witness = 'changed';
    await expect(readTownReturn(f.pages, checkpoint)).rejects.toThrow('knowledge namespace');
    checkpoint.knowledge = f.checkpoint().knowledge; checkpoint.position.cell.spaceId = 'changed';
    await expect(readTownReturn(f.pages, checkpoint)).rejects.toThrow('differs from current position');
  });

  it('validates checkpoint shape and limits before I/O', async () => {
    const f = await returnFixture(); f.reads.length = 0;
    for (const patch of [{ extra: true }, { activityLog: Array(13).fill('x') }, { position: { level: 0, cell: f.town.at.cell } }])
      await expect(readTownReturn(f.pages, { ...f.checkpoint(), ...patch })).rejects.toThrow();
    expect(f.reads).toEqual([]);
  });
});
