// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryObjective } from '../../../services/agentica/game/objectiveContext';
import { assertLaunchGrant } from './launch.grant';
import { readPublication } from './publication';
import { prepareObjectiveProof, snapshotPreparedObjective } from './objective.prepare';
import { objectiveProof, validateObjectiveResult } from './objective.proof';
import { prepareAction } from './validation';
import { objectiveFixture } from './objective.adversarial.test-support';

vi.mock('./launch.grant', () => ({ assertLaunchGrant: vi.fn() }));
vi.mock('./publication', async original => ({ ...await original<typeof import('./publication')>(), readPublication: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
async function fixture(...args: Parameters<typeof objectiveFixture>) {
  const f = await objectiveFixture(...args);
  vi.mocked(assertLaunchGrant).mockImplementation(async () => structuredClone(f.authorized));
  vi.mocked(readPublication).mockImplementation(async (_pages, ref) => {
    if (JSON.stringify(ref) !== JSON.stringify(f.binding.publication)) throw Error('Missing root publication');
    return structuredClone(f.publication);
  });
  return f;
}

describe('objective context and prepared proof', () => {
  it.each([[null, 'active', false, false], ['pack', 'complete', false, true], ['stash', 'claimed', false, false],
    [null, 'complete', false, false], ['pack', 'claimed', true, false]] as const)(
    'projects only actual %s/%s custody and earned arrival (away=%s)', async (owner, status, away, satisfied) => {
      const f = await fixture(owner, status, away), checked = await queryObjective(f.tx, f.identity, f.binding);
      expect(checked.result.observation!.data).toMatchObject({ scope: 'objective', carried: owner === 'pack' ? 1 : 0,
        questStatus: status, atReturn: !away, status: satisfied ? 'satisfied' : 'pending' });
      expect(checked.result.completion).toEqual(satisfied ? { objectiveId: f.objective.objectiveId,
        evidenceId: checked.result.evidenceId, summary: 'Selected quest item is carried at the earned town entrance.' } : undefined);
      expect(snapshotPreparedObjective(checked.proof, f.identity, f.head)).toEqual(checked.proof);
      expect(await validateObjectiveResult(f.tx.pages, checked.proof, f.identity, f.pending, checked.result)).toEqual(checked.proof);
      expect(JSON.stringify(checked.result)).not.toContain(f.objective.quest.questId);
    });

  it.each(['unbound', 'old-scope', 'write-capability', 'required-field', 'wrong-scope'] as const)(
    'refuses %s before current domain reads', async defect => {
      const f = await fixture();
      if (defect === 'unbound') delete f.authorized.objective;
      if (defect === 'old-scope') f.authorized.capability.inputSchema.fields.find(field => field.name === 'scope')!.allowedValues = ['room'];
      if (defect === 'write-capability') f.authorized.capability.effect = 'writesLocalState';
      if (defect === 'required-field') f.authorized.capability.inputSchema.fields.push({ name: 'extra', type: 'string', required: true });
      const identity = defect === 'wrong-scope' ? await prepareAction({ ...f.identity.action, arguments: { scope: 'quests' } }) : f.identity;
      await expect(queryObjective(f.tx, identity, f.binding)).rejects.toThrow();
      expect(f.allGet).not.toHaveBeenCalled(); expect(f.sourceReceipt).not.toHaveBeenCalled();
    });

  it.each(['cloned', 'manufactured', 'mutated', 'other-action', 'other-fence'] as const)(
    'does not accept a %s prepared proof', async defect => {
      const f = await fixture(), checked = await queryObjective(f.tx, f.identity, f.binding);
      const proof = defect === 'cloned' ? structuredClone(checked.proof)
        : defect === 'manufactured' ? objectiveProof(checked.proof) : checked.proof;
      if (defect === 'mutated') proof.evidence.quest.status = 'claimed';
      const identity = defect === 'other-action' ? await prepareAction({ ...f.identity.action, actionId: 'other-action' }) : f.identity;
      const head = defect === 'other-fence' ? { ...f.head, revision: f.head.revision + 1 } : f.head;
      expect(() => snapshotPreparedObjective(proof, identity, head)).toThrow('not prepared');
    });

  it('preparation snapshots input identity, references and head before grant authorization yields', async () => {
    const f = await fixture(), original = structuredClone({ identity: f.identity, binding: f.binding, head: f.head });
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; }), grant = structuredClone(f.authorized);
    vi.mocked(assertLaunchGrant).mockImplementationOnce(async () => { await paused; return grant; });
    const pending = prepareObjectiveProof(f.tx, f.identity, f.binding);
    Object.assign(f.identity.action, { actionId: 'changed' }); f.binding.publication.id = 'changed'; f.head.gameId = 'changed';
    release(); const checked = await pending;
    expect(snapshotPreparedObjective(checked.proof, original.identity, original.head)).toEqual(checked.proof);
    expect(checked.proof.publication).toEqual(original.binding.publication);
  });

  it('context snapshots caller identity across preparation awaits', async () => {
    const f = await fixture(), original = structuredClone(f.identity);
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; }), grant = structuredClone(f.authorized);
    vi.mocked(assertLaunchGrant).mockImplementationOnce(async () => { await paused; return grant; });
    const pending = queryObjective(f.tx, f.identity, f.binding);
    Object.assign(f.identity.action, { actionId: 'changed-during-await' }); release();
    expect((await pending).result.actionId).toBe(original.action.actionId);
  });
});

