type V = [number, number, number];
const sub = (a: V, b: V): V => a.map((v, i) => v - b[i]) as V;
const dot = (a: V, b: V) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vector = (a: any): a is V => Array.isArray(a) && a.length === 3 && a.every(n => Number.isFinite(n) && Math.abs(n) <= 128);
function check(ok: unknown, reason: string): asserts ok { if (!ok) throw Error(`Invalid workshop geometry: ${reason}`); }
const axes: V[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** Separating axes for the convex solid and a clearance box; a shared boundary is permitted. */
export function intersectsClearance(mesh: any, bounds: { min: V; max: V }) {
  const points = mesh.positions as V[], candidates = [...axes];
  const box: V[] = Array.from({ length: 8 }, (_, i) => [0, 1, 2].map(axis => (i >> axis & 1) ? bounds.max[axis] : bounds.min[axis]) as V);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.slice(i, i + 3).map((j: number) => points[j]);
    const ab = sub(b, a), ac = sub(c, a); candidates.push(cross(ab, ac));
    for (const edge of [ab, ac, sub(c, b)]) for (const axis of axes) candidates.push(cross(edge, axis));
  }
  return !candidates.some(axis => {
    const length = Math.hypot(...axis); if (length < 1e-10) return false;
    const unit = axis.map(n => n / length) as V, a = points.map(p => dot(p, unit)), b = box.map(p => dot(p, unit));
    return Math.max(...a) <= Math.min(...b) + 1e-7 || Math.max(...b) <= Math.min(...a) + 1e-7;
  });
}
export function validateWorkshopGeometry(g: any) {
  check(g?.schema === 'tilelab-geometry-candidate-v1' && g.status === 'preview' && g.runtimeAdmission === 'consumer-owned'
    && g.basis?.handedness === 'right' && g.basis.units === 'blocks' && g.basis.x === 'right' && g.basis.y === 'up' && g.basis.z === 'front', 'schema/basis');
  check(Array.isArray(g.meshes) && g.meshes.length > 0 && g.meshes.length <= 128 && new Set(g.meshes.map((m: any) => m.id)).size === g.meshes.length, 'mesh count/identity');
  const bounds = (b: any) => vector(b?.min) && vector(b?.max) && b.min.every((v: number, i: number) => v < b.max[i]);
  check(bounds(g.bounds) && Array.isArray(g.clearances) && g.clearances.length <= 32 && g.clearances.every(bounds), 'bounds/clearances');
  let vertices = 0, triangles = 0;
  for (const m of g.meshes) {
    check(Array.isArray(m.positions) && m.positions.length >= 3 && m.positions.length <= 8192 && m.positions.every(vector)
      && m.normals?.length === m.positions.length && m.normals.every((n: any) => vector(n) && Math.abs(Math.hypot(...n) - 1) < .001)
      && m.uvs?.length === m.positions.length && m.uvs.every((uv: any) => Array.isArray(uv) && uv.length === 2 && uv.every((n: number) => Number.isFinite(n) && Math.abs(n) < 1024))
      && Array.isArray(m.indices) && m.indices.length >= 3 && m.indices.length <= 24576 && m.indices.length % 3 === 0
      && m.indices.every((i: number) => Number.isInteger(i) && i >= 0 && i < m.positions.length)
      && typeof m.solid === 'boolean' && g.materials?.[m.material], `mesh ${m.id}`);
    vertices += m.positions.length; triangles += m.indices.length / 3; check(vertices <= 65536, 'vertex budget');
    for (const p of m.positions) check(p.every((v: number, i: number) => v >= g.bounds.min[i] - 1e-6 && v <= g.bounds.max[i] + 1e-6), 'declared bounds');
    for (let i = 0; i < m.indices.length; i += 3) {
      const ids = m.indices.slice(i, i + 3), [a, b, c] = ids.map((j: number) => m.positions[j]);
      const normal = cross(sub(b, a), sub(c, a)), length = Math.hypot(...normal);
      check(length > 1e-10 && ids.every((j: number) => dot(normal, m.normals[j]) / length > .99), 'degenerate triangle/winding');
      if (m.solid) check(m.positions.every((p: V) => dot(normal, sub(p, a)) <= length * 1e-6), 'nonconvex solid');
    }
    if (m.solid) for (const clearance of g.clearances) check(!intersectsClearance(m, clearance), `blocked clearance ${clearance.id}/${m.id}`);
  }
  check(Array.isArray(g.anchors) && g.anchors.length <= 32 && new Set(g.anchors.map((a: any) => a.id)).size === g.anchors.length, 'anchors');
  for (const a of g.anchors) check(vector(a.position) && vector(a.normal) && vector(a.up) && Math.abs(Math.hypot(...a.normal) - 1) < .001
    && Math.abs(Math.hypot(...a.up) - 1) < .001 && Math.abs(dot(a.normal, a.up)) < .001, 'anchor basis');
  for (const a of g.attachments ?? []) {
    const target = g.anchors.find((p: any) => p.id === a.target);
    check(target && vector(a.translation) && vector(a.sourceAnchor?.position) && vector(a.placedAnchor)
      && a.placedAnchor.every((v: number, i: number) => Math.abs(v - a.sourceAnchor.position[i] - a.translation[i]) < 1e-6
        && Math.abs(v - target.position[i]) < 1e-6)
      && vector(a.sourceAnchor.normal) && vector(a.sourceAnchor.up) && Math.abs(Math.hypot(...a.sourceAnchor.normal) - 1) < .001
      && Math.abs(Math.hypot(...a.sourceAnchor.up) - 1) < .001 && Math.abs(dot(a.sourceAnchor.normal, a.sourceAnchor.up)) < .001
      && dot(a.sourceAnchor.normal, target.normal) < -.999
      && dot(a.sourceAnchor.up, target.up) > .999, 'attachment alignment');
  }
  return { meshes: g.meshes.length, vertices, triangles, clearances: g.clearances.length, comparisonMeshesIgnored: g.comparison?.length ?? 0 };
}
