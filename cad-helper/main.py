from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from freecad_runtime import build_helper_health_payload
from routers.jobs import router as jobs_router


app = FastAPI(title="Pistola CAD Helper", version="0.1.0")
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
HEALTH_PAYLOAD = build_helper_health_payload(DEFAULT_HOST, DEFAULT_PORT)


@app.get("/health")
@app.get("/v1/health")
def health() -> dict[str, str]:
    return HEALTH_PAYLOAD
