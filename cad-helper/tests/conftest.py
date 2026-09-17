from __future__ import annotations

import sys
from pathlib import Path

import pytest


# Ensure helper modules resolve when pytest is invoked from the repository root.
CAD_HELPER_ROOT = Path(__file__).resolve().parents[1]
if str(CAD_HELPER_ROOT) not in sys.path:
    sys.path.insert(0, str(CAD_HELPER_ROOT))


def _write_fake_freecad_worker(path: Path) -> None:
    path.write_text(
        """
from __future__ import annotations

import json
import sys
from pathlib import Path


job_id = sys.argv[-5]
job_type = sys.argv[-4]
artifact_dir = Path(sys.argv[-3])
payload_path = Path(sys.argv[-2])
output_path = Path(sys.argv[-1])
artifact_dir.mkdir(parents=True, exist_ok=True)
payload = json.loads(payload_path.read_text(encoding="utf-8"))

preview_path = artifact_dir / f"{job_id}-{job_type}.glb"
cad_path = artifact_dir / f"{job_id}-{job_type}.FCStd"
preview_path.write_bytes(b"glTF" + b"\\x00" * 32)
cad_path.write_text(f"Real FreeCAD artifact for {job_type}\\n", encoding="utf-8")

operations = []
if job_type in {"sketch_to_solid", "extrude", "regenerate"}:
    operations = [{
        "id": f"op_{job_id}",
        "type": "extrude",
        "kind": "extrude",
        "params": {"distance": 1.2, "direction": [0.0, 1.0, 0.0], "symmetric": False},
        "suppressed": False,
        "sketchId": (payload.get("sketch") or {}).get("id", payload.get("sketchId", "sketch")),
        "depth": 1.2,
        "distance": 1.2,
        "direction": [0.0, 1.0, 0.0],
        "symmetric": False,
    }]
elif job_type == "revolve":
    operations = [{
        "id": f"op_{job_id}",
        "type": "revolve",
        "kind": "revolve",
        "params": {"axis": "Z", "angle": 360.0},
        "suppressed": False,
        "sketchId": payload.get("sketchId", "sketch"),
        "axis": "Z",
        "angle": 360.0,
    }]

result = {
    "jobId": job_id,
    "type": job_type,
    "status": "succeeded",
    "warnings": [],
    "result": {
        "preview": {
            "primitive": "box",
            "dimensions": [2.0, 1.2, 1.0],
            "color": "#60a5fa",
        },
        "operations": operations,
        "artifacts": {
            "previewUrl": f"/v1/cad/artifacts/{preview_path.name}",
            "cadUrl": f"/v1/cad/artifacts/{cad_path.name}",
            "previewArtifactRef": preview_path.as_posix(),
            "cadArtifactRef": cad_path.as_posix(),
        },
    },
}

if job_type == "export_step":
    export_path = artifact_dir / "copied-body.step"
    export_path.write_text("ISO-10303-21;\\nEND-ISO-10303-21;\\n", encoding="utf-8")
    result["result"]["artifacts"]["exportUrl"] = f"/v1/cad/artifacts/{export_path.name}"
    result["result"]["exportFile"] = {
        "filename": export_path.name,
        "content": export_path.read_text(encoding="utf-8"),
    }

output_path.write_text(json.dumps(result), encoding="utf-8")
""".strip(),
        encoding="utf-8",
    )


def _write_fake_freecad_inspect(path: Path) -> None:
    path.write_text(
        """
from __future__ import annotations

import json
import sys
from pathlib import Path


output_path = Path(sys.argv[-1])
output_path.write_text(json.dumps({"engine": "freecad", "version": "1.0.0", "build": "test-shim"}), encoding="utf-8")
""".strip(),
        encoding="utf-8",
    )


@pytest.fixture
def fake_freecad(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    worker_path = tmp_path / "fake_freecad_worker.py"
    inspect_path = tmp_path / "fake_freecad_inspect.py"
    _write_fake_freecad_worker(worker_path)
    _write_fake_freecad_inspect(inspect_path)

    monkeypatch.setenv("FREECAD_PATH", sys.executable)
    monkeypatch.setenv("PISTOLA_FREECAD_BRIDGE_SCRIPT", worker_path.as_posix())
    monkeypatch.setenv("PISTOLA_FREECAD_INSPECT_SCRIPT", inspect_path.as_posix())

    return {"worker": worker_path, "inspect": inspect_path}
