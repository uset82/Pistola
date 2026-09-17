from __future__ import annotations

from pathlib import Path

from freecad_bridge import run_freecad_job
from schemas import JobResult, RegeneratePayload, SketchToSolidPayload


def run_sketch_to_solid(*, job_id: str, payload: SketchToSolidPayload, artifact_dir: Path) -> JobResult:
    return run_freecad_job(
        job_id=job_id,
        job_type="sketch_to_solid",
        payload=payload.model_dump(mode="json"),
        artifact_dir=artifact_dir,
    )


def run_regenerate(*, job_id: str, payload: RegeneratePayload, artifact_dir: Path) -> JobResult:
    return run_freecad_job(
        job_id=job_id,
        job_type="regenerate",
        payload=payload.model_dump(mode="json"),
        artifact_dir=artifact_dir,
    )
