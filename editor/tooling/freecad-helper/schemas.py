from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field


class JobStatus(BaseModel):
    jobId: str
    status: Literal["pending", "running", "succeeded", "failed"]


class ArtifactRefs(BaseModel):
    previewUrl: str | None = None
    cadUrl: str | None = None
    exportUrl: str | None = None
    previewArtifactRef: str | None = None
    cadArtifactRef: str | None = None


class JobResultPayload(BaseModel):
    preview: dict[str, Any] = Field(default_factory=dict)
    operations: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: ArtifactRefs = Field(default_factory=ArtifactRefs)
    exportFile: dict[str, str] | None = None


class JobResult(BaseModel):
    jobId: str
    type: str
    status: Literal["pending", "running", "succeeded", "failed"]
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    result: JobResultPayload | None = None


class SketchToSolidPayload(BaseModel):
    sketch: dict[str, Any] = Field(default_factory=dict)
    depth: float = 1.2


class ExtrudePayload(BaseModel):
    sketchId: str
    distance: float = 1.2
    direction: list[float] = Field(default_factory=lambda: [0.0, 1.0, 0.0])
    symmetric: bool = False
    sketch: dict[str, Any] = Field(default_factory=dict)


class RevolvePayload(BaseModel):
    sketchId: str
    axis: Literal["X", "Y", "Z", "custom"] = "Z"
    angle: float = 360.0
    sketch: dict[str, Any] = Field(default_factory=dict)


class RegeneratePayload(BaseModel):
    body: dict[str, Any] = Field(default_factory=dict)
    sketch: dict[str, Any] | None = None
    overrides: dict[str, Any] = Field(default_factory=dict)


class BooleanUnionPayload(BaseModel):
    bodyIdA: str
    bodyIdB: str
    targetBody: dict[str, Any] = Field(default_factory=dict)
    toolBody: dict[str, Any] = Field(default_factory=dict)


class BooleanCutPayload(BaseModel):
    bodyIdA: str
    bodyIdB: str
    targetBody: dict[str, Any] = Field(default_factory=dict)
    toolBody: dict[str, Any] = Field(default_factory=dict)


class BooleanIntersectPayload(BaseModel):
    bodyIdA: str
    bodyIdB: str
    targetBody: dict[str, Any] = Field(default_factory=dict)
    toolBody: dict[str, Any] = Field(default_factory=dict)


class FilletPayload(BaseModel):
    bodyId: str
    edgeRefs: list[str] = Field(default_factory=list)
    radius: float = 0.05
    body: dict[str, Any] = Field(default_factory=dict)


class ChamferPayload(BaseModel):
    bodyId: str
    edgeRefs: list[str] = Field(default_factory=list)
    distance: float = 0.05
    body: dict[str, Any] = Field(default_factory=dict)


class ImportStepPayload(BaseModel):
    filePath: str | None = None
    artifactRef: str | None = None


class ExportStepPayload(BaseModel):
    cadArtifactRef: str | None = None
    bodyName: str | None = None
    body: dict[str, Any] = Field(default_factory=dict)
    targetPath: str | None = None


class SketchToSolidRequest(BaseModel):
    type: Literal["sketch_to_solid"]
    payload: SketchToSolidPayload


class ExtrudeRequest(BaseModel):
    type: Literal["extrude"]
    payload: ExtrudePayload


class RevolveRequest(BaseModel):
    type: Literal["revolve"]
    payload: RevolvePayload


class RegenerateRequest(BaseModel):
    type: Literal["regenerate"]
    payload: RegeneratePayload


class BooleanUnionRequest(BaseModel):
    type: Literal["boolean_union"]
    payload: BooleanUnionPayload


class BooleanCutRequest(BaseModel):
    type: Literal["boolean_cut"]
    payload: BooleanCutPayload


class BooleanIntersectRequest(BaseModel):
    type: Literal["boolean_intersect"]
    payload: BooleanIntersectPayload


class FilletRequest(BaseModel):
    type: Literal["fillet"]
    payload: FilletPayload


class ChamferRequest(BaseModel):
    type: Literal["chamfer"]
    payload: ChamferPayload


class ImportStepRequest(BaseModel):
    type: Literal["import_step"]
    payload: ImportStepPayload


class ExportStepRequest(BaseModel):
    type: Literal["export_step"]
    payload: ExportStepPayload


JobRequest = Annotated[
    Union[
        SketchToSolidRequest,
        ExtrudeRequest,
        RevolveRequest,
        RegenerateRequest,
        BooleanUnionRequest,
        BooleanCutRequest,
        BooleanIntersectRequest,
        FilletRequest,
        ChamferRequest,
        ImportStepRequest,
        ExportStepRequest,
    ],
    Field(discriminator="type"),
]