describe('historical objective proof validation', () => {
  it('revalidates only root/admission sources and not current quest, inventory, knowledge or live grant', async () => {
    const f = await fixture(), checked = await queryObjective(f.tx, f.identity, f.binding);
    f.records.clear(); f.knowledge.records.clear(); vi.mocked(assertLaunchGrant).mockRejectedValue(Error('No current grant'));
    const pages = { sourceReceipt: f.tx.pages.sourceReceipt, get: vi.fn(async () => { throw Error('No current reads'); }),
      savedSnapshot: vi.fn(async () => { throw Error('Publication boundary is mocked'); }) };
    expect(await validateObjectiveResult(pages, checked.proof, f.identity, f.pending, checked.result)).toEqual(checked.proof);
    expect(pages.get).not.toHaveBeenCalled(); expect(pages.savedSnapshot).not.toHaveBeenCalled();
  });

  it.each(['root', 'admission', 'objective', 'quest', 'game', 'arrival', 'data', 'completion'] as const)(
    'rejects retained %s tampering', async defect => {
      const f = await fixture(), checked = await queryObjective(f.tx, f.identity, f.binding);
      if (defect === 'root') checked.proof.publication.id = 'missing';
      if (defect === 'admission') checked.proof.admissionAttemptId = 'missing';
      if (defect === 'objective') {
        const binding = f.admission.input as { binding: { start: { objectiveId: string } } }; binding.binding.start.objectiveId = 'wrong-objective';
      }
      if (defect === 'quest') Object.assign(checked.proof.evidence.quest.quest, { key: 'quest/wrong-quest' });
      if (defect === 'game') checked.proof.evidence.gameId = 'wrong-game';
      if (defect === 'arrival') checked.proof.evidence.arrival!.id = 'wrong-observation';
      if (defect === 'data') checked.result.observation!.data.status = 'pending';
      if (defect === 'completion') checked.result.completion!.objectiveId = 'wrong-objective';
      await expect(validateObjectiveResult(f.tx.pages, checked.proof, f.identity, f.pending, checked.result)).rejects.toThrow();
    });

  it.each(['observe', 'refused', 'missing-proof'] as const)('does not accept arbitrary completion for %s', async kind => {
    const f = await fixture(), checked = await queryObjective(f.tx, f.identity, f.binding);
    const identity = kind === 'observe' ? await prepareAction({ ...f.identity.action, capabilityId: 'maze.observe', arguments: {} }) : f.identity;
    if (kind === 'refused') checked.result.disposition = 'refused';
    await expect(validateObjectiveResult(f.tx.pages, undefined, identity, f.pending, checked.result)).rejects.toThrow();
  });
});
