from __future__ import annotations

from pathlib import Path

from freecad_bridge import run_freecad_job
from schemas import ExportStepPayload, JobResult


def run_export_step(*, job_id: str, payload: ExportStepPayload, artifact_dir: Path) -> JobResult:
    return run_freecad_job(
        job_id=job_id,
        job_type="export_step",
        payload=payload.model_dump(mode="json"),
        artifact_dir=artifact_dir,
    )
