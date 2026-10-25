import { sha256, serialize } from './import-tilelab-pack.ts';
import { alphaPlane, cropPixels, decodeModelPng, verifySourceAlpha, type PngPixels } from './model-png.ts';

interface Pin { path: string; sha256: string }
function check(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
const json = (bytes: Buffer) => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
/** Verify portable links only. Paths embedded in historical generation reports are never opened. */
export function upgradeVerifier(doc: any, pinned: (pin: Pin) => Buffer) {
  const images = new Map<string, PngPixels>();
  const image = (pin: Pin) => {
    let decoded = images.get(pin.sha256);
    if (!decoded) { decoded = decodeModelPng(pinned(pin)); images.set(pin.sha256, decoded); }
    return decoded;
  };
  return (material: any) => {
    check(material.generationStatus === 'generated_unreviewed' && ['preview', 'approved'].includes(material.review?.status)
      && typeof material.review?.reviewer === 'string' && material.review.reviewer.length > 0 && typeof material.review.note === 'string', `Incomplete upgraded review: ${material.resource}`);
    const original = image(material.source.image), selected = image(material.selected);
    check(original.width === material.source.image.width && original.height === material.source.image.height &&
      selected.width === material.selected.width && selected.height === material.selected.height &&
      original.width === original.height && selected.width === selected.height && selected.width >= original.width, `Full canvas dimensions differ: ${material.resource}`);
    const alpha = alphaPlane(original), kind = alpha.every(a => a === 255) ? 'opaque' : alpha.every(a => a === 0 || a === 255) ? 'binary_mask' : 'partial_alpha';
    check(sha256(alpha) === material.source.alphaSha256 && kind === material.source.alphaKind, `Source alpha evidence differs: ${material.resource}`);
    verifySourceAlpha(original, selected);
    check(Array.isArray(material.receipts) && material.receipts.length > 1 && material.receipts.length <= 16, `Missing upgraded receipts: ${material.resource}`);
    const receipts = material.receipts as Pin[];
    check(new Set(receipts.map(r => r.path)).size === receipts.length, 'Duplicate upgraded receipt');
    const masterPin = receipts.find(r => r.path === `evidence/receipts/${material.sharedUnit}/master.json`);
    check(masterPin, `Missing portable master receipt: ${material.resource}`);
    const master = json(pinned(masterPin));
    check(master.status === 'generated_unreviewed' && master.modelTextureMaster === true && master.requiresSeamRepair === false &&
      master.textureResource === material.resource && master.sourceSha256 === material.source.image.sha256 &&
      master.outputSha256 === material.selected.sha256 && master.outputSize === `${selected.width}x${selected.height}` &&
      /^[a-f0-9]{64}$/.test(master.generatedSha256), `Master receipt differs: ${material.resource}`);
    for (const block of material.blocks) {
      const reference = receipts.find(r => r.path === `evidence/receipts/${block}/${material.materialIds[0]}.json`);
      check(reference, `Missing block output receipt: ${block}/${material.resource}`);
    }
    for (const reference of receipts) {
      const receipt = json(pinned(reference));
      if (reference.path === masterPin.path || reference.path.endsWith('/group.json')) continue;
      check(receipt.schema === 'tilelab-model-texture-output-v1' && receipt.status === 'generated_unreviewed' &&
        receipt.textureResource === material.resource && receipt.sharedTextureUnit === material.sharedUnit &&
        receipt.sourceSha256 === material.source.image.sha256 && receipt.outputSha256 === material.selected.sha256 &&
        receipt.sharedMasterReceiptSha256 === masterPin.sha256 && receipt.generatedSha256 === master.generatedSha256 &&
        receipt.alphaPolicy === 'source_texel_alpha_exact' && receipt.uvPolicy === 'full_canvas_no_packing_no_seam_repair', `Output receipt differs: ${reference.path}`);
    }
    let groupProof: unknown;
    const reference = master.modelTextureGroup;
    if (reference) {
      check(/^[a-f0-9]{24}$/.test(reference.id), 'Invalid model texture group');
      const prefix = `evidence/groups/${reference.id}/`, groupPin = receipts.find(r => r.path === `${prefix}group.json`);
      check(groupPin, 'Missing portable group receipt');
      const group = json(pinned(groupPin)), recipe = group.recipe;
      check(group.schema === 'tilelab-model-texture-group-v1' && group.status === 'generated_unreviewed' && recipe?.Version === 1 &&
        recipe.Id === reference.id && recipe.SourceBlock === 'iron_door' && recipe.Layout === 'upper_lower_continuous' &&
        Array.isArray(recipe.Cells) && recipe.Cells.length === 2 && recipe.Width === selected.width && recipe.Height === selected.height * 2,
      'Unsupported unified door recipe');
      const expected = ['minecraft:block/iron_door_top', 'minecraft:block/iron_door_bottom'];
      for (let half = 0; half < 2; half++) {
        const cell = recipe.Cells[half], member = doc.materials.find((m: any) => m.resource === expected[half]);
        check(member && cell.Resource === expected[half] && cell.Unit === member.sharedUnit && cell.SourceSha256 === member.source.image.sha256 &&
          cell.X === 0 && cell.Y === half * selected.height && cell.Width === selected.width && cell.Height === selected.height,
        'Unified door crop/resource association differs');
      }
      const cell = recipe.Cells.find((c: any) => c.Resource === material.resource);
      check(cell && serialize(cell) === serialize(reference.cell) && reference.receipt === `_model_texture_groups/${reference.id}/report.json` &&
        reference.rawCompositeSha256 === group.generatedSha256 && reference.sourceCompositeSha256 === group.sourceCompositeSha256 &&
        master.cropPolicy === 'exact_integer_rectangle_no_resampling' && master.model === group.generationSettings?.Model &&
        master.quality === group.generationSettings?.Quality && group.generationSettings?.ModelTextureMode === 'groups' && master.requestId === group.requestId,
      'Unified door reference/settings differ');
      const block = doc.blocks.find((b: any) => b.id === recipe.SourceBlock);
      check(block && Array.isArray(recipe.SourceEvidence) && recipe.SourceEvidence.length === block.sourceFiles.length &&
        recipe.SourceEvidence.every((s: any) => block.sourceFiles.some((f: any) => f.resource === s.Resource && f.file.sha256 === s.Sha256 &&
          f.file.path === `evidence/blocks/${block.id}/${s.Snapshot}`)), 'Unified door source evidence differs');
      const assembledSource = image({ path: `${prefix}source.png`, sha256: group.sourceCompositeSha256 });
      const raw = image({ path: `${prefix}raw_edit.png`, sha256: group.generatedSha256 });
      const assembled = image({ path: `${prefix}upgraded.png`, sha256: group.outputSha256 });
      for (const canvas of [assembledSource, raw, assembled]) check(canvas.width === recipe.Width && canvas.height === recipe.Height, 'Unified door canvas dimensions differ');
      verifySourceAlpha(original, cropPixels(assembledSource, cell));
      const outputCrop = cropPixels(assembled, cell), rawCrop = cropPixels(raw, cell);
      let transparentRgbDifferences = 0;
      for (let i = 0; i < selected.rgba.length; i++) {
        if (i % 4 !== 3) check(selected.rgba[i] === rawCrop.rgba[i], `Unified door raw RGB crop differs: ${material.resource}`);
        if (i % 4 === 3 || selected.rgba[Math.floor(i / 4) * 4 + 3] !== 0)
          check(outputCrop.rgba[i] === selected.rgba[i], `Unified door visible RGBA crop differs: ${material.resource}`);
        else if (outputCrop.rgba[i] !== selected.rgba[i]) transparentRgbDifferences++;
      }
      groupProof = { receipt: groupPin, crop: cell, source: { path: `${prefix}source.png`, sha256: group.sourceCompositeSha256 },
        raw: { path: `${prefix}raw_edit.png`, sha256: group.generatedSha256 }, output: { path: `${prefix}upgraded.png`, sha256: group.outputSha256 },
        exactVisibleRgbaCrop: true, exactRawRgbCrop: true, transparentRgbDifferences };
    } else {
      check(!receipts.some(r => r.path.endsWith('/group.json')) && !/^minecraft:block\/iron_door_(top|bottom)$/.test(material.resource), 'Missing unified door group evidence');
    }
    return { resource: material.resource, source: material.source.image, selected: material.selected, review: material.review,
      sourceAlphaSha256: sha256(alpha), alphaKind: kind, exactSourceAlpha: true, verifiedPixels: selected.width * selected.height, receipts,
      ...(groupProof ? { group: groupProof } : {}) };
  };
}
