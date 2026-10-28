from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

M_TO_MM = 1000.0
CATALOG_PATH = Path(__file__).with_name("catalog.json")


def _load_command_catalog() -> dict[str, dict[str, Any]]:
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {
        command["id"]: command
        for command in catalog
        if isinstance(command, dict) and isinstance(command.get("id"), str)
    }


CATALOG = _load_command_catalog()


def _command_supports_targets(command: str) -> bool:
    params = str(CATALOG.get(command, {}).get("params") or "")
    return "targets" in params and "operation" in params


BODY_NAME_COMMANDS = {
    "solid.extrude",
    "solid.revolve",
    "solid.sweep",
    "solid.loft",
    "solid.box",
    "solid.cylinder",
    "solid.sphere",
    "solid.torus",
    "solid.cone",
    "solid.pipe",
    "solid.bounding_solid",
    "solid.coil",
}

TARGETING_BODY_COMMANDS = {
    command for command in BODY_NAME_COMMANDS if _command_supports_targets(command)
}

BOOLEAN_KINDS = {
    "boolean_union": "join",
    "boolean_cut": "cut",
    "boolean_intersect": "intersect",
    "boolean": "join",
}


class SolidCraftMappingError(ValueError):
    """Raised when a Pistola request cannot be expressed as real SolidCraft commands."""


def to_solidcraft_length(value: float) -> float:
    """Pistola scene lengths are metres; SolidCraft command coordinates are millimetres."""
    return float(value) * M_TO_MM


def from_solidcraft_length(value: float) -> float:
    """Convert a SolidCraft millimetre result back into Pistola scene metres."""
    return float(value) / M_TO_MM


def _as_float_pair(value: Any, fallback: tuple[float, float] = (0.0, 0.0)) -> tuple[float, float]:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return (float(value[0]), float(value[1]))
    return fallback


def _sketch_origin_mm(sketch: dict[str, Any]) -> list[float]:
    position = sketch.get("position") or [0.0, 0.0, 0.0]
    if len(position) < 3:
        position = [0.0, 0.0, 0.0]
    # Scene is Y-up, SolidCraft is Z-up. This is the same mapping the STEP
    # importer applies when the body reaches the browser kernel.
    return [float(position[0]) * M_TO_MM, -float(position[2]) * M_TO_MM, float(position[1]) * M_TO_MM]


def _sketch_plane(sketch: dict[str, Any]) -> str:
    plane = str(sketch.get("plane") or "XY").upper()
    return plane if plane in {"XY", "XZ", "YZ"} else "XY"


