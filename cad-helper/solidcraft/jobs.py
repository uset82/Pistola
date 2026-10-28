from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from operations.common import artifact_ref, artifact_url, body_operations
from schemas import (
    BatchPayload,
    BooleanCutPayload,
    BooleanIntersectPayload,
    BooleanUnionPayload,
    ChamferPayload,
    CommandPayload,
    DescribeCommandPayload,
    ExportStepPayload,
    ExtrudePayload,
    FilletPayload,
    ImportStepPayload,
    InspectionPayload,
    JobResult,
    JobResultPayload,
    ListCommandsPayload,
    RegeneratePayload,
    RevolvePayload,
    SketchToSolidPayload,
)
from solidcraft.client import SolidCraftClientTypes, SolidCraftError, get_client
from solidcraft.mapping import (
    INSPECTION_COMMANDS,
    SolidCraftMappingError,
    inspection_commands,
    operations_to_commands,
    preview_from_measurement,
    resolve_edge_refs,
    to_solidcraft_length,
)

BODY_NAME = "PistolaBody"
EDGE_KINDS = {"fillet", "chamfer"}


def _warning_list(results: Iterable[Any]) -> list[str]:
    warnings: list[str] = []
    for result in results:
        if isinstance(result, dict) and result.get("warning"):
            warnings.append(str(result["warning"]))
    return warnings


def _result(
    *,
    job_id: str,
    job_type: str,
    artifact_dir: Path,
    step_path: Path | None,
    measurement: dict[str, Any] | None = None,
    operations: list[dict[str, Any]] | None = None,
    warnings: list[str] | None = None,
    preview: dict[str, Any] | None = None,
    export_file: dict[str, str] | None = None,
    data: dict[str, Any] | None = None,
) -> JobResult:
    artifacts = {}
    if step_path is not None and step_path.exists():
        artifacts = {
            "previewArtifactRef": artifact_ref(step_path),
            "cadArtifactRef": artifact_ref(step_path),
        }
        try:
            artifacts["previewUrl"] = artifact_url(step_path, artifact_dir)
            artifacts["cadUrl"] = artifact_url(step_path, artifact_dir)
            if export_file is not None:
                artifacts["exportUrl"] = artifact_url(step_path, artifact_dir)
        except ValueError:
            # A caller-supplied targetPath can live outside the artifact root;
            # the absolute refs and exportFile still work without a URL.
            pass

    return JobResult(
        jobId=job_id,
        type=job_type,
        status="succeeded",
        warnings=warnings or [],
        result=JobResultPayload(
            preview=preview or (preview_from_measurement(measurement) if measurement else {}),
            operations=operations or [],
            artifacts=artifacts,
            exportFile=export_file,
            data=data or {},
        ),
    )


def _failed(job_id: str, job_type: str, error: Exception | str) -> JobResult:
    return JobResult(
        jobId=job_id,
        type=job_type,
        status="failed",
        error=str(error),
    )


def _measurement_for(
    client: SolidCraftClientTypes,
    commands: list[dict[str, Any]],
    input_path: str | None = None,
) -> dict[str, Any]:
    try:
        return client.evaluate(commands, input_path=input_path)
    except (SolidCraftError, SolidCraftMappingError):
        return {}


def _topology_probe(
    client: SolidCraftClientTypes,
    body_name: str,
) -> Callable[[str, list[dict[str, Any]]], dict[str, Any]]:
    def probe(_name: str, commands: list[dict[str, Any]]) -> dict[str, Any]:
        results = client.run_script(
            [*commands, {"command": "model.edges", "params": {"body": body_name}}]
        )
        topology = results[-1] if results else {}
        if not isinstance(topology, dict) or not topology.get("edges"):
            raise SolidCraftMappingError(
                f"SolidCraft could not report topology for body {body_name!r}; "
                "edge references cannot be mapped safely."
            )
        return topology

    return probe


@dataclass(frozen=True)
class BuiltCommands:
    commands: list[dict[str, Any]]
    warnings: list[str]


