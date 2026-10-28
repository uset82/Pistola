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
    #: Free-form engine output for the SolidCraft passthrough job types, which
    #: return a command catalog or raw command results rather than a body.
    #: Empty for every geometry job, so FreeCAD results are unchanged.
    data: dict[str, Any] = Field(default_factory=dict)


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
    #: Dependency closure the SolidCraft bridge needs to replay a timeline:
    #: every sketch and body the operation graph references, by id. Empty for
    #: FreeCAD, which resolves its own document, so this stays additive.
    sketches: dict[str, dict[str, Any]] = Field(default_factory=dict)
    bodies: dict[str, dict[str, Any]] = Field(default_factory=dict)


class BooleanUnionPayload(BaseModel):
    bodyIdA: str
    bodyIdB: str
    targetBody: dict[str, Any] = Field(default_factory=dict)
    toolBody: dict[str, Any] = Field(default_factory=dict)
    #: Dependency closure the SolidCraft bridge needs to replay a timeline:
    #: every sketch and body the operation graph references, by id. Empty for
    #: FreeCAD, which resolves its own document, so this stays additive.
    sketches: dict[str, dict[str, Any]] = Field(default_factory=dict)
    bodies: dict[str, dict[str, Any]] = Field(default_factory=dict)


class BooleanCutPayload(BaseModel):
    bodyIdA: str
    bodyIdB: str
    targetBody: dict[str, Any] = Field(default_factory=dict)
    toolBody: dict[str, Any] = Field(default_factory=dict)
    #: Dependency closure the SolidCraft bridge needs to replay a timeline:
    #: every sketch and body the operation graph references, by id. Empty for
    #: FreeCAD, which resolves its own document, so this stays additive.
    sketches: dict[str, dict[str, Any]] = Field(default_factory=dict)
    bodies: dict[str, dict[str, Any]] = Field(default_factory=dict)


class BooleanIntersectPayload(BaseModel):
    bodyIdA: str
    bodyIdB: str
    targetBody: dict[str, Any] = Field(default_factory=dict)
    toolBody: dict[str, Any] = Field(default_factory=dict)
    #: Dependency closure the SolidCraft bridge needs to replay a timeline:
    #: every sketch and body the operation graph references, by id. Empty for
    #: FreeCAD, which resolves its own document, so this stays additive.
    sketches: dict[str, dict[str, Any]] = Field(default_factory=dict)
    bodies: dict[str, dict[str, Any]] = Field(default_factory=dict)


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
    sketch: dict[str, Any] | None = None
    #: Dependency closure the SolidCraft bridge needs to replay a timeline:
    #: every sketch and body the operation graph references, by id. Empty for
    #: FreeCAD, which resolves its own document, so this stays additive.
    sketches: dict[str, dict[str, Any]] = Field(default_factory=dict)
    bodies: dict[str, dict[str, Any]] = Field(default_factory=dict)


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


class CommandPayload(BaseModel):
    command: str
    params: dict[str, Any] = Field(default_factory=dict)


class BatchStep(BaseModel):
    command: str
    params: dict[str, Any] = Field(default_factory=dict)


class BatchPayload(BaseModel):
    commands: list[BatchStep] = Field(default_factory=list)
    rollback: bool = True


class ListCommandsPayload(BaseModel):
    filter: str | None = None


class DescribeCommandPayload(BaseModel):
    command: str


class CommandRequest(BaseModel):
    type: Literal["command"]
    payload: CommandPayload


class BatchRequest(BaseModel):
    type: Literal["batch"]
    payload: BatchPayload


class ListCommandsRequest(BaseModel):
    type: Literal["list_commands"]
    payload: ListCommandsPayload = Field(default_factory=ListCommandsPayload)


class DescribeCommandRequest(BaseModel):
    type: Literal["describe_command"]
    payload: DescribeCommandPayload


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
        # SolidCraft only. These are rejected with a 400 while the FreeCAD
        # engine is active, because FreeCAD has no command catalog to address.
        CommandRequest,
        BatchRequest,
        ListCommandsRequest,
        DescribeCommandRequest,
    ],
    Field(discriminator="type"),
]
