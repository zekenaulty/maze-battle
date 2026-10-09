// @vitest-environment node
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import type { CellAddress } from '../expedition/types';
import { createDirectedFixture } from './fixture';
import type { AnchorProposal, InspectionDisclosure, InspectionReceipt } from './futureContracts';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import type { DirectedCommand, DirectedRequest, NavigationTarget } from './operationTypes';
import { observeDirected } from './perception';
import { DIRECTED_LIMITS, DIRECTED_VERSION } from './types';
import type { DirectedSpace } from './types';
import { canTraverseDirected, moveDirectedWorld } from './world';

interface Corpus {
  version: string; directedVersion: string; acceptanceRevision: string; contractsRevision: string;
  identities: { worldId: string; floorId: string; observerId: string };
  budgets: { steps: number; replans: number; cells: number; bytes: number };
  coordinates: { xIncreases: string; zIncreases: string; column: string; row: string };
  spaces: DirectedSpace[];
  positions: { id: string; global: [number, number]; local: CellAddress }[];
  reservedOnly: Record<string, { footprint: AnchorProposal['footprint']; materialized: boolean }>;
  prelude: {
    globalPath: [number, number][]; localPath: [string, number, number][];
    events: number; observations: number; worldRevision: number; knowledgeRevision: number;
    materializedCells: number; rememberedCells: number; providerCalls: number;
    coverage: { radius: number; basis: string; complete: boolean };
    observedFootprints: Record<string, [number, number, number][]>;
  };
  examples: { implementationLevel: string; runtimeQualified: boolean; inspectionReceipts: InspectionReceipt[];
    anchorProposal: AnchorProposal; impossibleAnchorProposal: AnchorProposal };
  cases: Record<string, { implementationLevel: string; runtimeQualified: boolean; scope: string; expectedNegativeOutcomes: string[] }>;
}

const source = readFileSync(new URL('../../../docs/fixtures/directed-corpus-v1.json', import.meta.url), 'utf8');
const corpus: Corpus = JSON.parse(source);