def _build_commands(
    client: SolidCraftClientTypes,
    *,
    operations: list[dict[str, Any]],
    sketches: dict[str, dict[str, Any]],
    bodies: dict[str, dict[str, Any]] | None = None,
    body_name: str = BODY_NAME,
) -> BuiltCommands:
    warnings: list[str] = []
    commands = operations_to_commands(
        operations=operations,
        sketches=sketches,
        bodies=bodies,
        body_name=body_name,
        resolve_edges=resolve_edge_refs,
        topology_for_body=_topology_probe(client, body_name),
        warnings=warnings,
    )
    return BuiltCommands(commands=commands, warnings=warnings)


def _run_commands_to_step(
    client: SolidCraftClientTypes,
    *,
    job_id: str,
    job_type: str,
    commands: list[dict[str, Any]],
    artifact_dir: Path,
    operations: list[dict[str, Any]],
    warnings: list[str] | None = None,
) -> JobResult:
    if not commands:
        return _failed(job_id, job_type, SolidCraftMappingError("No geometry commands were produced."))

    step_path = artifact_dir / f"{job_id}.step"
    results = client.run_script(commands, outputs=[step_path.as_posix()])
    measurement = _measurement_for(client, commands)
    return _result(
        job_id=job_id,
        job_type=job_type,
        artifact_dir=artifact_dir,
        step_path=step_path,
        measurement=measurement,
        operations=operations,
        warnings=[*(warnings or []), *_warning_list(results)],
    )


def _single_extrude_operation(
    *,
    sketch_id: str,
    distance: float,
    direction: list[float],
    symmetric: bool,
) -> dict[str, Any]:
    return {
        "id": "cad-op-extrude",
        "type": "extrude",
        "kind": "extrude",
        "params": {
            "distance": distance,
            "direction": direction,
            "symmetric": symmetric,
        },
        "suppressed": False,
        "sketchId": sketch_id,
        "distance": distance,
        "depth": distance,
        "direction": direction,
        "symmetric": symmetric,
    }


