const number = value => Number.isFinite(value) ? Number(value.toFixed(3)) : '?';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function metrics(cohort, row) {
  if (!row.metrics) return `<p>${escape(row.status)}: ${escape(row.reason)}</p>`;
  const m = row.metrics;
  const ordinary = cohort.generator === 'ordinary';
  const graph = ordinary ? m.graph : m.roomGraph;
  return `<p>${ordinary ? m.rooms : m.materializedRooms} rooms; ${graph.forks} forks; ${graph.loops} loops; `
    + `${ordinary ? graph.diameterHops : graph.diameter} graph diameter. `
    + (ordinary ? `${number(m.walkableCoverage * 100)}% grid walkable; ${number(m.meanCorridorSteps)} mean corridor steps.`
      : `${m.materializedPassages} passage modules; ${number(m.roomFootprint.coverage * 100)}% room-envelope coverage.`) + '</p>';
}

function schematic(example) {
  const g = example.geometry;
  const all = [...g.rooms, ...(g.passages ?? [])];
  const r = g.bounds?.row ?? Math.min(...all.map(x => x.row));
  const c = g.bounds?.column ?? Math.min(...all.map(x => x.column));
  const rows = g.bounds?.rows ?? Math.max(...all.map(x => x.row + x.rows)) - r;
  const columns = g.bounds?.columns ?? Math.max(...all.map(x => x.column + x.columns)) - c;
  const rect = (x, fill) => `<rect x="${x.column}" y="${x.row}" width="${x.columns}" height="${x.rows}" fill="${fill}" stroke="#cad0d4" stroke-width="0.15"/>`;
  const lines = (g.paths ?? []).map(path => `<polyline points="${path.map(x => `${x.column + .5},${x.row + .5}`).join(' ')}" fill="none" stroke="#e6bb55" stroke-width="1"/>`);
  const connectors = (g.connections ?? []).map(x => `<line x1="${x.fromDoor.column + .5}" y1="${x.fromDoor.row + .5}" x2="${x.toDoor.column + .5}" y2="${x.toDoor.row + .5}" stroke="#f4df8f" stroke-width="0.55"/>`);
  return `<svg viewBox="${c - 1} ${r - 1} ${columns + 2} ${rows + 2}" role="img" aria-label="Audit footprint map">`
    + (g.passages ?? []).map(x => rect(x, '#d1a447')).join('') + lines.join('')
    + g.rooms.map((x, i) => rect(x, i === 0 ? '#509c75' : '#657c92')).join('') + connectors.join('') + '</svg>';
}

export function renderReport(evidence) {
  const sections = evidence.cohorts.map(cohort => `<section><h2>${escape(cohort.generator)}</h2>`
    + (cohort.status === 'failed' ? `<p>FAILED: ${escape(cohort.errors.join('; '))}. Any maps below show only the completed prefix.</p>` : '')
    + '<div class="samples">'
    + cohort.examples.map(example => {
      const row = cohort.rows.find(row => row.seed === example.seed && row.level === example.level);
      return `<article><h3>Floor ${example.level}, seed ${example.seed}</h3>${metrics(cohort, row)}${schematic(example)}</article>`;
    }).join('') + '</div></section>');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>D0 dungeon baseline</title>
<style>body{margin:0;padding:24px;background:#181b1e;color:#e9e9e5;font:15px system-ui}h1{font-size:26px}h2{font-size:22px}h3{font-size:17px}p{line-height:1.5}section{border-top:1px solid #666;padding-top:12px;margin-top:24px}.samples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}article{min-width:0}svg{width:100%;height:360px;background:#101315}code{overflow-wrap:anywhere}@media(max-width:720px){.samples{grid-template-columns:1fr}body{padding:14px}}</style>
<h1>D0: current dungeon structure</h1><p>Privileged offline footprint diagrams, not the player's map. Rooms are gray-green; passages are gold. Each map is fitted independently: compare room counts and graph shape, not apparent pixel size. Internal room obstacles are omitted.</p>
<p>Source <code>${escape(evidence.sourceHead)}</code>. Diagnostic status does not certify generator quality.</p>${sections.join('')}</html>`;
}
