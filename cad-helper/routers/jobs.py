from __future__ import annotations

import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import TypeAdapter, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as StarletteUploadFile

from auth import require_helper_token
from engine import (
    CadEngine,
    get_cad_engine,
    is_inspection_job_type,
    is_passthrough_job_type,
    is_solidcraft_only,
)
from job_store import JobStore
from operations.boolean import run_boolean_operation
from operations.extrude import run_extrude
from operations.export_step import run_export_step
from operations.fillet_chamfer import run_chamfer, run_fillet
from operations.import_step import run_import_step
from operations.revolve import run_revolve
from operations.sketch_to_solid import run_regenerate, run_sketch_to_solid
from schemas import JobRequest, JobResult, JobStatus
from settings import allow_passthrough, job_retention, job_ttl_seconds, max_concurrency


router = APIRouter(dependencies=[Depends(require_helper_token)])

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / ".artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = ARTIFACT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

JOB_REQUEST_ADAPTER = TypeAdapter(JobRequest)

_GATE_LOCK = threading.Lock()
_GATE: threading.BoundedSemaphore | None = None
_GATE_SIZE: int | None = None

_JOB_STORE_LOCK = threading.Lock()
_JOB_STORE: JobStore | None = None


def concurrency_gate() -> threading.BoundedSemaphore:
    """The process-wide cap on concurrently running CAD jobs."""
    global _GATE, _GATE_SIZE

    size = max_concurrency()
    with _GATE_LOCK:
        if _GATE is None or _GATE_SIZE != size:
            _GATE = threading.BoundedSemaphore(size)
            _GATE_SIZE = size
        return _GATE


def reset_concurrency_gate() -> None:
    """Drop the gate so the next request re-reads the environment."""
    global _GATE, _GATE_SIZE

    with _GATE_LOCK:
        _GATE = None
        _GATE_SIZE = None


def get_job_store() -> JobStore:
    """The process-wide job store, configured on first use."""
    global _JOB_STORE

    with _JOB_STORE_LOCK:
        if _JOB_STORE is None:
            _JOB_STORE = JobStore(
                max_jobs=job_retention(),
                ttl_seconds=job_ttl_seconds(),
                artifact_dir=ARTIFACT_DIR,
            )
        return _JOB_STORE


def reset_job_store() -> None:
    """Drop the store so the next request re-reads the environment."""
    global _JOB_STORE

    with _JOB_STORE_LOCK:
        _JOB_STORE = None


def _job_id() -> str:
    return f"cadjob_{uuid4().hex}"


def _freecad_backend() -> SimpleNamespace:
    """The FreeCAD operations, which are the default and always importable."""
    return SimpleNamespace(
        run_sketch_to_solid=run_sketch_to_solid,
        run_regenerate=run_regenerate,
        run_extrude=run_extrude,
        run_revolve=run_revolve,
        run_boolean_operation=run_boolean_operation,
        run_fillet=run_fillet,
        run_chamfer=run_chamfer,
        run_import_step=run_import_step,
        run_export_step=run_export_step,
    )


def _solidcraft_backend() -> Any:
    """The SolidCraft bridge, imported only when that engine is selected.

    Its ``run_*`` functions take the same keyword arguments as the FreeCAD
    operations, so one dispatch block below serves both engines.
    """
    from solidcraft import jobs as solidcraft_jobs

    return solidcraft_jobs


def _backend_for(engine: CadEngine) -> Any:
    return _solidcraft_backend() if engine == "solidcraft" else _freecad_backend()


def _run_job(request: JobRequest, job_id: str) -> JobResult:
    engine = get_cad_engine()

    if is_solidcraft_only(request.type) and engine != "solidcraft":
        raise HTTPException(
            status_code=400,
            detail=(
                f"CAD job type {request.type!r} requires the SolidCraft engine. "
                "Set PISTOLA_CAD_ENGINE=solidcraft to enable it."
            ),
        )

    backend = _backend_for(engine)

    if request.type == "sketch_to_solid":
        return backend.run_sketch_to_solid(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "regenerate":
        return backend.run_regenerate(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "extrude":
        return backend.run_extrude(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "revolve":
        return backend.run_revolve(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type in {"boolean_union", "boolean_cut", "boolean_intersect"}:
        operation = request.type.removeprefix("boolean_")
        return backend.run_boolean_operation(
            job_id=job_id,
            operation=operation,
            payload=request.payload,
            artifact_dir=ARTIFACT_DIR,
        )
    if request.type == "fillet":
        return backend.run_fillet(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "chamfer":
        return backend.run_chamfer(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "import_step":
        return backend.run_import_step(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "export_step":
        return backend.run_export_step(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "command":
        return backend.run_command(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "batch":
        return backend.run_batch(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "list_commands":
        return backend.run_list_commands(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if request.type == "describe_command":
        return backend.run_describe_command(job_id=job_id, payload=request.payload, artifact_dir=ARTIFACT_DIR)
    if is_inspection_job_type(request.type):
        return backend.run_inspection(
            job_id=job_id,
            job_type=request.type,
            payload=request.payload,
            artifact_dir=ARTIFACT_DIR,
        )
    raise HTTPException(status_code=400, detail=f"Unsupported CAD job type: {request.type}")


@router.post("/jobs", response_model=JobStatus)
async def create_job(request: Request) -> JobStatus:
    # Named before parsing so an uploaded file carries the job id and is
    # evicted with it; a uuid4 name would outlive every job that used it.
    job_id = _job_id()

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
            upload_path = UPLOAD_DIR / f"{job_id}-source{suffix}"
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

    # Only raw catalog access is gated. Named inspection jobs map to one fixed
    # command each, so they stay available on a public helper.
    if is_passthrough_job_type(parsed_request.type) and not allow_passthrough():
        raise HTTPException(
            status_code=403,
            detail=(
                f"CAD job type {parsed_request.type!r} is disabled on this helper. "
                "Set PISTOLA_CAD_ALLOW_PASSTHROUGH=1 to serve the SolidCraft "
                "passthrough job types."
            ),
        )

    gate = concurrency_gate()
    if not gate.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail=(
                "CAD helper is at capacity: PISTOLA_CAD_MAX_CONCURRENCY jobs are "
                "already running. Retry shortly."
            ),
            headers={"Retry-After": "1"},
        )

    try:
        # The engine call shells out with a timeout of up to 300s. Running it
        # inline would freeze the event loop, so every other request —
        # /health included — would wait for it.
        result = await run_in_threadpool(_run_job, request=parsed_request, job_id=job_id)
    finally:
        gate.release()

    get_job_store().put(job_id, result)
    return JobStatus(jobId=job_id, status="pending")


@router.get("/jobs/{job_id}", response_model=JobResult)
def get_job(job_id: str) -> JobResult:
    job = get_job_store().get(job_id)
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
