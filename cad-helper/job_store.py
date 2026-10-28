"""A bounded job store that owns its job artifacts.

Before hosting, ``JOBS`` was a module-level dict that only ever grew, and
nothing ever deleted STEP output from ``.artifacts/``. On a long-lived
container both fill the disk and every later job fails. These two leaks share
one lifecycle, so they share one module: an evicted job takes its files with
it, and a startup sweep removes files orphaned by a previous process.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from schemas import JobResult

ARTIFACT_URL_PREFIX = "/v1/cad/artifacts/"


@dataclass
class StoredJob:
    result: JobResult
    created_at: float


class JobStore:
    """Job results capped by count and by age, evicting oldest first."""

    def __init__(
        self,
        *,
        max_jobs: int,
        ttl_seconds: float,
        artifact_dir: Path | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_jobs < 1:
            raise ValueError("max_jobs must be at least 1")
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        self._max_jobs = max_jobs
        self._ttl_seconds = ttl_seconds
        self._artifact_dir = artifact_dir.resolve() if artifact_dir is not None else None
        self._clock = clock
        self._jobs: dict[str, StoredJob] = {}

    def __len__(self) -> int:
        return len(self._jobs)

    def __contains__(self, job_id: str) -> bool:
        return self.get(job_id) is not None

    def put(self, job_id: str, result: JobResult) -> None:
        self._jobs[job_id] = StoredJob(result=result, created_at=self._clock())
        self._evict_expired()
        self._evict_overflow()

    def get(self, job_id: str) -> JobResult | None:
        entry = self._jobs.get(job_id)
        if entry is None:
            return None
        if self._is_expired(entry):
            self._remove(job_id)
            return None
        return entry.result

    def clear(self) -> None:
        for job_id in list(self._jobs):
            self._remove(job_id)

    def _is_expired(self, entry: StoredJob) -> bool:
        return self._clock() - entry.created_at >= self._ttl_seconds

    def _evict_expired(self) -> None:
        for job_id, entry in list(self._jobs.items()):
            if self._is_expired(entry):
                self._remove(job_id)

    def _evict_overflow(self) -> None:
        while len(self._jobs) > self._max_jobs:
            oldest_job_id = next(iter(self._jobs))
            self._remove(oldest_job_id)

    def _remove(self, job_id: str) -> None:
        entry = self._jobs.pop(job_id, None)
        if entry is not None:
            self._delete_artifacts(job_id, entry.result)

    def _delete_artifacts(self, job_id: str, result: JobResult) -> None:
        if self._artifact_dir is None:
            return

        for candidate in self._artifact_paths(job_id, result):
            try:
                resolved = candidate.resolve()
            except OSError:
                continue
            # Only ever delete inside the artifact root: an export_step target
            # may legitimately point elsewhere on the machine.
            if self._artifact_dir not in resolved.parents:
                continue
            try:
                resolved.unlink()
            except OSError:
                continue

    def _artifact_paths(self, job_id: str, result: JobResult) -> list[Path]:
        assert self._artifact_dir is not None
        candidates: list[Path] = []

        payload = result.result
        if payload is not None:
            artifacts = payload.artifacts
            for ref in (artifacts.previewArtifactRef, artifacts.cadArtifactRef):
                if ref:
                    candidates.append(Path(ref))
            for url in (artifacts.previewUrl, artifacts.cadUrl, artifacts.exportUrl):
                if url and url.startswith(ARTIFACT_URL_PREFIX):
                    relative = url.removeprefix(ARTIFACT_URL_PREFIX)
                    if relative:
                        candidates.append(self._artifact_dir / relative)

        # A failed job never records refs, and a killed one can leave partial
        # files behind; both are named after the job id.
        candidates.extend(self._artifact_dir.glob(f"{job_id}*"))

        seen: set[Path] = set()
        unique: list[Path] = []
        for candidate in candidates:
            if candidate not in seen:
                seen.add(candidate)
                unique.append(candidate)
        return unique


def sweep_artifacts(
    artifact_dir: Path,
    older_than_seconds: float,
    *,
    now: float | None = None,
) -> int:
    """Delete files in ``artifact_dir`` older than the retention window.

    Called once at startup: job entries do not survive a restart, so any file
    that outlived the previous process is already unreachable. Without this a
    container restart would orphan its whole working directory.
    """
    if not artifact_dir.exists():
        return 0

    cutoff = (time.time() if now is None else now) - older_than_seconds
    removed = 0
    for path in sorted(artifact_dir.rglob("*")):
        if not path.is_file():
            continue
        try:
            modified = path.stat().st_mtime
        except OSError:
            continue
        if modified >= cutoff:
            continue
        try:
            path.unlink()
        except OSError:
            continue
        removed += 1
    return removed
