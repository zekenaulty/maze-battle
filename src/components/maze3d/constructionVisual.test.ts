// @vitest-environment node
import { expect, it } from 'vitest';
import { planRoomConstruction, clipConstructionMembers } from '../../domain/construction/roomPlan';
import { constructionTimberGeometry } from './constructionVisual';

it('renders visibility cuts without invented end grain and retains the same longitudinal UV phase', () => {
  const plan = planRoomConstruction({ id: 'render', seed: 42, rows: 5, columns: 5, purpose: 'empty' });
  const member = plan.members.find(m => m.role === 'joist')!, middle = (member.min[0] + member.max[0]) / 2;
  const fragment = clipConstructionMembers(plan, [{ min: member.min, max: [middle, member.max[1], member.max[2]] }]).find(f => f.memberId === member.id)!;
  const full = constructionTimberGeometry(member), cut = constructionTimberGeometry(member, fragment);
  expect(cut.ends.index!.count).toBe(full.ends.index!.count / 2);
  for (const geometry of [full.sides, cut.sides]) {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) if (Math.abs(normal.getX(i)) < .5) expect(uv.getY(i)).toBeCloseTo(position.getX(i) / 1.6, 5);
  }
  [full.sides, full.ends, cut.sides, cut.ends].forEach(g => g.dispose());
});
