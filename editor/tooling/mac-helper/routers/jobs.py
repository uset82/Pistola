from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from mac_runner import MacJobManager
from schemas import MacJobCreateRequest, MacJobResult, MacJobStatus

router = APIRouter()

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / ".artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
MANAGER = MacJobManager(ARTIFACT_DIR)


def _job_id() -> str:
    return f"macjob_{uuid4().hex}"


@router.post("/jobs", response_model=MacJobStatus)
def create_job(request: MacJobCreateRequest) -> MacJobStatus:
    if request.mode != "part":
        raise HTTPException(status_code=400, detail="Only mode=part is supported in this increment.")

    job_id = _job_id()
    MANAGER.create(job_id=job_id, prompt=request.prompt, session_id=request.sessionId)
    return MacJobStatus(jobId=job_id, status="pending")


@router.get("/jobs/{job_id}", response_model=MacJobResult)
def get_job(job_id: str) -> MacJobResult:
    job = MANAGER.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="MAC helper job not found.")
    return job


@router.get("/artifacts/{artifact_path:path}")
def get_artifact(artifact_path: str) -> FileResponse:
    resolved_path = (ARTIFACT_DIR / artifact_path).resolve()
    artifact_root = ARTIFACT_DIR.resolve()

    if resolved_path != artifact_root and artifact_root not in resolved_path.parents:
        raise HTTPException(status_code=404, detail="MAC artifact not found.")
    if not resolved_path.exists() or not resolved_path.is_file():
        raise HTTPException(status_code=404, detail="MAC artifact not found.")

    suffix = resolved_path.suffix.lower()
    media_type = "application/octet-stream"
    if suffix in {".step", ".stp"}:
        media_type = "application/step"
    elif suffix == ".json":
        media_type = "application/json"
    elif suffix == ".py":
        media_type = "text/x-python"
    elif suffix == ".glb":
        media_type = "model/gltf-binary"

    return FileResponse(resolved_path, filename=resolved_path.name, media_type=media_type)