describe('NS0 versioned proof corpus', () => {
  it('pins the corpus, accepted schemas, bounded budgets and explicit qualification levels', () => {
    expect(corpus.version).toBe('ns0-corpus-v1');
    expect(corpus.directedVersion).toBe(DIRECTED_VERSION);
    expect(corpus.acceptanceRevision).toBe('reviewed-architecture-v0.2');
    expect(corpus.contractsRevision).toBe('fddbb48');
    expect(source.trimEnd().split(/\r?\n/).length).toBeLessThanOrEqual(200);
    const { steps, replans, cells, bytes } = DIRECTED_LIMITS;
    expect(corpus.budgets).toEqual({ steps, replans, cells, bytes });
    expect(corpus.budgets).toEqual({ steps: 64, replans: 4, cells: 512, bytes: 65536 });
    expect(Object.keys(corpus.cases)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
    for (const entry of Object.values(corpus.cases)) {
      expect(entry.runtimeQualified).toBe(false);
      expect(entry.scope.length).toBeGreaterThan(0);
      expect(entry.expectedNegativeOutcomes.length).toBeGreaterThanOrEqual(3);
    }
    for (const id of ['C2', 'C3', 'C5']) expect(corpus.cases[id].implementationLevel).toBe('contract-example-only');
    for (const id of ['C1', 'C4', 'C7']) expect(corpus.cases[id].implementationLevel).toBe('fixture-domain-proof');
    expect(corpus.cases.C6.implementationLevel).toBe('integration-acceptance-only');
    expect(corpus.examples).toMatchObject({ implementationLevel: 'contract-example-only', runtimeQualified: false });
  });

  it('maps every materialized coordinate and identity to the actual fixture, excluding reserved footprints', () => {
    const { session: { world, actor } } = createDirectedFixture();
    expect(corpus.identities).toEqual({ worldId: world.id, floorId: world.floorId, observerId: actor.id });
    expect(corpus.coordinates).toEqual({ xIncreases: 'east', zIncreases: 'south', column: 'x - originX', row: 'z - originZ' });
    expect(corpus.spaces).toEqual(Object.values(world.spaces));
    const addresses: string[] = [];
    for (const space of corpus.spaces) {
      for (let row = 0; row < space.rows; row++) for (let column = 0; column < space.columns; column++) {
        const local = { spaceId: space.id, row, column };
        expect(world.cells[addressKey(local)].address).toEqual(local);
        addresses.push(addressKey(local));
      }
    }
    expect(addresses.sort()).toEqual(Object.keys(world.cells).sort());
    for (const position of corpus.positions) {
      const space = world.spaces[position.local.spaceId];
      expect(position.local.column).toBe(position.global[0] - space.originX);
      expect(position.local.row).toBe(position.global[1] - space.originZ);
      expect(position.local).toEqual(position.id === actor.id ? actor.position : world.features[position.id].position);
    }
    for (const { footprint, materialized } of Object.values(corpus.reservedOnly)) {
      expect(materialized).toBe(false);
      for (const { address } of Object.values(world.cells)) {
        const space = world.spaces[address.spaceId];
        const x = space.originX + address.column, z = space.originZ + address.row;
        expect(x >= footprint.x && x < footprint.x + footprint.width && z >= footprint.z && z < footprint.z + footprint.depth).toBe(false);
      }
    }
    expect(world.spaces.A).toBeUndefined();
    expect(addresses).toHaveLength(corpus.prelude.materializedCells);
    expect(addresses.length).toBeLessThanOrEqual(corpus.budgets.cells);
  });

  it('replays the exact legal corpus prelude and independently matches its observed footprints', () => {
    const { session, observations, events } = createDirectedFixture();
    const path = corpus.prelude.localPath.map(([spaceId, row, column]) => ({ spaceId, row, column }));
    let world = { ...structuredClone(session.world), revision: 0 };
    let actor = { id: corpus.identities.observerId, position: path[0] };
    let knowledge = emptyDirectedKnowledge(world.id, actor.id);
    expect(events).toHaveLength(corpus.prelude.events);
    expect(observations).toHaveLength(corpus.prelude.observations);
    expect(events.map(event => event.position)).toEqual(path.slice(1));
    expect(path.map(position => {
      const space = world.spaces[position.spaceId];
      return [space.originX + position.column, space.originZ + position.row];
    })).toEqual(corpus.prelude.globalPath);
    for (let index = 0; index < path.length; index++) {
      if (index) {
        expect(canTraverseDirected(world, actor.position, path[index])).toBe(true);
        const moved = moveDirectedWorld(world, actor, path[index]);
        expect(moved.event).toEqual(events[index - 1]);
        ({ world, actor } = moved);
      }
      const receipt = observeDirected(world, actor, knowledge, 'prelude');
      expect(receipt).toEqual(observations[index]);
      expect(receipt.coverage).toEqual(corpus.prelude.coverage);
      knowledge = rememberDirected(knowledge, receipt);
    }
    const footprint = Object.entries(corpus.prelude.observedFootprints).flatMap(([spaceId, rows]) => rows.flatMap(
      ([row, first, last]) => Array.from({ length: last - first + 1 }, (_, offset) => addressKey({ spaceId, row, column: first + offset }))));
    expect([...new Set(observations.flatMap(receipt => receipt.scene.cells.map(cell => addressKey(cell.address))))].sort()).toEqual(footprint.sort());
    expect(Object.keys(knowledge.cells).sort()).toEqual(footprint);
    expect(footprint).toHaveLength(corpus.prelude.rememberedCells);
    expect(world.revision).toBe(corpus.prelude.worldRevision);
    expect(knowledge.revision).toBe(corpus.prelude.knowledgeRevision);
    expect({ world, actor, knowledge }).toEqual({ world: session.world, actor: session.actor, knowledge: session.knowledge });
    expect(events.length).toBeLessThanOrEqual(corpus.budgets.steps);
    expect(corpus.prelude.providerCalls).toBe(0);
  });

  it('matches exact InspectionReceipt union examples without implementing a perception evaluator', () => {
    const results: InspectionDisclosure[] = [
      { grade: 'undetected' },
      { grade: 'suspicious', cue: 'An irregular seam in the passage floor.', direction: 'east' },
      { grade: 'detected', featureId: 'T', properties: { kind: 'trap' } },
      { grade: 'examined', featureId: 'T', properties: { kind: 'trap', trigger: 'pressure plate' }, actionableDetail: ['Avoid the center plate.'] },
    ];
    const examples = results.map((result, index) => ({
      id: `example:inspection:${index}`,
      request: { attemptId: `example:inspect:${index}`, observerId: 'P1', policyVersion: 'ns0-inspection-example-v1',
        effectivePerception: index, conditions: { range: 1, occluded: false, conditionTags: [], deliberate: index === 3 } },
      result, coverage: { completed: true, omissions: [] }, evidenceIds: [`example:evidence:${index}`],
    } satisfies InspectionReceipt));
    expect(corpus.examples.inspectionReceipts).toEqual(examples);
    expect(createDirectedFixture().observations.flatMap(receipt => receipt.scene.features).some(feature => feature.id === 'T')).toBe(false);
  });

  it('matches exact AnchorProposal examples and proves only the negative footprint conflict, not admission', () => {
    const proposal = {
      id: 'example:anchor:altar', floorId: 'F1', purpose: 'Reserve the future altar room, not materialize it.',
      footprint: { x: 20, z: 0, width: 5, depth: 5 },
      constraints: { connections: ['H'], generationPermissions: ['request:gap:x13..19:z2'] },
      provenance: { sourceId: 'ns0-corpus-v1', revision: 'reviewed-architecture-v0.2' },
    } satisfies AnchorProposal;
    const impossible = {
      ...proposal, id: 'example:anchor:overlap', purpose: 'Negative example overlapping immutable occupied Hall H.',
      footprint: { x: 8, z: 0, width: 5, depth: 5 }, constraints: { connections: ['H'], generationPermissions: [] },
    } satisfies AnchorProposal;
    expect(corpus.examples.anchorProposal).toEqual(proposal);
    expect(corpus.examples.impossibleAnchorProposal).toEqual(impossible);
    expect(proposal.footprint).toEqual(corpus.reservedOnly.altar.footprint);
    const hall = createDirectedFixture().session.world.spaces.H;
    expect(impossible.footprint).toEqual({ x: hall.originX, z: hall.originZ, width: hall.columns, depth: hall.rows });
    expect(corpus.cases.C5).toMatchObject({ impossibleAnchor: {
      proposalId: impossible.id, conflictsWith: 'H', expected: 'not-admitted', materialized: false,
    } });
  });

  it('pins unavailable destination, stale door, lost-ack and cancel negative acceptance examples', () => {
    const target = { kind: 'cell', address: { spaceId: 'A', row: 2, column: 2 }, arrival: 'occupy' } satisfies NavigationTarget;
    expect(corpus.cases.C4).toMatchObject({
      unavailableDestination: { target, expected: 'unavailable-from-actor-knowledge' },
      staleRememberedDoor: { featureId: 'D', rememberedState: 'locked', hostState: 'open',
        observerAt: { spaceId: 'L', row: 2, column: 2 }, afterRemoteLook: 'locked', afterLocalLook: 'open' },
    });
    const request = { attemptId: 'example:step:1', owner: 'example:owner', epoch: 0, expectedRevision: 17,
      command: { type: 'step', operationId: 'example:operation:1', sequence: 1 } } satisfies DirectedRequest;
    const command = { type: 'cancel', operationId: 'example:operation:1' } satisfies DirectedCommand;
    expect(corpus.cases.C6).toMatchObject({
      lostAcknowledgement: { request, fault: 'acknowledgement-dropped-after-commit', retry: 'identical-request-and-attempt',
        expected: { sameReceipt: true, additionalEffects: 0 } },
      cancel: { command, expectedOperationStatus: 'cancelled', expectedFurtherSteps: 0, committedEffects: 'retained' },
    });
    expect(corpus.cases.C3).toMatchObject({ remoteAudio: { grantsDoorState: false, grantsCausalLink: false } });
  });
});
