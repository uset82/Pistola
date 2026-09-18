from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


MacJobMode = Literal["part"]
MacJobStatusValue = Literal["pending", "running", "succeeded", "failed"]


class MacJobCreateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    mode: MacJobMode = "part"
    sessionId: str | None = None


class MacJobStatus(BaseModel):
    jobId: str
    status: MacJobStatusValue


class MacArtifactRefs(BaseModel):
    previewUrl: str | None = None
    cadUrl: str | None = None
    stlUrl: str | None = None
    codeUrl: str | None = None
    measurementsUrl: str | None = None
    previewArtifactRef: str | None = None
    cadArtifactRef: str | None = None
    stlArtifactRef: str | None = None
    codeArtifactRef: str | None = None


class MacJobResultPayload(BaseModel):
    prompt: str = ""
    mode: MacJobMode = "part"
    qaSummary: str | None = None
    warnings: list[str] = Field(default_factory=list)
    artifacts: MacArtifactRefs = Field(default_factory=MacArtifactRefs)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MacJobResult(BaseModel):
    jobId: str
    type: Literal["generate_part"] = "generate_part"
    status: MacJobStatusValue
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    result: MacJobResultPayload | None = None


class MacHealthPayload(BaseModel):
    status: Literal["ready", "error"]
    runtime: str
    engine: str = "mac-build123d"
    version: str = "0.1.0"
    helperUrl: str
    macRootConfigured: bool = False
    macRoot: str | None = None
    pythonPath: str | None = None
    openRouterConfigured: bool = False
    model: str | None = None
    error: str | None = None
