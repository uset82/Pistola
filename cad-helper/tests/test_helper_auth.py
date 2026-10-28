"""The helper's API is open by default and closed whenever a token is set.

Unset must stay open: local development has never needed a token, and the
planner starts this helper itself. Set must reject everything, because the
hosted helper sits on a public domain.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

JOB_ID = "cadjob_does-not-exist"


def _client() -> TestClient:
    return TestClient(app)


def _authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_every_v1_cad_route_requires_the_token_when_configured(monkeypatch):
    monkeypatch.setenv("PISTOLA_CAD_HELPER_TOKEN", "s3cret")

    client = _client()
    for path in ("/v1/cad/jobs/" + JOB_ID, "/v1/cad/artifacts/missing.step"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Basic abc"}).status_code == 401
        assert client.get(path, headers=_authorization("wrong")).status_code == 401


def test_correct_token_passes_the_gate(monkeypatch):
    monkeypatch.setenv("PISTOLA_CAD_HELPER_TOKEN", "s3cret")

    response = _client().get(
        "/v1/cad/jobs/" + JOB_ID,
        headers=_authorization("s3cret"),
    )

    # Any status except 401 proves the request was let through to the route;
    # an unknown job id is a 404.
    assert response.status_code == 404


def test_token_is_required_before_the_body_is_read(monkeypatch):
    monkeypatch.setenv("PISTOLA_CAD_HELPER_TOKEN", "s3cret")

    response = _client().post(
        "/v1/cad/jobs",
        json={"type": "extrude", "payload": {"sketchId": "sketch-1"}},
    )

    assert response.status_code == 401


def test_requests_are_accepted_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("PISTOLA_CAD_HELPER_TOKEN", raising=False)

    client = _client()
    assert client.get("/v1/cad/jobs/" + JOB_ID).status_code == 404
    assert client.get("/v1/cad/jobs/" + JOB_ID, headers=_authorization("anything")).status_code == 404


def test_health_stays_public(monkeypatch):
    """Railway's health check and the app's reachability probe cannot send it."""
    monkeypatch.setenv("PISTOLA_CAD_HELPER_TOKEN", "s3cret")

    assert _client().get("/health").status_code == 200
    assert _client().get("/v1/health").status_code == 200
