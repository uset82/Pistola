from __future__ import annotations

from pathlib import Path

from freecad_bridge import run_freecad_job
from schemas import ImportStepPayload, JobResult


def run_import_step(*, job_id: str, payload: ImportStepPayload, artifact_dir: Path) -> JobResult:
    return run_freecad_job(
        job_id=job_id,
        job_type="import_step",
        payload=payload.model_dump(mode="json"),
        artifact_dir=artifact_dir,
    )