def sketch_commands(sketch: dict[str, Any]) -> list[dict[str, Any]]:
    """Translate a Pistola CadSketchNode into SolidCraft sketch commands.

    Coordinates from Pistola are metres and are converted once here. The
    profile is built on SolidCraft's XY plane; the browser kernel's import path
    rotates the resulting Z-up STEP into the scene's Y-up frame.
    """
    entities = sketch.get("entities") or []
    if not entities:
        raise SolidCraftMappingError("The sketch has no entities to build.")

    commands: list[dict[str, Any]] = [
        {
            "command": "sketch.create",
            "params": {
                "plane": {
                    "origin": _sketch_origin_mm(sketch),
                    "x_dir": [1, 0, 0],
                    "y_dir": [0, 1, 0],
                },
                **({"name": sketch["name"]} if sketch.get("name") else {}),
            },
        }
    ]

    for entity in entities:
        kind = entity.get("kind")
        if kind == "line":
            start = _as_float_pair(entity.get("start"))
            end = _as_float_pair(entity.get("end"))
            if start == end:
                continue
            commands.append(
                {
                    "command": "sketch.line",
                    "params": {
                        "points": [
                            [to_solidcraft_length(start[0]), to_solidcraft_length(start[1])],
                            [to_solidcraft_length(end[0]), to_solidcraft_length(end[1])],
                        ]
                    },
                }
            )
            continue

        if kind == "rectangle":
            cx, cy = _as_float_pair(entity.get("center"))
            width = float(entity.get("width", 2.0))
            height = float(entity.get("height", 1.5))
            commands.append(
                {
                    "command": "sketch.rectangle.two_point",
                    "params": {
                        "p0": [
                            to_solidcraft_length(cx - width / 2),
                            to_solidcraft_length(cy - height / 2),
                        ],
                        "p1": [
                            to_solidcraft_length(cx + width / 2),
                            to_solidcraft_length(cy + height / 2),
                        ],
                    },
                }
            )
            continue

        if kind == "circle":
            center = _as_float_pair(entity.get("center"))
            commands.append(
                {
                    "command": "sketch.circle.center",
                    "params": {
                        "center": [
                            to_solidcraft_length(center[0]),
                            to_solidcraft_length(center[1]),
                        ],
                        "radius": to_solidcraft_length(float(entity.get("radius", 0.75))),
                    },
                }
            )
            continue

        if kind == "arc":
            center = _as_float_pair(entity.get("center"))
            radius = float(entity.get("radius", 0.75))
            start_angle = float(entity.get("startAngle", 0.0))
            end_angle = float(entity.get("endAngle", math.pi / 2))
            start = [center[0] + radius * math.cos(start_angle), center[1] + radius * math.sin(start_angle)]
            end = [center[0] + radius * math.cos(end_angle), center[1] + radius * math.sin(end_angle)]
            commands.append(
                {
                    "command": "sketch.arc.center_point",
                    "params": {
                        "center": [
                            to_solidcraft_length(center[0]),
                            to_solidcraft_length(center[1]),
                        ],
                        "start": [to_solidcraft_length(start[0]), to_solidcraft_length(start[1])],
                        "end": [to_solidcraft_length(end[0]), to_solidcraft_length(end[1])],
                    },
                }
            )
            continue

        if kind == "polyline":
            points = [
                [to_solidcraft_length(float(point[0])), to_solidcraft_length(float(point[1]))]
                for point in (entity.get("points") or [])
                if isinstance(point, (list, tuple)) and len(point) >= 2
            ]
            if len(points) < 2:
                continue
            commands.append(
                {
                    "command": "sketch.line",
                    "params": {
                        "points": points,
                        "closed": bool(entity.get("closed", False)),
                    },
                }
            )
            continue

        raise SolidCraftMappingError(f"Unsupported sketch entity kind: {kind!r}")

    if len(commands) == 1:
        raise SolidCraftMappingError("The sketch did not produce any drawable entities.")

    commands.append({"command": "sketch.finish", "params": {}})
    return commands


def _extrude_params(operation: dict[str, Any], first_feature: bool, body_name: str) -> dict[str, Any]:
    params = operation.get("params") or {}
    distance = float(params.get("distance", operation.get("distance", operation.get("depth", 1.2))))
    direction = params.get("direction") or operation.get("direction") or [0, 1, 0]
    symmetric = bool(params.get("symmetric", operation.get("symmetric", False)))

    params_out: dict[str, Any] = {
        "distance": to_solidcraft_length(abs(distance)),
        "operation": "new" if first_feature else "join",
    }
    if first_feature:
        params_out["body_name"] = body_name
    else:
        params_out["targets"] = [body_name]

    if symmetric:
        params_out["direction"] = "symmetric"
    elif isinstance(direction, (list, tuple)) and len(direction) >= 2 and float(direction[1]) < 0:
        params_out["direction"] = "negative"

    return params_out


def _revolve_params(
    operation: dict[str, Any],
    first_feature: bool,
    body_name: str,
    sketch: dict[str, Any],
) -> dict[str, Any]:
    params = operation.get("params") or {}
    axis = str(params.get("axis") or operation.get("axis") or "Z").upper()
    angle = float(params.get("angle", operation.get("angle", 360.0)))
    axis_value: Any = axis if axis in {"X", "Y", "Z"} else "Z"
    if axis in {"X", "Y"}:
        direction = [1.0, 0.0, 0.0] if axis == "X" else [0.0, 1.0, 0.0]
        axis_value = {"origin": _sketch_origin_mm(sketch), "dir": direction}
    params_out: dict[str, Any] = {
        "axis": axis_value,
        "angle": angle,
        "operation": "new" if first_feature else "join",
    }
    if first_feature:
        params_out["body_name"] = body_name
    else:
        params_out["targets"] = [body_name]
    return params_out


