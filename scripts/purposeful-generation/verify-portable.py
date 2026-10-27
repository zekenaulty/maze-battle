"""Independent GLB import via trimesh 4.9.0, installed only in this worktree's ignored cache.
Usage: <python> scripts/purposeful-generation/verify-portable.py <native-evidence-directory>
No source assets, game saves, network or export files are modified.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "node_modules/.cache/construction-proof-python"))
import trimesh

reports = []
for file in sorted(Path(sys.argv[1]).rglob("*.glb")):
    file = file.resolve()
    if file.stem.endswith("-repeat"):
        continue
    data = file.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    size, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + size])
    binary_offset = 20 + size + 8
    binary = data[binary_offset:]
    metadata = next(n["extras"]["portable"] for n in doc["nodes"] if "portable" in n.get("extras", {}))
    assert all("uri" not in b for b in doc["buffers"])
    assert all("uri" not in i and "bufferView" in i for i in doc["images"])
    images = []
    for image in doc["images"]:
        view = doc["bufferViews"][image["bufferView"]]
        pixels = binary[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
        with Image.open(io.BytesIO(pixels)) as decoded:
            decoded.load()
            images.append({"size": list(decoded.size), "mode": decoded.mode, "sha256": hashlib.sha256(pixels).hexdigest()})
    scene = trimesh.load_scene(str(file), process=False)
    assert len(scene.geometry) > 0
    for mesh in scene.geometry.values():
        assert np.isfinite(mesh.vertices).all() and np.isfinite(mesh.vertex_normals).all()
        assert mesh.faces.shape[1] == 3 and mesh.faces.max() < len(mesh.vertices)
        assert getattr(mesh.visual, "uv", None) is not None and np.isfinite(mesh.visual.uv).all()
    expected = np.array([metadata["bounds"]["min"], metadata["bounds"]["max"]])
    error = float(np.max(np.abs(scene.bounds - expected)))
    assert error < 1e-5, (file, error, scene.bounds, expected)
    comparison = None
    before = file.with_name(file.stem + "-procedural-canvas.png")
    after = file.with_name(file.stem + "-reimported-canvas.png")
    if before.exists() and after.exists():
        a, b = np.array(Image.open(before).convert("RGB"), dtype=np.int16), np.array(Image.open(after).convert("RGB"), dtype=np.int16)
        assert a.shape == b.shape
        delta = np.abs(a - b)
        comparison = {"meanChannelDifference255": float(delta.mean()), "changedPixelFractionOver8": float((delta.max(axis=2) > 8).mean())}
    reports.append({"file": str(file.relative_to(root)), "consumer": "trimesh", "version": trimesh.__version__,
                    "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
                    "meshes": len(scene.geometry), "faces": sum(len(m.faces) for m in scene.geometry.values()),
                    "bounds": scene.bounds.tolist(), "maxBoundsErrorWorldUnits": error,
                    "images": images, "geometryNormalsUVs": "PASS", "externalReferences": 0, "nativeCanvasComparison": comparison})
assert reports, "No portable artifacts found"
output = root / "test-results/portable-independent-consumer.json"
output.write_text(json.dumps(reports, indent=2) + "\n", encoding="utf8")
print(json.dumps([{"file": r["file"], "meshes": r["meshes"], "boundsError": r["maxBoundsErrorWorldUnits"], "images": len(r["images"])} for r in reports]))
