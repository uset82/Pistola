from __future__ import annotations

from pathlib import Path

from schemas import (
    BooleanCutPayload,
    BooleanIntersectPayload,
    BooleanUnionPayload,
    JobResult,
)


def run_boolean_operation(
    *,
    job_id: str,
    operation: str,
    payload: BooleanUnionPayload | BooleanCutPayload | BooleanIntersectPayload,
    artifact_dir: Path,
) -> JobResult:
    return JobResult(
        jobId=job_id,
        type=f"boolean_{operation}",
        status="failed",
        warnings=[],
        error=(
            f"boolean_{operation} is deferred until post-phase-1 FreeCAD integration. "
            "Core sketch/extrude/revolve/import/export operations are available first."
        ),
    )


def run_boolean(*, job_id: str, payload: BooleanUnionPayload, artifact_dir: Path) -> JobResult:
    return run_boolean_operation(
        job_id=job_id,
        operation="union",
        payload=payload,
        artifact_dir=artifact_dir,
    )