def _normalize_operations(operations: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for operation in operations:
        if not isinstance(operation, dict):
            continue
        kind = operation.get("kind") or operation.get("type")
        if kind == "boolean":
            operation = dict(operation)
            operation["kind"] = {
                "union": "boolean_union",
                "cut": "boolean_cut",
                "intersect": "boolean_intersect",
            }.get(str(operation.get("operation") or "union"), "boolean_union")
            operation["type"] = operation["kind"]
        normalized.append(operation)
    return normalized


#: The named inspection jobs and the one catalog command each is allowed to run.
INSPECTION_COMMANDS = {
    "inspect_interference": "inspect.interference",
    "inspect_clearance": "inspect.clearance",
    "inspect_center_of_mass": "inspect.center_of_mass",
}


def _body_translation_mm(position: Any) -> list[float]:
    """Pistola scene placement (metres, Y-up) to SolidCraft millimetres (Z-up)."""
    values = list(position or [])
    values = [float(value) for value in values[:3]]
    while len(values) < 3:
        values.append(0.0)
    x, y, z = values
    return [x * M_TO_MM, -z * M_TO_MM, y * M_TO_MM]


def _placement_warnings(name: str, body: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    rotation = [float(value) for value in (body.get("rotation") or [0.0, 0.0, 0.0])]
    if any(abs(value) > 1e-9 for value in rotation):
        warnings.append(
            f"Body {name!r} is rotated in the scene; the inspection uses its "
            "unrotated placement."
        )
    scale = [float(value) for value in (body.get("scale") or [1.0, 1.0, 1.0])]
    if any(abs(value - 1.0) > 1e-9 for value in scale):
        warnings.append(
            f"Body {name!r} is scaled in the scene; the inspection uses its "
            "unscaled geometry."
        )
    return warnings


def rebuild_body_commands(
    *,
    body_ids: Sequence[str],
    bodies: dict[str, dict[str, Any]],
    sketches: dict[str, dict[str, Any]],
    extra_body_ids: Sequence[str] = (),
) -> tuple[list[dict[str, Any]], dict[str, str], list[str]]:
    """Replay bodies into one SolidCraft document under stable names.

    Each body is replayed from its operation timeline as `PistolaBody1`,
    `PistolaBody2`, ..., translated into its scene placement. Replaying rather
    than reading a STEP artifact keeps a named job valid after a restart, when
    artifacts are gone.

    `body_ids` are the bodies the caller acts on; `extra_body_ids` are rebuilt
    too (a clearance baseline) but are not returned as targets. Returns the
    command script, the name chosen for each rebuilt body, and placement
    warnings.
    """
    roots = [str(body_id) for body_id in body_ids]
    if not roots:
        raise SolidCraftMappingError("A named job needs at least one body id.")

    build_order = list(
        dict.fromkeys([*roots, *(str(body_id) for body_id in extra_body_ids)])
    )
    for body_id in build_order:
        if body_id not in bodies:
            raise SolidCraftMappingError(
                f"Body {body_id!r} is missing from the job's body closure."
            )

    commands: list[dict[str, Any]] = []
    names: dict[str, str] = {}
    warnings: list[str] = []

    for index, body_id in enumerate(build_order):
        body = bodies[body_id]
        name = f"PistolaBody{index + 1}"
        operations = body.get("operations") or body.get("operationHistory") or []
        if not operations:
            raise SolidCraftMappingError(
                f"Body {body_id!r} has no operation history. This job rebuilds "
                "a parametric timeline; imported STEP bodies are not supported yet."
            )
        names[body_id] = name
        commands.extend(
            operations_to_commands(
                operations=operations,
                sketches=sketches,
                bodies=bodies,
                body_name=name,
            )
        )
        translation = _body_translation_mm(body.get("position"))
        if any(abs(value) > 1e-9 for value in translation):
            commands.append(
                {
                    "command": "solid.move",
                    "params": {"bodies": [name], "translate": translation},
                }
            )
        warnings.extend(_placement_warnings(name, body))

    return commands, names, warnings


def inspection_commands(
    *,
    job_type: str,
    body_ids: Sequence[str],
    bodies: dict[str, dict[str, Any]],
    sketches: dict[str, dict[str, Any]],
    against_body_ids: Sequence[str] = (),
    minimum_clearance_mm: float | None = None,
    min_volume_mm3: float | None = None,
    nearest: int | None = None,
    budget_seconds: float | None = None,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """Rebuild the named Pistola bodies and append one inspection command."""
    if job_type not in INSPECTION_COMMANDS:
        raise SolidCraftMappingError(f"{job_type!r} is not a named inspection job.")

    commands, names, warnings = rebuild_body_commands(
        body_ids=body_ids,
        bodies=bodies,
        sketches=sketches,
        extra_body_ids=against_body_ids,
    )
    roots = [str(body_id) for body_id in body_ids]

    params: dict[str, Any] = {"bodies": [names[body_id] for body_id in roots]}
    if job_type == "inspect_clearance":
        if against_body_ids:
            params["against"] = [names[str(body_id)] for body_id in against_body_ids]
        if minimum_clearance_mm is not None:
            params["clearance"] = float(minimum_clearance_mm)
        if min_volume_mm3 is not None:
            params["min_volume"] = float(min_volume_mm3)
        if nearest is not None:
            params["nearest"] = int(nearest)
    elif job_type == "inspect_interference" and budget_seconds is not None:
        params["budget_s"] = float(budget_seconds)

    commands.append({"command": INSPECTION_COMMANDS[job_type], "params": params})
    return commands, [names[body_id] for body_id in roots], warnings


#: The two material commands Pistola names. Nothing else is reachable here.
MATERIAL_ASSIGN_COMMAND = "material.assign"
MATERIAL_DIRECTIONAL_COMMAND = "material.properties.directional"
DEFAULT_MATERIAL_DIRECTION = [1.0, 0.0, 0.0]


def material_commands(
    material: dict[str, Any] | None,
    body_name: str,
) -> list[dict[str, Any]]:
    """The material.assign command for one rebuilt body.

    A material is a property of the body, not a timeline step, so this is
    appended after the geometry commands on every regenerate. With no material
    set, nothing is appended and the result is unchanged.
    """
    if not material:
        return []
    name = str(material.get("name") or "").strip()
    if not name:
        return []
    return [
        {
            "command": MATERIAL_ASSIGN_COMMAND,
            "params": {"bodies": [body_name], "material": name},
        }
    ]


def directional_material_command(
    card: dict[str, Any],
    direction: Sequence[float] | None = None,
) -> dict[str, Any]:
    """The read-only Young's-modulus query for an engineering card.

    SolidCraft validates the card and normalises the direction; an invalid card
    or a zero vector fails the job rather than inventing data.
    """
    values = [float(value) for value in (direction or DEFAULT_MATERIAL_DIRECTION)[:3]]
    if len(values) != 3 or all(abs(value) < 1e-12 for value in values):
        raise SolidCraftMappingError(
            "material.properties.directional needs a non-zero three-component direction."
        )
    return {
        "command": MATERIAL_DIRECTIONAL_COMMAND,
        "params": {"card": card, "direction": values},
    }



def operations_to_commands(
    *,
    operations: Sequence[dict[str, Any]],
    sketches: dict[str, dict[str, Any]],
    bodies: dict[str, dict[str, Any]] | None = None,
    body_name: str = "PistolaBody",
    resolve_edges: Callable[[list[str], dict[str, Any]], list[list[float]]] | None = None,
    topology_for_body: Callable[[str, list[dict[str, Any]]], dict[str, Any]] | None = None,
    warnings: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Replay a Pistola operation timeline as a SolidCraft command script.

    Booleans recurse into the tool body's own history, so a body can be rebuilt
    from the same closure the browser sends to its OCCT worker. Edge operations
    need topology that only exists after earlier features run; the caller must
    supply the callbacks for those, or the mapping fails loudly.
    """
    commands: list[dict[str, Any]] = []
    first_feature = True
    bodies = bodies or {}
    if not operations:
        return commands
    units = os.getenv("SOLIDCRAFT_UNITS", "mm").strip().lower() or "mm"
    commands.append({"command": "document.units", "params": {"units": units}})

    for raw_operation in _normalize_operations(operations):
        if raw_operation.get("suppressed"):
            continue

        params = raw_operation.get("params") or {}
        kind = raw_operation.get("kind") or raw_operation.get("type")
        if kind == "solidcraft_command":
            command = params.get("command") or raw_operation.get("command")
            if not command:
                raise SolidCraftMappingError("A solidcraft_command operation has no command id.")
            command_params = dict(params.get("commandParams") or raw_operation.get("commandParams") or {})
            caller_overrides = any(
                key in command_params for key in ("operation", "targets", "name", "body_name")
            )
            if not caller_overrides and command in BODY_NAME_COMMANDS:
                if command in TARGETING_BODY_COMMANDS:
                    # A body-creating command without an explicit target would
                    # otherwise create a second body that the Pistola body does
                    # not represent. Join it into the body under regeneration.
                    command_params["operation"] = "join"
                    command_params["targets"] = [body_name]
                else:
                    # No target support (currently solid.bounding_solid): keep
                    # the separate body addressable, but say so.
                    command_params["body_name"] = body_name
                    if warnings is not None:
                        warnings.append(
                            f"SolidCraft command {command!r} created a separate body; "
                            f"this Pistola body does not represent it."
                        )
            commands.append({"command": command, "params": command_params})
            continue

        if kind in {"extrude", "sketch_to_solid"}:
            sketch_id = raw_operation.get("sketchId")
            sketch = sketches.get(str(sketch_id)) if sketch_id else None
            if not sketch:
                raise SolidCraftMappingError(
                    f"Sketch {sketch_id!r} is not available for the {kind} operation."
                )
            commands.extend(sketch_commands(sketch))
            commands.append(
                {
                    "command": "solid.extrude",
                    "params": _extrude_params(raw_operation, first_feature, body_name),
                }
            )
            first_feature = False
            continue

        if kind == "revolve":
            sketch_id = raw_operation.get("sketchId")
            sketch = sketches.get(str(sketch_id)) if sketch_id else None
            if not sketch:
                raise SolidCraftMappingError(f"Sketch {sketch_id!r} is not available for the revolve operation.")
            commands.extend(sketch_commands(sketch))
            commands.append(
                {
                    "command": "solid.revolve",
                    "params": _revolve_params(raw_operation, first_feature, body_name, sketch),
                }
            )
            first_feature = False
            continue

        if kind in BOOLEAN_KINDS:
            tool_body_ids = raw_operation.get("toolBodyIds") or params.get("toolBodyIds") or []
            if not tool_body_ids:
                raise SolidCraftMappingError(f"The {kind} operation has no tool body.")
            for index, tool_body_id in enumerate(tool_body_ids):
                tool_body = bodies.get(str(tool_body_id))
                if not tool_body:
                    raise SolidCraftMappingError(
                        f"Tool body {tool_body_id!r} is missing from the evaluation closure."
                    )
                tool_name = f"{body_name}Tool{index + 1}"
                commands.extend(
                    operations_to_commands(
                        operations=tool_body.get("operations") or tool_body.get("operationHistory") or [],
                        sketches=sketches,
                        bodies=bodies,
                        body_name=tool_name,
                        resolve_edges=resolve_edges,
                        topology_for_body=topology_for_body,
                    )
                )
                commands.append(
                    {
                        "command": "solid.combine",
                        "params": {
                            "target": body_name,
                            "tools": [tool_name],
                            "operation": BOOLEAN_KINDS[kind],
                        },
                    }
                )
            continue

        if kind in {"fillet", "chamfer"}:
            edge_refs = raw_operation.get("edgeRefs") or params.get("edgeRefs") or []
            if not resolve_edges or not topology_for_body:
                raise SolidCraftMappingError(
                    f"The {kind} operation needs live topology; call the topology-aware replay path."
                )
            topology = topology_for_body(body_name, commands)
            edges = resolve_edges(list(edge_refs), topology)
            if kind == "fillet":
                commands.append(
                    {
                        "command": "solid.fillet",
                        "params": {
                            "body": body_name,
                            "edges": edges,
                            "radius": to_solidcraft_length(
                                float(params.get("radius", raw_operation.get("radius", 0.05)))
                            ),
                        },
                    }
                )
            else:
                commands.append(
                    {
                        "command": "solid.chamfer",
                        "params": {
                            "body": body_name,
                            "edges": edges,
                            "distance": to_solidcraft_length(
                                float(params.get("distance", raw_operation.get("distance", 0.05)))
                            ),
                        },
                    }
                )
            continue

        raise SolidCraftMappingError(f"Unsupported CAD operation kind: {kind!r}")

    return commands


def resolve_edge_refs(edge_refs: Sequence[str], topology: dict[str, Any]) -> list[list[float]]:
    """Map Pistola edge references onto SolidCraft edge midpoint triples.

    `edge-N` is the 1-based edge order SolidCraft reports. A literal JSON triple
    is also accepted for callers that already resolved topology. Anything else
    fails with the available edge indices instead of silently picking an edge.
    """
    edges = topology.get("edges") or []
    if not edges:
        raise SolidCraftMappingError(
            "SolidCraft returned no edges for this body, so the edge reference cannot be resolved."
        )

    resolved: list[list[float]] = []
    for edge_ref in edge_refs:
        text = str(edge_ref).strip()
        if text.startswith("edge-"):
            try:
                index = int(text.removeprefix("edge-")) - 1
            except ValueError as error:
                raise SolidCraftMappingError(f"Invalid edge reference {edge_ref!r}.") from error
            if index < 0 or index >= len(edges):
                available = ", ".join(str(edge.get("index", i + 1)) for i, edge in enumerate(edges))
                raise SolidCraftMappingError(
                    f"Edge reference {edge_ref!r} is outside this body; available edges: {available}."
                )
            midpoint = edges[index].get("midpoint") or edges[index].get("mid")
            if not isinstance(midpoint, (list, tuple)) or len(midpoint) < 3:
                raise SolidCraftMappingError(f"Edge {edge_ref!r} has no midpoint in the topology result.")
            resolved.append([float(midpoint[0]), float(midpoint[1]), float(midpoint[2])])
            continue

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as error:
            raise SolidCraftMappingError(
                f"Edge reference {edge_ref!r} is neither `edge-N` nor a JSON coordinate triple."
            ) from error

        if not isinstance(parsed, (list, tuple)) or len(parsed) < 3:
            raise SolidCraftMappingError(f"Edge reference {edge_ref!r} is not an [x,y,z] triple.")
        resolved.append([float(parsed[0]), float(parsed[1]), float(parsed[2])])

    return resolved


def preview_from_measurement(measurement: dict[str, Any]) -> dict[str, Any]:
    bodies = measurement.get("bodies") or []
    boxes = [
        body.get("bbox")
        for body in bodies
        if isinstance(body, dict) and isinstance(body.get("bbox"), dict)
    ]
    if not boxes:
        return {"primitive": "box", "dimensions": [1.0, 1.0, 1.0], "color": "#60a5fa"}

    minimum = [min(float(box["min"][i]) for box in boxes) for i in range(3)]
    maximum = [max(float(box["max"][i]) for box in boxes) for i in range(3)]
    dimensions = [
        max(from_solidcraft_length(maximum[i] - minimum[i]), 0.01)
        for i in range(3)
    ]
    # SolidCraft is Z-up; the scene preview is Y-up.
    return {
        "primitive": "box",
        "dimensions": [dimensions[0], dimensions[2], dimensions[1]],
        "color": "#60a5fa",
    }
