import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { createWorldFloor } from '../../src/persistence/canonical/world/generation';
import { json } from '../../src/persistence/canonical/world/records';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { prepare, work } from './canonical-content-fixture';
import { initializeCorpus } from './canonical-corpus.initialize';
import { CORPUS_SEED } from './canonical-corpus.layout';

/** Storage-depth setup before the first App sight. No actor relocation or knowledge writes. */
export async function initialize(depth: number) {
  if (![1, 16].includes(depth)) throw Error('Only the two qualification depths are supported');
  await initializeCorpus('A', 'revisit-genesis');
  const before = (await readCanonicalHead()).head;
  for (let level = 2; level <= depth; level++) {
    await work(async tx => json(await createWorldFloor(tx.pages,
      createModuleRecipe('canonical-survey', level, CORPUS_SEED + level - 1))));
    await prepare(level);
    await work(async tx => {
      await tx.pages.set('world', `game/preparation/${level}`, { schema: 1, level, phase: 'ready' });
      return {};
    });
  }
  const after = (await readCanonicalHead()).head;
  if (JSON.stringify(before.checkpoint) !== JSON.stringify(after.checkpoint)
    || before.roots.knowledge !== after.roots.knowledge || after.checkpoint.knowledge !== null)
    throw Error('Retained-floor setup changed actor knowledge or checkpoint');
  return { depth, checkpoint: after.checkpoint, knowledgeRoot: after.roots.knowledge, revision: after.revision };
}
