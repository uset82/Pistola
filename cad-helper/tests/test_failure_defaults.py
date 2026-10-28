"""The helper must fail closed when a deployment variable is missing or wrong.

Every case here passed silently before: a blank token disabled authentication,
an unrecognised passthrough value enabled the passthrough, and an uploaded file
outlived every job that referenced it. None of them raised, so nothing caught
them except reading the code.
"""

from __future__ import annotations

import threading
from pathlib import Path

import pytest
from fastapi import HTTPException

import settings
from auth import log_auth_configuration, require_helper_token
from job_store import JobStore
from schemas import JobResult


# --- the shared token ------------------------------------------------------


def test_absent_token_leaves_the_helper_open():
    """The local-development default: no variable, no authentication."""
    assert settings.helper_token({}) is None


def test_configured_token_is_returned():
    assert settings.helper_token({settings.TOKEN_ENV: "s3cret"}) == "s3cret"


@pytest.mark.parametrize("blank", ["", "   ", "\t"])
def test_blank_token_refuses_rather_than_disabling_auth(blank):
    """A secret that failed to resolve must not publish an open CAD engine."""
    with pytest.raises(settings.ConfigurationError):
        settings.helper_token({settings.TOKEN_ENV: blank})


def test_startup_fails_when_the_token_is_blank(monkeypatch):
    monkeypatch.setenv(settings.TOKEN_ENV, "")
    with pytest.raises(settings.ConfigurationError):
        log_auth_configuration()


def test_requests_get_503_when_the_token_is_blank(monkeypatch):
    monkeypatch.setenv(settings.TOKEN_ENV, "   ")
    with pytest.raises(HTTPException) as caught:
        require_helper_token(authorization=None)
    # Not 401: the caller did nothing wrong, the deployment is broken.
    assert caught.value.status_code == 503


def test_startup_is_quiet_when_the_token_is_absent(monkeypatch):
    monkeypatch.delenv(settings.TOKEN_ENV, raising=False)
    log_auth_configuration()  # warns, does not raise


# --- the passthrough gate --------------------------------------------------


def test_passthrough_defaults_on_so_local_use_is_unchanged():
    assert settings.allow_passthrough({}) is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "disabled", "FALSE", " Off "])
def test_passthrough_recognises_disabling_values(value):
    assert settings.allow_passthrough({settings.ALLOW_PASSTHROUGH_ENV: value}) is False


@pytest.mark.parametrize("value", ["1", "true", "yes", "on", "enabled", "TRUE"])
def test_passthrough_recognises_enabling_values(value):
    assert settings.allow_passthrough({settings.ALLOW_PASSTHROUGH_ENV: value}) is True


@pytest.mark.parametrize("typo", ["none", "nope", "disable", "offf", "2"])
def test_unrecognised_passthrough_value_fails_closed(typo):
    """Someone expressed an intent and mistyped it. Read that as "off"."""
    assert settings.allow_passthrough({settings.ALLOW_PASSTHROUGH_ENV: typo}) is False


# --- artifact eviction -----------------------------------------------------


def _succeeded(job_id: str) -> JobResult:
    return JobResult(jobId=job_id, type="import_step", status="succeeded")


def test_eviction_removes_an_uploaded_source_file(tmp_path: Path):
    """Uploads live in a subdirectory, so eviction has to recurse into it."""
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    job_id = "cadjob_deadbeef"
    upload = uploads / f"{job_id}-source.step"
    upload.write_text("ISO-10303-21;")

    store = JobStore(max_jobs=1, ttl_seconds=3600, artifact_dir=tmp_path)
    store.put(job_id, _succeeded(job_id))
    assert upload.exists()

    # One more job pushes the first out of a store that holds one.
    store.put("cadjob_other", _succeeded("cadjob_other"))
    assert not upload.exists(), "an evicted job must take its uploaded source with it"


def test_eviction_leaves_files_belonging_to_other_jobs(tmp_path: Path):
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    keep = uploads / "cadjob_keep-source.step"
    keep.write_text("ISO-10303-21;")

    store = JobStore(max_jobs=1, ttl_seconds=3600, artifact_dir=tmp_path)
    store.put("cadjob_evicted", _succeeded("cadjob_evicted"))
    store.put("cadjob_newest", _succeeded("cadjob_newest"))

    assert keep.exists(), "eviction must only match the evicted job's own id"


# --- concurrency -----------------------------------------------------------


def test_store_survives_concurrent_put_and_get(tmp_path: Path):
    """create_job puts on the event loop; the sync get_job route puts FastAPI's
    threadpool on the same dict. Without a lock this raced."""
    store = JobStore(max_jobs=20, ttl_seconds=3600, artifact_dir=tmp_path)
    failures: list[BaseException] = []

    def put_many() -> None:
        try:
            for index in range(300):
                store.put(f"cadjob_{index}", _succeeded(f"cadjob_{index}"))
        except BaseException as error:  # noqa: BLE001 - recorded and re-raised below
            failures.append(error)

    def get_many() -> None:
        try:
            for index in range(300):
                store.get(f"cadjob_{index}")
        except BaseException as error:  # noqa: BLE001
            failures.append(error)

    workers = [threading.Thread(target=put_many) for _ in range(3)]
    workers += [threading.Thread(target=get_many) for _ in range(3)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join()

    assert not failures, f"concurrent access raised: {failures!r}"
    assert len(store) <= 20
