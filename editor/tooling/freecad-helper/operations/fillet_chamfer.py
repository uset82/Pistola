from __future__ import annotations

from pathlib import Path

from schemas import ChamferPayload, FilletPayload, JobResult


def run_fillet(*, job_id: str, payload: FilletPayload, artifact_dir: Path) -> JobResult:
    return JobResult(
        jobId=job_id,
        type="fillet",
        status="failed",
        warnings=[],
        error=(
            "fillet is deferred until post-phase-1 FreeCAD integration. "
            "Core sketch/extrude/revolve/import/export operations are available first."
        ),
    )


def run_chamfer(*, job_id: str, payload: ChamferPayload, artifact_dir: Path) -> JobResult:
    return JobResult(
        jobId=job_id,
        type="chamfer",
        status="failed",
        warnings=[],
        error=(
            "chamfer is deferred until post-phase-1 FreeCAD integration. "
            "Core sketch/extrude/revolve/import/export operations are available first."
        ),
    )
