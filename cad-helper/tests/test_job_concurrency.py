"""CAD jobs must not run on the event loop.

`solidcraft-cli` is a synchronous subprocess with a timeout of up to 300s, so
while one job ran inline every other request — `/health` included — waited for
it. This is the defect the hosted helper cannot ship with.
"""

from __future__ import annotations

import asyncio
import threading
import time

import httpx

from main import app
from routers import jobs
from schemas import JobResult


def _extrude_request() -> dict:
    return {
        "type": "extrude",
        "payload": {"sketchId": "sketch-1", "distance": 1.2, "sketch": {}},
    }


def _succeeded(*, job_id: str, job_type: str) -> JobResult:
    return JobResult(jobId=job_id, type=job_type, status="succeeded")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://cad-helper",
    )


def _isolate(monkeypatch, concurrency: int) -> None:
    monkeypatch.setenv("PISTOLA_CAD_MAX_CONCURRENCY", str(concurrency))
    monkeypatch.setattr(jobs, "_GATE", None)
    monkeypatch.setattr(jobs, "_GATE_SIZE", None)
    monkeypatch.setattr(jobs, "JOBS", {})


def test_health_answers_while_two_jobs_are_running(monkeypatch):
    release = threading.Event()
    safety = threading.Timer(3.0, release.set)
    safety.daemon = True
    safety.start()

    started: list[str] = []
    finished: list[str] = []

    def slow_run_job(*, request, job_id):
        started.append(job_id)
        release.wait(5.0)
        finished.append(job_id)
        return _succeeded(job_id=job_id, job_type=request.type)

    monkeypatch.setattr(jobs, "_run_job", slow_run_job)
    _isolate(monkeypatch, concurrency=2)

    async def scenario() -> None:
        async with _client() as client:
            first = asyncio.create_task(client.post("/v1/cad/jobs", json=_extrude_request()))
            second = asyncio.create_task(client.post("/v1/cad/jobs", json=_extrude_request()))

            await asyncio.sleep(0.2)
            assert len(started) == 2, "both jobs should start; concurrency is 2"

            began = time.monotonic()
            health = await client.get("/health")
            elapsed = time.monotonic() - began

            assert health.status_code == 200
            assert elapsed < 1.0, f"/health took {elapsed:.2f}s while a job was running"
            assert finished == [], "health was served only after the jobs had finished"

            release.set()
            responses = await asyncio.gather(first, second)
            assert [response.status_code for response in responses] == [200, 200]

    try:
        asyncio.run(scenario())
    finally:
        release.set()
        safety.cancel()


def test_jobs_over_the_concurrency_limit_get_429(monkeypatch):
    release = threading.Event()
    started = threading.Event()

    def slow_run_job(*, request, job_id):
        started.set()
        release.wait(2.0)
        return _succeeded(job_id=job_id, job_type=request.type)

    monkeypatch.setattr(jobs, "_run_job", slow_run_job)
    _isolate(monkeypatch, concurrency=1)

    async def scenario() -> None:
        async with _client() as client:
            first = asyncio.create_task(client.post("/v1/cad/jobs", json=_extrude_request()))
            assert await asyncio.to_thread(started.wait, 2.0)

            refused = await client.post("/v1/cad/jobs", json=_extrude_request())
            assert refused.status_code == 429
            assert "PISTOLA_CAD_MAX_CONCURRENCY" in refused.json()["detail"]

            release.set()
            accepted = await first
            assert accepted.status_code == 200

    try:
        asyncio.run(scenario())
    finally:
        release.set()
