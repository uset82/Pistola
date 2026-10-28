"""Job results and their artifacts share one lifetime.

The store is capped by count and by age, and evicting an entry deletes the
STEP files that job wrote. A startup sweep then removes whatever the previous
process left behind.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

from job_store import JobStore, sweep_artifacts
from schemas import ArtifactRefs, JobResult, JobResultPayload


def _result(job_id: str, artifact_dir: Path, filename: str | None = None) -> JobResult:
    name = filename or f"{job_id}.step"
    step = artifact_dir / name
    step.write_text("ISO-10303-21;\nEND-ISO-10303-21;\n", encoding="utf-8")
    return JobResult(
        jobId=job_id,
        type="extrude",
        status="succeeded",
        result=JobResultPayload(
            artifacts=ArtifactRefs(
                previewArtifactRef=step.as_posix(),
                cadArtifactRef=step.as_posix(),
                previewUrl=f"/v1/cad/artifacts/{name}",
                cadUrl=f"/v1/cad/artifacts/{name}",
            )
        ),
    )


def test_store_stops_growing_past_the_cap(tmp_path: Path):
    store = JobStore(max_jobs=2, ttl_seconds=60, artifact_dir=tmp_path)

    store.put("cadjob_1", _result("cadjob_1", tmp_path))
    store.put("cadjob_2", _result("cadjob_2", tmp_path))
    store.put("cadjob_3", _result("cadjob_3", tmp_path))

    assert len(store) == 2
    assert store.get("cadjob_1") is None
    assert store.get("cadjob_2") is not None
    assert store.get("cadjob_3") is not None


def test_eviction_deletes_that_jobs_artifacts(tmp_path: Path):
    store = JobStore(max_jobs=1, ttl_seconds=60, artifact_dir=tmp_path)

    store.put("cadjob_1", _result("cadjob_1", tmp_path))
    evicted_file = tmp_path / "cadjob_1.step"
    kept_file = tmp_path / "cadjob_2.step"
    assert evicted_file.exists()

    store.put("cadjob_2", _result("cadjob_2", tmp_path))

    assert not evicted_file.exists()
    assert kept_file.exists()


def test_eviction_never_deletes_outside_the_artifact_root(tmp_path: Path):
    artifact_dir = tmp_path / "artifacts"
    artifact_dir.mkdir()
    outside = tmp_path / "elsewhere.step"
    outside.write_text("ISO-10303-21;", encoding="utf-8")

    store = JobStore(max_jobs=1, ttl_seconds=60, artifact_dir=artifact_dir)
    result = JobResult(
        jobId="cadjob_outside",
        type="export_step",
        status="succeeded",
        result=JobResultPayload(
            artifacts=ArtifactRefs(
                previewArtifactRef=outside.as_posix(),
                cadArtifactRef=outside.as_posix(),
            )
        ),
    )

    store.put("cadjob_outside", result)
    store.put("cadjob_next", JobResult(jobId="cadjob_next", type="extrude", status="succeeded"))

    assert outside.exists()


def test_expired_job_is_dropped_and_its_artifacts_removed(tmp_path: Path):
    now = [1000.0]
    store = JobStore(
        max_jobs=10,
        ttl_seconds=60,
        artifact_dir=tmp_path,
        clock=lambda: now[0],
    )

    store.put("cadjob_ttl", _result("cadjob_ttl", tmp_path))
    step = tmp_path / "cadjob_ttl.step"
    assert step.exists()

    now[0] += 61

    assert store.get("cadjob_ttl") is None
    assert len(store) == 0
    assert not step.exists()


def test_store_without_an_artifact_dir_still_caps_entries(tmp_path: Path):
    store = JobStore(max_jobs=1, ttl_seconds=60)

    store.put("a", JobResult(jobId="a", type="extrude", status="succeeded"))
    store.put("b", JobResult(jobId="b", type="extrude", status="succeeded"))

    assert len(store) == 1
    assert store.get("a") is None


def test_startup_sweep_removes_only_files_past_the_retention_window(tmp_path: Path):
    stale = tmp_path / "cadjob_stale.step"
    fresh = tmp_path / "cadjob_fresh.step"
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    stale_upload = uploads / "upload.step"

    for path in (stale, fresh, stale_upload):
        path.write_text("ISO-10303-21;", encoding="utf-8")

    now = time.time()
    for path in (stale, stale_upload):
        os.utime(path, (now - 7200, now - 7200))

    removed = sweep_artifacts(tmp_path, older_than_seconds=3600, now=now)

    assert removed == 2
    assert not stale.exists()
    assert not stale_upload.exists()
    assert fresh.exists()


def test_startup_sweep_tolerates_a_missing_directory(tmp_path: Path):
    assert sweep_artifacts(tmp_path / "absent", older_than_seconds=3600) == 0