def run_sketch_to_solid(*, job_id: str, payload: SketchToSolidPayload, artifact_dir: Path) -> JobResult:
    job_type = "sketch_to_solid"
    try:
        client = get_client()
        sketch = dict(payload.sketch or {})
        sketch_id = str(sketch.get("id") or "sketch")
        operation = _single_extrude_operation(
            sketch_id=sketch_id,
            distance=float(payload.depth),
            direction=[0.0, 1.0, 0.0],
            symmetric=False,
        )
        built = _build_commands(
            client,
            operations=[operation],
            sketches={sketch_id: sketch},
        )
        return _run_commands_to_step(
            client,
            job_id=job_id,
            job_type=job_type,
            commands=built.commands,
            artifact_dir=artifact_dir,
            operations=[operation],
            warnings=built.warnings,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_extrude(*, job_id: str, payload: ExtrudePayload, artifact_dir: Path) -> JobResult:
    job_type = "extrude"
    try:
        client = get_client()
        sketch = dict(payload.sketch or {})
        sketch_id = payload.sketchId or str(sketch.get("id") or "sketch")
        operation = _single_extrude_operation(
            sketch_id=sketch_id,
            distance=float(payload.distance),
            direction=list(payload.direction),
            symmetric=bool(payload.symmetric),
        )
        built = _build_commands(
            client,
            operations=[operation],
            sketches={sketch_id: sketch},
        )
        return _run_commands_to_step(
            client,
            job_id=job_id,
            job_type=job_type,
            commands=built.commands,
            artifact_dir=artifact_dir,
            operations=[operation],
            warnings=built.warnings,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_revolve(*, job_id: str, payload: RevolvePayload, artifact_dir: Path) -> JobResult:
    job_type = "revolve"
    try:
        client = get_client()
        sketch = dict(payload.sketch or {})
        sketch_id = payload.sketchId or str(sketch.get("id") or "sketch")
        operation = {
            "id": "cad-op-revolve",
            "type": "revolve",
            "kind": "revolve",
            "params": {
                "axis": payload.axis,
                "angle": float(payload.angle),
            },
            "suppressed": False,
            "sketchId": sketch_id,
            "axis": payload.axis,
            "angle": float(payload.angle),
        }
        built = _build_commands(
            client,
            operations=[operation],
            sketches={sketch_id: sketch},
        )
        return _run_commands_to_step(
            client,
            job_id=job_id,
            job_type=job_type,
            commands=built.commands,
            artifact_dir=artifact_dir,
            operations=[operation],
            warnings=built.warnings,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_boolean_operation(
    *,
    job_id: str,
    operation: str,
    payload: BooleanUnionPayload | BooleanCutPayload | BooleanIntersectPayload,
    artifact_dir: Path,
) -> JobResult:
    job_type = f"boolean_{operation}"
    try:
        client = get_client()
        target_body = dict(payload.targetBody or {})
        tool_body = dict(payload.toolBody or {})
        if not target_body:
            raise SolidCraftMappingError("Boolean jobs require the target body's geometry definition.")
        if not tool_body:
            raise SolidCraftMappingError("Boolean jobs require the tool body's geometry definition.")

        base_operations = body_operations(target_body)
        boolean_kind = f"boolean_{operation}"
        operation_entry = {
            "id": "cad-op-boolean",
            "type": boolean_kind,
            "kind": boolean_kind,
            "params": {"toolBodyIds": [payload.bodyIdB]},
            "suppressed": False,
            "operation": operation,
            "toolBodyIds": [payload.bodyIdB],
        }
        operations = [*base_operations, operation_entry]
        bodies = {
            payload.bodyIdA: target_body,
            payload.bodyIdB: tool_body,
            **(payload.bodies or {}),
        }
        built = _build_commands(
            client,
            operations=operations,
            sketches=payload.sketches or {},
            bodies=bodies,
        )
        return _run_commands_to_step(
            client,
            job_id=job_id,
            job_type=job_type,
            commands=built.commands,
            artifact_dir=artifact_dir,
            operations=operations,
            warnings=built.warnings,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def _body_step_artifact(body: dict[str, Any]) -> Path | None:
    artifacts = body.get("artifacts") or {}
    candidate = (
        body.get("cadArtifactRef")
        or artifacts.get("cadArtifactRef")
        or body.get("cadUrl")
        or artifacts.get("cadUrl")
    )
    if not isinstance(candidate, str) or not candidate:
        return None
    if candidate.startswith("/v1/cad/artifacts/"):
        return None
    path = Path(candidate)
    if path.exists() and path.suffix.lower() in {".step", ".stp"}:
        return path
    return None


def _run_edge_job(
    *,
    job_id: str,
    job_type: str,
    body: dict[str, Any],
    edge_operation: dict[str, Any],
    artifact_dir: Path,
) -> JobResult:
    client = get_client()
    edge_refs = edge_operation.get("edgeRefs") or []
    existing_step = _body_step_artifact(body)

    if existing_step:
        measurement = _measurement_for(client, [], input_path=existing_step.as_posix())
        bodies = measurement.get("bodies") or []
        if not bodies:
            raise SolidCraftMappingError(
                f"SolidCraft could not inspect the existing artifact {existing_step.name!r}."
            )
        source_body_name = str(bodies[0].get("name") or "Body1")
        topology_results = client.run_script(
            [{"command": "model.edges", "params": {"body": source_body_name}}],
            input_path=existing_step.as_posix(),
        )
        topology = topology_results[-1] if topology_results else {}
        edges = resolve_edge_refs(edge_refs, topology)
        params = {
            "body": source_body_name,
            "edges": edges,
            "radius" if job_type == "fillet" else "distance": to_solidcraft_length(
                float(
                    edge_operation.get("radius")
                    if job_type == "fillet"
                    else edge_operation.get("distance")
                )
            ),
        }
        command = "solid.fillet" if job_type == "fillet" else "solid.chamfer"
        target = artifact_dir / f"{job_id}.step"
        results = client.run_script(
            [{"command": command, "params": params}],
            input_path=existing_step.as_posix(),
            outputs=[target.as_posix()],
        )
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=target,
            measurement=_measurement_for(client, [], input_path=target.as_posix()),
            operations=[*body_operations(body), edge_operation],
            warnings=_warning_list(results),
        )

    operations = [*body_operations(body), edge_operation]
    built = _build_commands(
        client,
        operations=operations,
        sketches={},
    )
    return _run_commands_to_step(
        client,
        job_id=job_id,
        job_type=job_type,
        commands=built.commands,
        artifact_dir=artifact_dir,
        operations=operations,
        warnings=built.warnings,
    )


def run_fillet(*, job_id: str, payload: FilletPayload, artifact_dir: Path) -> JobResult:
    job_type = "fillet"
    try:
        operation = {
            "id": "cad-op-fillet",
            "type": "fillet",
            "kind": "fillet",
            "params": {"edgeRefs": list(payload.edgeRefs), "radius": float(payload.radius)},
            "suppressed": False,
            "edgeRefs": list(payload.edgeRefs),
            "radius": float(payload.radius),
        }
        return _run_edge_job(
            job_id=job_id,
            job_type=job_type,
            body=payload.body,
            edge_operation=operation,
            artifact_dir=artifact_dir,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_chamfer(*, job_id: str, payload: ChamferPayload, artifact_dir: Path) -> JobResult:
    job_type = "chamfer"
    try:
        operation = {
            "id": "cad-op-chamfer",
            "type": "chamfer",
            "kind": "chamfer",
            "params": {"edgeRefs": list(payload.edgeRefs), "distance": float(payload.distance)},
            "suppressed": False,
            "edgeRefs": list(payload.edgeRefs),
            "distance": float(payload.distance),
        }
        return _run_edge_job(
            job_id=job_id,
            job_type=job_type,
            body=payload.body,
            edge_operation=operation,
            artifact_dir=artifact_dir,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_regenerate(*, job_id: str, payload: RegeneratePayload, artifact_dir: Path) -> JobResult:
    job_type = "regenerate"
    try:
        client = get_client()
        body = dict(payload.body or {})
        operations = body_operations(body)
        if not operations:
            raise SolidCraftMappingError(
                "The body has no operation history to replay. Imported bodies keep their STEP artifact instead."
            )

        sketch = payload.sketch or {}
        sketches = {str(sketch.get("id")): sketch} if sketch else {}
        sketches.update(payload.sketches or {})
        bodies = payload.bodies or {str(body.get("id")): body}
        if str(body.get("id")) not in bodies:
            bodies[str(body.get("id"))] = body

        built = _build_commands(
            client,
            operations=operations,
            sketches=sketches,
            bodies=bodies,
        )
        result = _run_commands_to_step(
            client,
            job_id=job_id,
            job_type=job_type,
            commands=built.commands,
            artifact_dir=artifact_dir,
            operations=operations,
            warnings=built.warnings,
        )
        return result
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_import_step(*, job_id: str, payload: ImportStepPayload, artifact_dir: Path) -> JobResult:
    job_type = "import_step"
    try:
        source = payload.filePath or payload.artifactRef
        if not source:
            raise SolidCraftMappingError("import_step requires filePath or artifactRef.")
        source_path = Path(source)
        if not source_path.exists() or not source_path.is_file():
            raise SolidCraftMappingError(f"STEP source file not found: {source}")

        client = get_client()
        measurement = _measurement_for(client, [], input_path=source_path.as_posix())
        if not measurement.get("bodies"):
            raise SolidCraftMappingError(
                "SolidCraft could not read this file as geometry; no placeholder was written."
            )

        cad_path = artifact_dir / f"{job_id}-import{source_path.suffix or '.step'}"
        shutil.copyfile(source_path, cad_path)
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=cad_path,
            measurement=measurement,
            preview=preview_from_measurement(measurement),
        )
    except (SolidCraftError, SolidCraftMappingError, OSError) as error:
        return _failed(job_id, job_type, error)


def _sanitize(name: str) -> str:
    return "-".join(part for part in "".join(ch.lower() if ch.isalnum() else " " for ch in name).split())


def run_export_step(*, job_id: str, payload: ExportStepPayload, artifact_dir: Path) -> JobResult:
    job_type = "export_step"
    mapping_warnings: list[str] = []
    try:
        body = dict(payload.body or {})
        filename = f"{_sanitize(payload.bodyName or body.get('name') or body.get('id') or 'cad-body')}.step"
        target_path = Path(payload.targetPath) if payload.targetPath else artifact_dir / filename
        target_path.parent.mkdir(parents=True, exist_ok=True)

        source = payload.cadArtifactRef
        if not source:
            artifacts = body.get("artifacts") or {}
            source = body.get("cadArtifactRef") or artifacts.get("cadArtifactRef")

        if source and Path(source).exists() and Path(source).suffix.lower() in {".step", ".stp"}:
            shutil.copyfile(source, target_path)
        else:
            client = get_client()
            operations = body_operations(body)
            if not operations:
                raise SolidCraftMappingError(
                    "No STEP artifact and no operation history were available for this body."
                )
            sketch = payload.sketch or {}
            sketches = {str(sketch.get("id")): sketch} if sketch else {}
            sketches.update(payload.sketches or {})
            bodies = payload.bodies or {str(body.get("id")): body}
            built = _build_commands(
                client,
                operations=operations,
                sketches=sketches,
                bodies=bodies,
            )
            mapping_warnings = built.warnings
            client.run_script(built.commands, outputs=[target_path.as_posix()])

        content = target_path.read_text(encoding="utf-8")
        measurement = _measurement_for(get_client(), [], input_path=target_path.as_posix())
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=target_path,
            measurement=measurement,
            preview=body.get("preview") or preview_from_measurement(measurement),
            operations=body_operations(body),
            export_file={"filename": target_path.name, "content": content},
            warnings=mapping_warnings,
        )
    except (SolidCraftError, SolidCraftMappingError, OSError) as error:
        return _failed(job_id, job_type, error)


def run_command(*, job_id: str, payload: CommandPayload, artifact_dir: Path) -> JobResult:
    job_type = "command"
    try:
        client = get_client()
        results = client.run_script([{"command": payload.command, "params": payload.params}])
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=None,
            data={"result": results[-1] if results else None},
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_batch(*, job_id: str, payload: BatchPayload, artifact_dir: Path) -> JobResult:
    job_type = "batch"
    try:
        file_steps = [
            step.command
            for step in payload.commands
            if step.command in {"doc.open", "file.insert_step", "file.insert_mesh"}
        ]
        if file_steps:
            raise SolidCraftMappingError(
                "SolidCraft batch refuses file-loading steps; send "
                + ", ".join(sorted(set(file_steps)))
                + " one at a time."
            )
        client = get_client()
        results = client.run_script(
            [{"command": step.command, "params": step.params} for step in payload.commands],
            allow_errors=not payload.rollback,
        )
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=None,
            data={"results": results},
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_list_commands(*, job_id: str, payload: ListCommandsPayload, artifact_dir: Path) -> JobResult:
    job_type = "list_commands"
    try:
        client = get_client()
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=None,
            data={"commands": client.commands(payload.filter)},
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_describe_command(*, job_id: str, payload: DescribeCommandPayload, artifact_dir: Path) -> JobResult:
    job_type = "describe_command"
    try:
        client = get_client()
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=None,
            data={"command": payload.command, "description": client.describe(payload.command)},
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)


def run_inspection(*, job_id: str, job_type: str, payload: InspectionPayload, artifact_dir: Path) -> JobResult:
    """Run one named inspection job.

    The job type selects the command and is never taken from the payload, so
    this cannot be used as a general command runner. It works with
    ``PISTOLA_CAD_ALLOW_PASSTHROUGH=0`` for exactly that reason.
    """
    try:
        client = get_client()
        commands, names, warnings = inspection_commands(
            job_type=job_type,
            body_ids=payload.bodyIds,
            bodies={body_id: body.model_dump() for body_id, body in payload.bodies.items()},
            sketches=payload.sketches,
            against_body_ids=payload.againstBodyIds,
            minimum_clearance_mm=payload.minimumClearance,
            min_volume_mm3=payload.minVolume,
            nearest=payload.nearest,
            budget_seconds=payload.budgetSeconds,
        )
        results = client.run_script(commands)
        return _result(
            job_id=job_id,
            job_type=job_type,
            artifact_dir=artifact_dir,
            step_path=None,
            data={
                "command": INSPECTION_COMMANDS[job_type],
                "bodies": names,
                "result": results[-1] if results else None,
            },
            warnings=warnings,
        )
    except (SolidCraftError, SolidCraftMappingError) as error:
        return _failed(job_id, job_type, error)
