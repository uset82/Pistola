from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import TypeAdapter, ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

from operations.boolean import run_boolean_operation
from operations.extrude import run_extrude
from operations.export_step import run_export_step
from operations.fillet_chamfer import run_chamfer, run_fillet
from operations.import_step import run_import_step
from operations.revolve import run_revolve
from operations.sketch_to_solid import run_regenerate, run_sketch_to_solid
from schemas import JobRequest, JobResult, JobStatus


router = APIRouter()

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / ".artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = ARTIFACT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

JOBS: dict[str, JobResult] = {}
JOB_REQUEST_ADAPTER = TypeAdapter(JobRequest)


def _job_id() -> str:
    return f"cadjob_{uuid4().hex}"


def _run_job(request: JobRequest, job_id: str) -> JobResult:
    if request.type == "sketch_to_solid":
        return run_sketch_to_solid(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "regenerate":
        return run_regenerate(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "extrude":
        return run_extrude(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "revolve":
        return run_revolve(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type in {"boolean_union", "boolean_cut", "boolean_intersect"}:
        operation = request.type.removeprefix("boolean_")
        return run_boolean_operation(
            job_id=job_id,
            operation=operation,
            payload=request.payload,
            artifact_dir=ARTIFACT_DIR,
        )
    if request.type == "fillet":
        return run_fillet(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "chamfer":
        return run_chamfer(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "import_step":
        return run_import_step(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "export_step":
        return run_export_step(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    raise HTTPException(status_code=400, detail=f"Unsupported CAD job type: {request.type}")


@router.post("/jobs", response_model=JobStatus)
async def create_job(request: Request) -> JobStatus:
    try:
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("multipart/form-data"):
            form = await request.form()
            request_type = form.get("type")
            upload = form.get("file")

            if request_type != "import_step":
                raise HTTPException(status_code=400, detail="Multipart CAD jobs only support import_step.")
            if not isinstance(upload, (UploadFile, StarletteUploadFile)):
                raise HTTPException(status_code=400, detail="Missing STEP file upload.")

            suffix = Path(upload.filename or "import.step").suffix or ".step"
            upload_path = UPLOAD_DIR / f"{uuid4().hex}{suffix}"
            upload_path.write_bytes(await upload.read())
            parsed_request = JOB_REQUEST_ADAPTER.validate_python(
                {
                    "type": "import_step",
                    "payload": {"filePath": upload_path.as_posix()},
                }
            )
        else:
            parsed_request = JOB_REQUEST_ADAPTER.validate_python(await request.json())
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors()) from error

    job_id = _job_id()
    JOBS[job_id] = _run_job(request=parsed_request, job_id=job_id)
    return JobStatus(jobId=job_id, status="pending")


@router.get("/jobs/{job_id}", response_model=JobResult)
def get_job(job_id: str) -> JobResult:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CAD helper job not found.")
    return job


@router.get("/artifacts/{artifact_path:path}")
def get_artifact(artifact_path: str) -> FileResponse:
    resolved_path = (ARTIFACT_DIR / artifact_path).resolve()
    artifact_root = ARTIFACT_DIR.resolve()

    if resolved_path != artifact_root and artifact_root not in resolved_path.parents:
        raise HTTPException(status_code=404, detail="CAD artifact not found.")
    if not resolved_path.exists() or not resolved_path.is_file():
        raise HTTPException(status_code=404, detail="CAD artifact not found.")

    media_type = "application/step" if resolved_path.suffix.lower() in {".step", ".stp"} else "application/octet-stream"
    return FileResponse(resolved_path, filename=resolved_path.name, media_type=media_type)
