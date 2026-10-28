"""The SolidCraft passthrough types are gated for hosted deployments.

`pistola.canner.app` has no account wall, so a public helper must serve only
the canonical geometry jobs. Unset keeps them available locally.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from settings import allow_passthrough

PASSTHROUGH_TYPES = ("command", "batch", "list_commands", "describe_command")

PASSTHROUGH_PAYLOADS = {
    "command": {"command": "document.units", "params": {}},
    "batch": {"commands": []},
    "list_commands": {},
    "describe_command": {"command": "solid.extrude"},
}


@pytest.mark.parametrize("value", ["0", "false", "FALSE", "no", "off", "disabled"])
def test_flag_off_disables_passthrough(value: str):
    assert allow_passthrough({"PISTOLA_CAD_ALLOW_PASSTHROUGH": value}) is False


@pytest.mark.parametrize("value", ["1", "true", "yes", "on", ""])
def test_flag_on_or_unset_keeps_passthrough(value: str):
    assert allow_passthrough({"PISTOLA_CAD_ALLOW_PASSTHROUGH": value}) is True


def test_flag_defaults_to_on_when_unset():
    assert allow_passthrough({}) is True


@pytest.mark.parametrize("job_type", PASSTHROUGH_TYPES)
def test_passthrough_job_types_return_403_when_disabled(
    monkeypatch, job_type: str
):
    monkeypatch.setenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", "0")
    monkeypatch.delenv("PISTOLA_CAD_HELPER_TOKEN", raising=False)

    response = TestClient(app).post(
        "/v1/cad/jobs",
        json={"type": job_type, "payload": PASSTHROUGH_PAYLOADS[job_type]},
    )

    assert response.status_code == 403
    assert "PISTOLA_CAD_ALLOW_PASSTHROUGH" in response.json()["detail"]


def test_passthrough_is_not_refused_when_the_flag_is_unset(monkeypatch):
    monkeypatch.delenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", raising=False)
    monkeypatch.delenv("PISTOLA_CAD_HELPER_TOKEN", raising=False)
    monkeypatch.delenv("PISTOLA_CAD_ENGINE", raising=False)

    response = TestClient(app).post(
        "/v1/cad/jobs",
        json={"type": "list_commands", "payload": {}},
    )

    # FreeCAD is the default engine, so the request gets past the passthrough
    # gate and is then refused by the engine check with a 400.
    assert response.status_code == 400
    assert "SolidCraft engine" in response.json()["detail"]


def test_geometry_jobs_are_unaffected_by_the_flag(monkeypatch):
    from job_store import JobStore
    from routers import jobs
    from schemas import JobResult

    monkeypatch.setenv("PISTOLA_CAD_ALLOW_PASSTHROUGH", "0")
    monkeypatch.delenv("PISTOLA_CAD_HELPER_TOKEN", raising=False)
    monkeypatch.setattr(
        jobs,
        "_run_job",
        lambda *, request, job_id: JobResult(
            jobId=job_id, type=request.type, status="succeeded"
        ),
    )
    monkeypatch.setattr(
        jobs, "_JOB_STORE", JobStore(max_jobs=10, ttl_seconds=60)
    )

    response = TestClient(app).post(
        "/v1/cad/jobs",
        json={
            "type": "extrude",
            "payload": {"sketchId": "sketch-1", "distance": 1.2, "sketch": {}},
        },
    )

    assert response.status_code == 200
