"""A material is body state, so a regenerate must re-apply it.

Material lives on `CadBodyNode` rather than in the operation timeline (see
docs/plans/cad-material-cards.md). A regenerate rebuilds the body from its
timeline in a fresh headless process, so without an explicit `material.assign`
after the geometry the assignment would be silently lost. The tests here fail
if that step disappears.

The engineering card is carried verbatim and validated by SolidCraft through
`material.properties.directional`; Pistola does not duplicate that validator.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine import (
    SOLIDCRAFT_MATERIAL_JOB_TYPES,
    is_material_job_type,
    is_passthrough_job_type,
)
from job_store import JobStore
from main import app
from routers import jobs
from schemas import AssignCadMaterialPayload
from solidcraft.client import get_client, resolve_cli_path
from solidcraft.jobs import run_assign_cad_material, run_regenerate
from solidcraft.mapping import (
    MATERIAL_ASSIGN_COMMAND,
    directional_material_command,
    material_commands,
)
from schemas import RegeneratePayload

SKETCH_ID = "sketch-material"
BODY_ID = "body-material"


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
                "id": "rect-material",
                "kind": "rectangle",
                "center": [0.0, 0.0],
                "width": 0.04,
                "height": 0.03,
            }
        ],
    }


def _operation() -> dict:
    return {
        "id": "op-material",
        "type": "extrude",
        "kind": "extrude",
        "suppressed": False,
        "sketchId": SKETCH_ID,
        "params": {"distance": 0.02, "direction": [0.0, 1.0, 0.0], "symmetric": False},
        "distance": 0.02,
        "depth": 0.02,
        "direction": [0.0, 1.0, 0.0],
        "symmetric": False,
    }


def _body(material: dict | None = None) -> dict:
    body = {
        "id": BODY_ID,
        "name": "Material Body",
        "operations": [_operation()],
        "position": [0.0, 0.0, 0.0],
    }
    if material is not None:
        body["material"] = material
    return body


def _card() -> dict:
    """A deliberately synthetic orthotropic card, following the documented schema."""
    return {
        "schema_version": 1,
        "designation": "Synthetic orthotropic example — not design data",
        "family": "metal",
        "sources": [
            {"id": "example", "title": "Synthetic example", "kind": "illustrative"}
        ],
        "properties": [
            {
                "data": {
                    "kind": "elasticity",
                    "model": {
                        "symmetry": "orthotropic",
                        "axes": "material123",
                        "young_moduli_pa": [200e9, 100e9, 50e9],
                        "shear_moduli_pa": [76e9, 38e9, 19e9],
                        "poisson_ratios": [0.3, 0.25, 0.2],
                    },
                },
                "source_id": "example",
            }
        ],
    }


def _closure() -> dict:
    body = _body()
    return {
        "bodyIds": [BODY_ID],
        "bodies": {BODY_ID: body},
        "sketches": {SKETCH_ID: _sketch()},
    }


def _assign_payload(**material) -> dict:
    return {**_closure(), "material": material}


class RecordingClient:
    """Delegates to the real client and records every command script."""

    def __init__(self, inner):
        self._inner = inner
        self.scripts: list[list[dict]] = []

    def __getattr__(self, name):
        return getattr(self._inner, name)

    def run_script(self, commands, **kwargs):
        self.scripts.append([dict(command) for command in commands])
        return self._inner.run_script(commands, **kwargs)


def test_material_is_a_named_job_not_passthrough():
    assert SOLIDCRAFT_MATERIAL_JOB_TYPES == {"assign_cad_material"}
    assert is_material_job_type("assign_cad_material") is True
    assert is_passthrough_job_type("assign_cad_material") is False


def test_material_commands_are_empty_without_a_name():
    assert material_commands(None, "PistolaBody") == []
    assert material_commands({}, "PistolaBody") == []
    assert material_commands({"name": "  "}, "PistolaBody") == []


def test_material_command_targets_the_rebuilt_body():
    assert material_commands({"name": "Steel"}, "PistolaBody") == [
        {
            "command": MATERIAL_ASSIGN_COMMAND,
            "params": {"bodies": ["PistolaBody"], "material": "Steel"},
        }
    ]


def test_directional_command_defaults_to_the_material_1_axis():
    command = directional_material_command({"schema_version": 1})

    assert command["command"] == "material.properties.directional"
    assert command["params"]["direction"] == [1.0, 0.0, 0.0]


def test_directional_command_refuses_a_zero_direction():
    with pytest.raises(Exception, match="non-zero"):
        directional_material_command({"schema_version": 1}, [0, 0, 0])


def test_regenerate_reapplies_the_material_after_the_geometry(
    solidcraft_cli: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """Removing the material step from run_regenerate must fail this test."""
    recording = RecordingClient(get_client())
    monkeypatch.setattr(
        "solidcraft.jobs.get_client", lambda *args, **kwargs: recording
    )

    material = {"name": "Steel", "card": None}
    result = run_regenerate(
        job_id="job-material-regenerate",
        payload=RegeneratePayload.model_validate(
            {
                "body": _body(material),
                "sketch": _sketch(),
                "sketches": {SKETCH_ID: _sketch()},
                "bodies": {BODY_ID: _body(material)},
            }
        ),
        artifact_dir=tmp_path,
    )

    assert result.status == "succeeded", result.error
    assert recording.scripts, "the regenerate should have run a command script"

    commands = recording.scripts[0]
    command_ids = [command["command"] for command in commands]
    assert MATERIAL_ASSIGN_COMMAND in command_ids, (
        "the regenerate must re-apply the body's material after rebuilding it"
    )
    assert command_ids.index(MATERIAL_ASSIGN_COMMAND) > command_ids.index("solid.extrude")
    assert commands[command_ids.index(MATERIAL_ASSIGN_COMMAND)]["params"] == {
        "bodies": ["PistolaBody"],
        "material": "Steel",
    }


def test_regenerate_without_a_material_emits_no_assignment(
    solidcraft_cli: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    recording = RecordingClient(get_client())
    monkeypatch.setattr(
        "solidcraft.jobs.get_client", lambda *args, **kwargs: recording
    )

    result = run_regenerate(
        job_id="job-material-none",
        payload=RegeneratePayload.model_validate(
            {
                "body": _body(),
                "sketch": _sketch(),
                "sketches": {SKETCH_ID: _sketch()},
                "bodies": {BODY_ID: _body()},
            }
        ),
        artifact_dir=tmp_path,
    )

    assert result.status == "succeeded", result.error
    assert MATERIAL_ASSIGN_COMMAND not in [
        command["command"] for command in recording.scripts[0]
    ]


def test_assign_material_applies_the_name_and_reports_the_directional_modulus(
    solidcraft_cli: str, tmp_path: Path
):
    result = run_assign_cad_material(
        job_id="job-material-assign",
        payload=AssignCadMaterialPayload.model_validate(
            _assign_payload(name="Steel", card=_card(), direction=[1, 0, 0])
        ),
        artifact_dir=tmp_path,
    )

    assert result.status == "succeeded", result.error
    assert result.result is not None
    data = result.result.data

    assert data["command"] == MATERIAL_ASSIGN_COMMAND
    assert data["material"] == "Steel"
    assert data["assignment"]["material"] == "Steel"
    assert data["assignment"]["bodies"] == ["PistolaBody1"]

    directional = data["directional"]
    assert directional["axes"] == "material123"
    assert directional["young_modulus_pa"] == pytest.approx(200e9, rel=1e-6)
    assert directional["validation"]["analysis_solver_available"] is False


def test_assign_material_accepts_an_isotropic_card(
    solidcraft_cli: str, tmp_path: Path
):
    card = {
        "schema_version": 1,
        "designation": "Synthetic isotropic example — not design data",
        "family": "other",
        "sources": [
            {"id": "example", "title": "Synthetic example", "kind": "illustrative"}
        ],
        "properties": [
            {
                "data": {
                    "kind": "elasticity",
                    "model": {
                        "symmetry": "isotropic",
                        "young_modulus_pa": 120e9,
                        "poisson_ratio": 0.25,
                    },
                },
                "source_id": "example",
            }
        ],
    }

    result = run_assign_cad_material(
        job_id="job-material-isotropic",
        payload=AssignCadMaterialPayload.model_validate(
            _assign_payload(name="Aluminum", card=card)
        ),
        artifact_dir=tmp_path,
    )

    assert result.status == "succeeded", result.error
    assert result.result is not None
    directional = result.result.data["directional"]
    assert directional["young_modulus_pa"] == pytest.approx(120e9, rel=1e-9)
    assert directional["axes"] is None


def test_assign_material_rejects_an_unknown_material(
    solidcraft_cli: str, tmp_path: Path
):
    result = run_assign_cad_material(
        job_id="job-material-unknown",
        payload=AssignCadMaterialPayload.model_validate(
            _assign_payload(name="Not A Real Material")
        ),
        artifact_dir=tmp_path,
    )

    assert result.status == "failed"
    assert result.error, "the helper must report why the assignment failed"


def test_assign_material_rejects_an_invalid_card(solidcraft_cli: str, tmp_path: Path):
    invalid_card = {"schema_version": 1}

    result = run_assign_cad_material(
        job_id="job-material-bad-card",
        payload=AssignCadMaterialPayload.model_validate(
            _assign_payload(name="Steel", card=invalid_card)
        ),
        artifact_dir=tmp_path,
    )

    assert result.status == "failed"
    assert result.error


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


def test_material_job_is_served_while_passthrough_is_closed(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", "0")
    monkeypatch.setenv("PISTOLA_CAD_ENGINE", "solidcraft")
    _isolate(monkeypatch, tmp_path)
    client = TestClient(app)

    assigned = client.post(
        "/v1/cad/jobs",
        json={"type": "assign_cad_material", "payload": _assign_payload(name="Steel")},
    )
    assert assigned.status_code == 200, assigned.text

    refused = client.post("/v1/cad/jobs", json={"type": "list_commands", "payload": {}})
    assert refused.status_code == 403


def test_material_job_still_requires_the_solidcraft_engine(monkeypatch, tmp_path):
    monkeypatch.delenv("PISTOLA_CAD_ENGINE", raising=False)
    monkeypatch.setenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", "0")
    _isolate(monkeypatch, tmp_path)

    response = TestClient(app).post(
        "/v1/cad/jobs",
        json={"type": "assign_cad_material", "payload": _assign_payload(name="Steel")},
    )

    assert response.status_code == 400
    assert "SolidCraft engine" in response.json()["detail"]
