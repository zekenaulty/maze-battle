#!/usr/bin/env node
/**
 * Human-invoked OpenAI reference-to-original tile generation.
 * API credentials never enter the Maze Battle browser bundle.
 */
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';

function printUsage() {
  console.log([
    'Usage: node scripts/edit-tile-reference.mjs --input ref.png --output new-tile.png',
    '  [--style "description"] [--columns 1|2|4|8] [--rows 1|2|4|8]',
    '  [--model gpt-image-2.5-flare] [--source-label "Pack name / example"]',
    '  [--source-license "rights notes"] [--dry-run]',
    'OPENAI_API_KEY is required for real API calls, not dry runs.',
  ].join('\n'));
}

function options(argv) {
  const entries = new Map();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('Unexpected argument: ' + key);
    if (key === '--help' || key === '--dry-run') { entries.set(key, true); continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Expected a value after ' + key);
    entries.set(key, value);
  }
  return entries;
}

function gridDimension(value, name) {
  const result = Number(value);
  if (![1, 2, 4, 8].includes(result)) {
    throw new Error(name + ' must be 1, 2, 4, or 8 (must divide 1024 exactly).');
  }
  return result;
}

function editPrompt(style, columns, rows) {
  return [
    'Create a completely new, independently designed dungeon material tilesheet.',
    'The attached input is reference evidence for block-face purpose, broad material families, and layout structure only.',
    'Do not reproduce source pixels, the original textures, distinctive decorative motifs, patterns, logos, or characters.',
    'Invent original surface shapes, wear patterns, decorative language, and color relationships.',
    'Do not reconstruct recognizable Minecraft or Sphax/PureBDcraft texture artwork.',
    'Generate precisely ' + columns + ' columns and ' + rows + ' rows of identically sized square tiles.',
    'The image must contain only the tiles, with no margins, borders, labels, shadows across tile boundaries, perspective, or text.',
    'Each tile must be repeatable seamlessly in both axes. Neighboring cells are independent material faces.',
    'All output is orthographic diffuse surface color, with consistent scale and no baked directional lighting.',
    'Art direction: ' + style,
  ].join('\n');
}

async function run() {
  const args = options(process.argv.slice(2));
  if (args.has('--help')) { printUsage(); return; }
  const input = args.get('--input');
  const output = args.get('--output');
  if (!input || !output) { printUsage(); throw new Error('--input and --output are required.'); }
  if (resolve(input) === resolve(output)) throw new Error('Output cannot overwrite the reference.');
  const columns = gridDimension(args.get('--columns') ?? '1', '--columns');
  const rows = gridDimension(args.get('--rows') ?? '1', '--rows');
  const model = args.get('--model') ?? 'gpt-image-2.5-flare';
  const style = args.get('--style') ?? 'Original dark fantasy dungeon stone, weathered masonry, cool muted palette, no imitation.';
  const mime = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  }[extname(input).toLowerCase()];
  if (!mime || extname(output).toLowerCase() !== '.png') {
    throw new Error('Reference must be PNG, JPEG, or WebP; output must be PNG.');
  }
  const bytes = await readFile(input);
  if (bytes.byteLength < 1 || bytes.byteLength >= 50 * 1024 * 1024) {
    throw new Error('Input must be nonempty and less than 50 MB.');
  }
  const prompt = editPrompt(style, columns, rows);
  const receipt = {
    intent: 'Original interpretation; reference is not a reconstruction target',
    inputFilename: basename(input),
    inputSha256: createHash('sha256').update(bytes).digest('hex'),
    referenceSource: args.get('--source-label') ?? 'User-supplied image',
    referenceRights: args.get('--source-license') ?? 'Unverified; review before redistribution',
    model, columns, rows, prompt,
  };
  if (args.has('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, ...receipt }, null, 2));
    return;
  }
  // Never pay for an edit that cannot safely write its output.
  try {
    await access(output);
    throw new Error('Output exists: refusing to overwrite ' + output);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set: no API request sent.');
  const data = new FormData();
  data.append('model', model);
  data.append('image[]', new Blob([bytes], { type: mime }), basename(input));
  data.append('prompt', prompt);
  data.append('size', '1024x1024');
  data.append('output_format', 'png');
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: data,
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error('Image edit failed (HTTP ' + response.status + '): ' + JSON.stringify(json.error ?? json).slice(0, 650));
  }
  const image = json.data?.[0]?.b64_json;
  if (typeof image !== 'string') throw new Error('Image edit returned no PNG.');
  const png = Buffer.from(image, 'base64');
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, png, { flag: 'wx' });
  await writeFile(output + '.receipt.json', JSON.stringify({
    ...receipt, outputFilename: basename(output),
    outputSha256: createHash('sha256').update(png).digest('hex'),
    requestId: response.headers.get('x-request-id'),
    createdAt: new Date().toISOString(),
    usage: json.usage ?? null,
    reviewStatus: 'NOT APPROVED: check layout, tile seams, originality, rights, and source attribution',
  }, null, 2) + '\n', { flag: 'wx' });
  console.log('Wrote ' + output + ' and provenance receipt. Human review is required.');
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
