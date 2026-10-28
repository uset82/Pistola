"""Named inspection jobs: one fixed catalog command each, no raw passthrough.

These exist so `inspect.interference`, `inspect.clearance` and
`inspect.center_of_mass` are usable on a helper whose passthrough is closed
(the hosted deployment sets `PISTOLA_CAD_ALLOW_PASSTHROUGH=0`). The job type
selects the command; nothing in the payload can name another one.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine import (
    SOLIDCRAFT_INSPECTION_JOB_TYPES,
    is_inspection_job_type,
    is_passthrough_job_type,
)
from job_store import JobStore
from main import app
from routers import jobs
from schemas import InspectionPayload
from solidcraft.client import resolve_cli_path
from solidcraft.jobs import run_inspection
from solidcraft.mapping import SolidCraftMappingError, inspection_commands

SKETCH_ID = "sketch-inspection"


@pytest.fixture(scope="session")
def solidcraft_cli() -> str:
    cli = resolve_cli_path()
    if not Path(cli).exists():
        pytest.skip(f"SolidCraft CLI is not installed at {cli}")
    return cli


def _sketch() -> dict:
    return {
        "id": SKETCH_ID,
        "entities": [
            {
                "id": "rect-inspection",
                "kind": "rectangle",
                "center": [0.0, 0.0],
                "width": 0.04,
                "height": 0.03,
            }
        ],
    }


def _body(
    body_id: str,
    *,
    x: float = 0.0,
    rotation: list[float] | None = None,
    scale: list[float] | None = None,
) -> dict:
    return {
        "id": body_id,
        "name": body_id,
        "operations": [
            {
                "id": f"op-{body_id}",
                "type": "extrude",
                "kind": "extrude",
                "suppressed": False,
                "sketchId": SKETCH_ID,
                "params": {
                    "distance": 0.02,
                    "direction": [0.0, 1.0, 0.0],
                    "symmetric": False,
                },
                "distance": 0.02,
                "depth": 0.02,
                "direction": [0.0, 1.0, 0.0],
                "symmetric": False,
            }
        ],
        "position": [x, 0.0, 0.0],
        "rotation": rotation or [0.0, 0.0, 0.0],
        "scale": scale or [1.0, 1.0, 1.0],
    }


def _pair() -> dict[str, dict]:
    return {"body-a": _body("body-a"), "body-b": _body("body-b", x=0.01)}


def _payload(body_ids: list[str], **extra) -> dict:
    return {
        "bodyIds": body_ids,
        "bodies": _pair(),
        "sketches": {SKETCH_ID: _sketch()},
        **extra,
    }


def _commands_for(job_type: str, body_ids: list[str], **extra):
    return inspection_commands(
        job_type=job_type,
        body_ids=body_ids,
        bodies=_pair(),
        sketches={SKETCH_ID: _sketch()},
        against_body_ids=extra.pop("against_body_ids", ()),
        **extra,
    )


def test_inspection_types_are_named_but_not_passthrough():
    assert SOLIDCRAFT_INSPECTION_JOB_TYPES == {
        "inspect_interference",
        "inspect_clearance",
        "inspect_center_of_mass",
    }
    for job_type in SOLIDCRAFT_INSPECTION_JOB_TYPES:
        assert is_inspection_job_type(job_type) is True
        assert is_passthrough_job_type(job_type) is False


def test_script_rebuilds_each_body_under_a_stable_name_and_runs_one_command():
    commands, names, warnings = _commands_for(
        "inspect_interference", ["body-a", "body-b"]
    )

    assert names == ["PistolaBody1", "PistolaBody2"]
    assert warnings == []

    command_ids = [command["command"] for command in commands]
    assert command_ids[-1] == "inspect.interference"
    assert command_ids.count("solid.extrude") == 2
    assert command_ids.count("sketch.create") == 2

    body_names = [
        command["params"]["body_name"]
        for command in commands
        if command["command"] == "solid.extrude"
    ]
    assert body_names == ["PistolaBody1", "PistolaBody2"]

    assert commands[-1]["params"] == {"bodies": ["PistolaBody1", "PistolaBody2"]}


def test_scene_translation_is_applied_in_solidcraft_axes():
    bodies = {
        "body-a": _body("body-a", x=0.01),
        "body-b": _body("body-b"),
    }
    commands, _, _ = inspection_commands(
        job_type="inspect_interference",
        body_ids=["body-a"],
        bodies=bodies,
        sketches={SKETCH_ID: _sketch()},
    )

    moves = [command for command in commands if command["command"] == "solid.move"]
    assert moves == [
        {
            "command": "solid.move",
            "params": {"bodies": ["PistolaBody1"], "translate": [10.0, 0.0, 0.0]},
        }
    ]


def test_rotation_and_scale_are_reported_because_inspection_ignores_them():
    bodies = {
        "body-a": _body("body-a", rotation=[0.0, 0.5, 0.0], scale=[2.0, 2.0, 2.0]),
    }
    _, _, warnings = inspection_commands(
        job_type="inspect_center_of_mass",
        body_ids=["body-a"],
        bodies=bodies,
        sketches={SKETCH_ID: _sketch()},
    )

    assert any("rotated" in warning for warning in warnings)
    assert any("scaled" in warning for warning in warnings)


def test_clearance_options_and_against_subset_reach_the_command():
    commands, names, _ = _commands_for(
        "inspect_clearance",
        ["body-a"],
        against_body_ids=["body-b"],
        minimum_clearance_mm=5.0,
        min_volume_mm3=1.0,
        nearest=2,
    )

    assert names == ["PistolaBody1"]
    assert commands[-1] == {
        "command": "inspect.clearance",
        "params": {
            "bodies": ["PistolaBody1"],
            "against": ["PistolaBody2"],
            "clearance": 5.0,
            "min_volume": 1.0,
            "nearest": 2,
        },
    }


def test_body_without_operation_history_is_refused():
    bodies = {"body-imported": {"id": "body-imported", "operations": []}}

    with pytest.raises(SolidCraftMappingError, match="imported STEP bodies"):
        inspection_commands(
            job_type="inspect_center_of_mass",
            body_ids=["body-imported"],
            bodies=bodies,
            sketches={},
        )


def test_missing_closure_body_is_refused():
    with pytest.raises(SolidCraftMappingError, match="missing from the job's body closure"):
        inspection_commands(
            job_type="inspect_interference",
            body_ids=["body-z"],
            bodies=_pair(),
            sketches={SKETCH_ID: _sketch()},
        )


def test_job_type_cannot_be_swapped_for_an_arbitrary_command():
    with pytest.raises(SolidCraftMappingError, match="not a named inspection job"):
        inspection_commands(
            job_type="command",
            body_ids=["body-a"],
            bodies=_pair(),
            sketches={SKETCH_ID: _sketch()},
        )


def _isolate(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    artifact_dir = tmp_path / ".artifacts"
    artifact_dir.mkdir()
    monkeypatch.setattr(jobs, "ARTIFACT_DIR", artifact_dir)
    monkeypatch.setattr(
        jobs,
        "_JOB_STORE",
        JobStore(max_jobs=10, ttl_seconds=60, artifact_dir=artifact_dir),
    )
    monkeypatch.setattr(jobs, "_GATE", None)
    monkeypatch.setattr(jobs, "_GATE_SIZE", None)
    monkeypatch.delenv("PISTOLA_CAD_HELPER_TOKEN", raising=False)


def test_inspection_is_served_while_passthrough_is_closed(monkeypatch, tmp_path):
    monkeypatch.setenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", "0")
    monkeypatch.setenv("PISTOLA_CAD_ENGINE", "solidcraft")
    _isolate(monkeypatch, tmp_path)
    client = TestClient(app)

    inspected = client.post(
        "/v1/cad/jobs",
        json={"type": "inspect_center_of_mass", "payload": _payload(["body-a"])},
    )
    assert inspected.status_code == 200, inspected.text

    refused = client.post(
        "/v1/cad/jobs",
        json={"type": "list_commands", "payload": {}},
    )
    assert refused.status_code == 403


def test_inspection_still_requires_the_solidcraft_engine(monkeypatch, tmp_path):
    monkeypatch.delenv("PISTOLA_CAD_ENGINE", raising=False)
    monkeypatch.setenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", "0")
    _isolate(monkeypatch, tmp_path)

    response = TestClient(app).post(
        "/v1/cad/jobs",
        json={"type": "inspect_center_of_mass", "payload": _payload(["body-a"])},
    )

    assert response.status_code == 400
    assert "SolidCraft engine" in response.json()["detail"]


def _run(solidcraft_cli: str, job_type: str, payload: dict, tmp_path: Path):
    return run_inspection(
        job_id=f"job-{job_type}",
        job_type=job_type,
        payload=InspectionPayload.model_validate(payload),
        artifact_dir=tmp_path,
    )


def test_interference_reports_the_overlap_volume(solidcraft_cli: str, tmp_path: Path):
    result = _run(solidcraft_cli, "inspect_interference", _payload(["body-a", "body-b"]), tmp_path)

    assert result.status == "succeeded", result.error
    assert result.result is not None
    assert result.result.data["command"] == "inspect.interference"
    outcome = result.result.data["result"]
    assert outcome["count"] == 1
    assert outcome["interferences"][0]["volume_mm3"] == 18000.0
    assert outcome["interferences"][0]["a"] == "PistolaBody1"
    assert outcome["interferences"][0]["b"] == "PistolaBody2"


def test_center_of_mass_covers_every_named_body(solidcraft_cli: str, tmp_path: Path):
    result = _run(solidcraft_cli, "inspect_center_of_mass", _payload(["body-a", "body-b"]), tmp_path)

    assert result.status == "succeeded", result.error
    assert result.result is not None
    outcome = result.result.data["result"]
    assert [body["body"] for body in outcome["bodies"]] == [
        "PistolaBody1",
        "PistolaBody2",
    ]
    assert outcome["volume"] == 48000.0


def test_clearance_reports_the_same_overlap(solidcraft_cli: str, tmp_path: Path):
    result = _run(solidcraft_cli, "inspect_clearance", _payload(["body-a", "body-b"]), tmp_path)

    assert result.status == "succeeded", result.error
    assert result.result is not None
    outcome = result.result.data["result"]
    assert len(outcome["overlaps"]) == 1
    assert outcome["overlaps"][0]["volume_mm3"] == 18000.0
