"""One regenerate request crosses the editor-to-helper boundary end to end.

All three fixed bugs had the same shape: data silently dropped where two
components meet, with each component passing its own tests. This test submits
the payload shape the editor sends — a body whose timeline holds an extrude
*and* a `solidcraft_command`, with the sketch carried in the `sketches`
closure — and asserts the helper builds a solid and echoes both operations
back, in order, with the command intact.

It fails against the code before `030e327` (the payload had no `sketches`
field, so the bridge raised `AttributeError` on a real request) and against a
helper that drops `solidcraft_command` from the timeline it echoes.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from job_store import JobStore
from main import app
from routers import jobs
from solidcraft.client import resolve_cli_path

SKETCH_ID = "sketch-round-trip"
BODY_ID = "body-round-trip"


@pytest.fixture(scope="session")
def solidcraft_cli() -> str:
    cli = resolve_cli_path()
    if not Path(cli).exists():
        pytest.skip(f"SolidCraft CLI is not installed at {cli}")
    return cli


def _extrude_operation() -> dict:
    return {
        "id": "cadop-extrude",
        "type": "extrude",
        "kind": "extrude",
        "suppressed": False,
        "sketchId": SKETCH_ID,
        "params": {
            "distance": 0.02,
            "direction": [0.0, 1.0, 0.0],
            "symmetric": False,
        },
        "depth": 0.02,
        "distance": 0.02,
        "direction": [0.0, 1.0, 0.0],
        "symmetric": False,
    }


def _solidcraft_command_operation() -> dict:
    return {
        "id": "cadop-command",
        "type": "solidcraft_command",
        "kind": "solidcraft_command",
        "suppressed": False,
        "params": {
            "command": "inspect.measure",
            "commandParams": {"bodies": ["PistolaBody"]},
        },
        "command": "inspect.measure",
        "commandParams": {"bodies": ["PistolaBody"]},
    }


def _payload() -> dict:
    sketch = {
        "id": SKETCH_ID,
        "entities": [
            {
                "id": "rect-round-trip",
                "kind": "rectangle",
                "center": [0.0, 0.0],
                "width": 0.04,
                "height": 0.03,
            }
        ],
    }
    body = {
        "id": BODY_ID,
        "name": "Round Trip Body",
        "preview": {
            "primitive": "box",
            "dimensions": [0.04, 0.02, 0.03],
            "color": "#60a5fa",
        },
        "operations": [_extrude_operation(), _solidcraft_command_operation()],
        "artifacts": {},
    }
    return {
        "body": body,
        "sketch": sketch,
        # The closure the editor must send with the body. Without
        # RegeneratePayload.sketches the bridge cannot replay this timeline.
        "sketches": {SKETCH_ID: sketch},
        "bodies": {BODY_ID: body},
        "overrides": {},
    }


def test_regenerate_round_trips_extrude_and_solidcraft_command(
    solidcraft_cli: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("PISTOLA_CAD_ENGINE", "solidcraft")
    artifact_dir = tmp_path / ".artifacts"
    artifact_dir.mkdir()
    monkeypatch.setattr(jobs, "ARTIFACT_DIR", artifact_dir)
    monkeypatch.setattr(
        jobs,
        "_JOB_STORE",
        JobStore(max_jobs=10, ttl_seconds=60, artifact_dir=artifact_dir),
    )

    client = TestClient(app)
    created = client.post("/v1/cad/jobs", json={"type": "regenerate", "payload": _payload()})
    assert created.status_code == 200, created.text

    job_id = created.json()["jobId"]
    fetched = client.get(f"/v1/cad/jobs/{job_id}")
    assert fetched.status_code == 200, fetched.text

    result = fetched.json()
    assert result["status"] == "succeeded", result.get("error")
    assert result["result"] is not None

    operations = result["result"]["operations"]
    assert [operation["kind"] for operation in operations] == [
        "extrude",
        "solidcraft_command",
    ], "the helper must echo both operations, in timeline order"

    command_operation = operations[1]
    assert command_operation["command"] == "inspect.measure"
    assert command_operation["commandParams"] == {"bodies": ["PistolaBody"]}

    cad_ref = result["result"]["artifacts"]["cadArtifactRef"]
    assert cad_ref and Path(cad_ref).exists(), "the extrude should produce a STEP artifact"
    assert Path(cad_ref).read_text(encoding="utf-8").startswith("ISO-10303-21;")
