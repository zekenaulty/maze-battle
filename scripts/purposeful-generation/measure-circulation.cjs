// Run from the repository root: node scripts/purposeful-generation/measure-circulation.cjs
// Pure domain evidence; no browser, persistence, provider calls or source mutation.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), cache = new Map();
function load(file) {
  file = path.resolve(file); if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const m = { exports: {} }; cache.set(file, m);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', out)(s => s.startsWith('.')
    ? load(path.resolve(path.dirname(file), s)) : require(s), m, m.exports);
  return m.exports;
}
const { createModuleRecipe } = load('src/domain/expedition/topology/modules/policy.ts');
const { ModuleAssembly } = load('src/domain/expedition/topology/modules/assembly.ts');
const { assertModuleQuality } = load('src/domain/expedition/topology/modules/quality.ts');
const rows = [], failures = [];
const architecture = process.argv[2] ?? 'circulation-v1';
if (!['circulation-v1', 'dedicated-stairs-v1'].includes(architecture)) throw Error('Unsupported measurement profile');
const dedicated = architecture === 'dedicated-stairs-v1';
for (const spatial of dedicated ? [true] : [false, true]) for (const level of [1, 10, 30]) for (let seed = 1; seed <= 128; seed++) {
  try {
    const recipe = createModuleRecipe('circulation-measurement', level, seed, { spatial, architecture });
    const assembly = new ModuleAssembly(recipe), state = assembly.finish(), q = assertModuleQuality(state);
    const degrees = new Map(state.spaces.map(s => [s.id, 0]));
    for (const j of state.joins) {
      degrees.set(j.fromRoomId, degrees.get(j.fromRoomId) + 1);
      degrees.set(j.toRoomId, degrees.get(j.toRoomId) + 1);
    }
    rows.push({ spatial, level, seed, nodes: q.rooms, chambers: q.chambers, runs: q.runs, junctions: q.junctions,
      branchingJunctions: state.spaces.filter(s => s.circulation === 'junction' && degrees.get(s.id) >= 3).length,
      roomArea: q.roomArea, circulationArea: q.circulationArea, chain: q.longestChain, forks: q.forks, candidates: assembly.work.candidates });
    if (dedicated) Object.assign(rows.at(-1), { stairwells: q.stairwells,
      stairwellArea: state.spaces.filter(s => s.purpose).reduce((n, s) => n + s.rows * s.columns, 0),
      ordinaryArea: state.spaces.filter(s => s.kind === 'room' && !s.purpose).reduce((n, s) => n + s.rows * s.columns, 0) });
  } catch (e) { failures.push({ spatial, level, seed, error: String(e) }); }
}
const aggregate = [];
for (const spatial of dedicated ? [true] : [false, true]) for (const level of [1, 10, 30]) {
  const rr = rows.filter(r => r.spatial === spatial && r.level === level);
  const sum = k => rr.reduce((n, r) => n + r[k], 0), range = k => [Math.min(...rr.map(r => r[k])), Math.max(...rr.map(r => r[k]))];
  aggregate.push({ spatial, level, floors: rr.length, chambers: sum('chambers'), runs: sum('runs'), junctions: sum('junctions'),
    roomArea: sum('roomArea'), circulationArea: sum('circulationArea'),
    circulationAreaPercent: 100 * sum('circulationArea') / (sum('roomArea') + sum('circulationArea')),
    branchingJunctionRange: range('branchingJunctions'), longestChainRange: range('chain'),
    ...(dedicated ? { stairwells: sum('stairwells'), stairwellArea: sum('stairwellArea'), ordinaryArea: sum('ordinaryArea') } : {}) });
}
const report = { method: `Current pure domain compiler; 128 integer seeds x 3 depths x ${dedicated ? 1 : 2} spatial modes; not native-browser or human visual acceptance`,
  architecture, seedRange: [1, 128], levels: [1, 10, 30], floors: rows.length,
  aggregate, failures, samples: rows.filter(r => [1, 42, 128].includes(r.seed)) };
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync(`test-results/purposeful-${architecture}-all-seeds.json`, JSON.stringify({ ...report, rows }, null, 2) + '\n');
fs.writeFileSync(`docs/implementation/purposeful-generation/${dedicated ? 'p3' : 'p2'}-seed-measurements.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ aggregate, failures }));
if (failures.length || rows.some(r => r.branchingJunctions < 1)) process.exitCode = 1;
