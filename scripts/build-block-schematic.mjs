#!/usr/bin/env node
/**
 * Build a local six-face visual reference from Maze Quest's scraped block map.
 * The generated self-contained HTML is PRIVATE reference material and is never
 * committed or sent to OpenAI by this script.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

const names = ['right', 'left', 'top', 'bottom', 'front', 'back'];

function argumentsFor(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!name.startsWith('--')) throw new Error('Unexpected option ' + name);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + name);
    result[name] = value;
  }
  return result;
}

function safeFileName(name) {
  if (!/^[a-z0-9_.-]+\.png$/i.test(name) || name.includes('..')) {
    throw new Error('Unexpected file name from asset manifest: ' + name);
  }
  return name;
}

async function main() {
  const args = argumentsFor(process.argv.slice(2));
  const mazeQuest = args['--maze-quest'];
  const block = args['--block'];
  const output = args['--output'];
  if (!mazeQuest || !block || !output) {
    throw new Error('Usage: node scripts/build-block-schematic.mjs --maze-quest ../maze-quest --block oak_log --output local-assets/oak-log-ref.html');
  }
  if (!/^[a-z0-9_-]+$/i.test(block)) throw new Error('Invalid block ID.');
  if (extname(output).toLowerCase() !== '.html') throw new Error('Output must be an .html path.');
  const root = resolve(mazeQuest, 'wwwroot', 'assets');
  const primary = JSON.parse(await readFile(join(root, 'textureMaps.json'), 'utf8'));
  const alternates = JSON.parse(await readFile(join(root, 'textureMapsAlt.json'), 'utf8'));
  const entry = [...primary, ...alternates].find(value => value.name === block);
  if (!entry) throw new Error('Block not found in Maze Quest manifests: ' + block);
  const maps = Array.isArray(entry.map) ? entry.map : Array(6).fill(entry.map);
  if (maps.length !== 6) throw new Error('Expected six faces for block: ' + block);
  const faces = [];
  for (let index = 0; index < 6; index++) {
    const map = maps[index];
    const file = safeFileName(map.file);
    const path = join(root, 'minecraft', 'textures', '64', map.isAlt ? 'block_alt' : 'block', file);
    let data;
    try {
      data = await readFile(path);
    } catch {
      throw new Error('Missing face texture (source incomplete): ' + path);
    }
    faces.push({
      face: names[index],
      file,
      sourcePath: path,
      sha256: createHash('sha256').update(data).digest('hex'),
      dataUri: 'data:image/png;base64,' + data.toString('base64'),
    });
  }
  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>Block reference sheet: ' + block + '</title>',
    '<style>body{font:16px system-ui;background:#111523;color:#eee;margin:20px}button{padding:10px 14px}canvas{max-width:100%;border:1px solid #46506a;image-rendering:pixelated}small{display:block;max-width:750px;margin:12px 0;color:#ccd}</style>',
    '</head><body><h1>Reference schematic: ' + block + '</h1>',
    '<p>Face order: right, left, top / bottom, front, back.</p>',
    '<small>Reference source: Maze Quest local asset pack. Source licensing is not inferred from possession. This page contains original reference images; do not publish it as a game asset.</small>',
    '<button type="button" id="download" disabled>Download 3×2 PNG reference</button>',
    '<p id="status">Loading local reference images...</p>',
    '<canvas id="sheet" width="1536" height="1024" aria-label="Six-face source reference"></canvas>',
    '<script>',
    'const block = ' + JSON.stringify(block) + ';',
    'const faceData = ' + JSON.stringify(faces.map(face => ({ face: face.face, dataUri: face.dataUri }))) + ';',
    'const canvas = document.getElementById("sheet");',
    'const ctx = canvas.getContext("2d");',
    'const button = document.getElementById("download");',
    'const status = document.getElementById("status");',
    'ctx.imageSmoothingEnabled = false;',
    'Promise.all(faceData.map(face => new Promise((resolve, reject) => {',
    '  const image = new Image();',
    '  image.onload = () => resolve(image);',
    '  image.onerror = () => reject(new Error("Failed to load " + face.face));',
    '  image.src = face.dataUri;',
    '}))).then(images => {',
    '  images.forEach((image, index) => ctx.drawImage(image, (index % 3) * 512, Math.floor(index / 3) * 512, 512, 512));',
    '  status.textContent = "3 × 2 faces, 512 px per face; review the image before using it as an edit reference.";',
    '  button.disabled = false;',
    '  button.onclick = () => {',
    '    const link = document.createElement("a");',
    '    link.download = block + "-reference-3x2.png";',
    '    link.href = canvas.toDataURL("image/png");',
    '    link.click();',
    '  };',
    '}).catch(error => { status.textContent = error.message; });',
    '</script></body></html>',
  ].join('\n');
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, html, { flag: 'wx' });
  const receipt = {
    source: 'Maze Quest scraped block texture map',
    block,
    sourceRoot: root,
    faceOrder: names,
    referenceColumns: 3,
    referenceRows: 2,
    referenceSize: '1536x1024',
    sourceLicense: args['--source-license'] ?? 'Review original Minecraft/BDcraft rights before using or sharing',
    faces: faces.map(({ dataUri, ...metadata }) => metadata),
    sourceHTML: basename(output),
    usage: 'Private visual reference only; not a redistributable asset',
  };
  await writeFile(output + '.manifest.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log('Wrote local reference schematic ' + output + '. Open it and download the 3x2 PNG.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
