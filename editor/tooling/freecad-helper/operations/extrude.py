from __future__ import annotations

from pathlib import Path

from freecad_bridge import run_freecad_job
from schemas import ExtrudePayload, JobResult


def run_extrude(*, job_id: str, payload: ExtrudePayload, artifact_dir: Path) -> JobResult:
    return run_freecad_job(
        job_id=job_id,
        job_type="extrude",
        payload=payload.model_dump(mode="json"),
        artifact_dir=artifact_dir,
    )
