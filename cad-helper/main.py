from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import log_auth_configuration
from engine import get_cad_engine
from freecad_runtime import FreeCADRuntimeError, build_helper_health_payload
from job_store import sweep_artifacts
from routers.jobs import ARTIFACT_DIR, router as jobs_router
from settings import job_ttl_seconds


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log_auth_configuration()
    # Job entries do not survive a restart, so anything past the retention
    # window is already unreachable and only consuming disk.
    sweep_artifacts(ARTIFACT_DIR, job_ttl_seconds())
    yield


app = FastAPI(title="Pistola CAD Helper", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(jobs_router, prefix="/v1/cad")

DEFAULT_HOST = os.getenv("PISTOLA_CAD_HELPER_HOST", "127.0.0.1")
DEFAULT_PORT = os.getenv("PISTOLA_CAD_HELPER_PORT", "7878")
HELPER_URL = f"http://{DEFAULT_HOST}:{DEFAULT_PORT}"

_HEALTH_CACHE: dict[str, dict[str, str]] = {}


def _error_payload(engine: str, error: Exception) -> dict[str, str]:
    """A health payload for an engine that could not be reached.

    The payload is a formal interface, so an unavailable engine reports
    ``status: "error"`` rather than "ready". The editor renders that state
    instead of falling back to placeholder geometry.
    """
    return {
        "status": "error",
        "runtime": "python",
        "engine": engine,
        "version": "unknown",
        "helperUrl": HELPER_URL,
        "error": str(error),
    }


def _freecad_health() -> dict[str, str]:
    # Probed on first request rather than at import. Probing at import meant a
    # machine without FREECAD_PATH could not start the helper at all, which
    # also blocked the SolidCraft engine from running on its own.
    if "freecad" not in _HEALTH_CACHE:
        try:
            _HEALTH_CACHE["freecad"] = build_helper_health_payload(DEFAULT_HOST, DEFAULT_PORT)
        except (FreeCADRuntimeError, OSError) as error:
            return _error_payload("freecad", error)
    return _HEALTH_CACHE["freecad"]


def _solidcraft_health() -> dict[str, str]:
    from solidcraft.client import SolidCraftError, get_client

    if "solidcraft" not in _HEALTH_CACHE:
        try:
            version = get_client().version()
        except (SolidCraftError, OSError) as error:
            return _error_payload("solidcraft", error)
        _HEALTH_CACHE["solidcraft"] = {
            "status": "ready",
            "runtime": "python",
            "engine": "solidcraft",
            "version": version,
            "helperUrl": HELPER_URL,
        }
    return _HEALTH_CACHE["solidcraft"]


@app.get("/health")
@app.get("/v1/health")
def health() -> dict[str, str]:
    if get_cad_engine() == "solidcraft":
        return _solidcraft_health()
    return _freecad_health()
