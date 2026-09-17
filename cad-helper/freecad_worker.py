from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path
from typing import Any


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

import FreeCAD as App  # type: ignore
import Part  # type: ignore


def artifact_ref(path: Path) -> str:
    return path.as_posix()


def artifact_url(path: Path, artifact_dir: Path) -> str:
    return f"/v1/cad/artifacts/{path.relative_to(artifact_dir).as_posix()}"


def _float_pair(point: Any) -> tuple[float, float]:
    if not isinstance(point, (list, tuple)) or len(point) < 2:
        raise ValueError(f"Invalid sketch point: {point!r}")
    return float(point[0]), float(point[1])


def _world_vector(point: Any) -> Any:
    x, z = _float_pair(point)
    return App.Vector(x, 0.0, z)


def _axis_vector(axis: str, custom_axis: Any | None = None) -> Any:
    if axis == "X":
        return App.Vector(1.0, 0.0, 0.0)
    if axis == "Y":
        return App.Vector(0.0, 1.0, 0.0)
    if axis == "custom" and isinstance(custom_axis, (list, tuple)) and len(custom_axis) == 3:
        return App.Vector(float(custom_axis[0]), float(custom_axis[1]), float(custom_axis[2]))
    return App.Vector(0.0, 0.0, 1.0)


def _wire_is_closed(wire: Any) -> bool:
    is_closed = getattr(wire, "isClosed", None)
    if callable(is_closed):
        return bool(is_closed())
    return bool(getattr(wire, "Closed", False))


def _rectangle_wire(entity: dict[str, Any]) -> Any:
    center_x, center_z = _float_pair(entity.get("center", [0.0, 0.0]))
    width = float(entity.get("width", 1.0))
    height = float(entity.get("height", 1.0))
    half_w = width / 2
    half_h = height / 2
    return Part.makePolygon(
        [
            App.Vector(center_x - half_w, 0.0, center_z - half_h),
            App.Vector(center_x + half_w, 0.0, center_z - half_h),
            App.Vector(center_x + half_w, 0.0, center_z + half_h),
            App.Vector(center_x - half_w, 0.0, center_z + half_h),
            App.Vector(center_x - half_w, 0.0, center_z - half_h),
        ]
    )


def _circle_wire(entity: dict[str, Any]) -> Any:
    center_x, center_z = _float_pair(entity.get("center", [0.0, 0.0]))
    radius = float(entity.get("radius", 1.0))
    edge = Part.Edge(Part.Circle(App.Vector(center_x, 0.0, center_z), App.Vector(0.0, 1.0, 0.0), radius))
    return Part.Wire([edge])


def _arc_edge(entity: dict[str, Any]) -> Any:
    center_x, center_z = _float_pair(entity.get("center", [0.0, 0.0]))
    radius = float(entity.get("radius", 1.0))
    start_angle = float(entity.get("startAngle", 0.0))
    end_angle = float(entity.get("endAngle", math.pi / 2))
    circle = Part.Circle(App.Vector(center_x, 0.0, center_z), App.Vector(0.0, 1.0, 0.0), radius)
    return Part.Edge(Part.ArcOfCircle(circle, start_angle, end_angle))


def _polyline_wire(entity: dict[str, Any]) -> Any:
    points = [_world_vector(point) for point in entity.get("points", [])]
    if len(points) < 2:
        raise ValueError("Polyline entities require at least two points.")
    if entity.get("closed") and points[0] != points[-1]:
        points.append(points[0])
    return Part.makePolygon(points)


def _line_edge(entity: dict[str, Any]) -> Any:
    return Part.makeLine(_world_vector(entity.get("start", [0.0, 0.0])), _world_vector(entity.get("end", [1.0, 0.0])))


def build_profile_from_sketch(sketch: dict[str, Any]) -> tuple[Any, Any]:
    entities = sketch.get("entities") or []
    if not entities:
        raise ValueError("Sketch does not contain any entities.")

    closed_wires: list[Any] = []
    loose_edges: list[Any] = []

    for entity in entities:
        kind = entity.get("kind")
        if kind == "rectangle":
            closed_wires.append(_rectangle_wire(entity))
        elif kind == "circle":
            closed_wires.append(_circle_wire(entity))
        elif kind == "polyline":
            wire = _polyline_wire(entity)
            if _wire_is_closed(wire):
                closed_wires.append(wire)
            else:
                loose_edges.extend(list(getattr(wire, "Edges", [])))
        elif kind == "line":
            loose_edges.append(_line_edge(entity))
        elif kind == "arc":
            loose_edges.append(_arc_edge(entity))
        else:
            raise ValueError(f"Unsupported sketch entity kind: {kind}")

    if not closed_wires and loose_edges:
        candidate_wire = Part.Wire(loose_edges)
        if _wire_is_closed(candidate_wire):
            closed_wires.append(candidate_wire)

    if not closed_wires:
        raise ValueError(
            "The sketch must contain one closed profile for sketch-to-solid, extrude, or revolve."
        )

    profile_wire = closed_wires[0]
    return profile_wire, Part.Face(profile_wire)


def _bounding_box_preview(shape: Any, color: str) -> dict[str, Any]:
    bound_box = shape.BoundBox
    dimensions = [
        max(float(bound_box.XLength), 0.01),
        max(float(bound_box.YLength), 0.01),
        max(float(bound_box.ZLength), 0.01),
    ]
    return {
        "primitive": "box",
        "dimensions": dimensions,
        "color": color,
    }


def _normalize(vector: tuple[float, float, float]) -> tuple[float, float, float]:
    length = math.sqrt(sum(component * component for component in vector))
    if length <= 1e-9:
        return (0.0, 1.0, 0.0)
    return tuple(component / length for component in vector)


def _cross(left: tuple[float, float, float], right: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )


def write_glb_preview(shape: Any, output_path: Path) -> None:
    vertices, facets = shape.tessellate()
    positions: list[float] = []
    normals: list[float] = []

    for facet in facets:
        indices = list(facet)
        if len(indices) < 3:
            continue

        triangles = [indices[:3]] if len(indices) == 3 else [
            [indices[0], indices[i], indices[i + 1]]
            for i in range(1, len(indices) - 1)
        ]

        for triangle in triangles:
            v0 = vertices[triangle[0]]
            v1 = vertices[triangle[1]]
            v2 = vertices[triangle[2]]
            p0 = (float(v0.x), float(v0.y), float(v0.z))
            p1 = (float(v1.x), float(v1.y), float(v1.z))
            p2 = (float(v2.x), float(v2.y), float(v2.z))
            edge_a = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
            edge_b = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
            normal = _normalize(_cross(edge_a, edge_b))

            positions.extend((*p0, *p1, *p2))
            normals.extend((*normal, *normal, *normal))

    if not positions:
        raise ValueError("The FreeCAD shape could not be tessellated for preview export.")

    position_bytes = struct.pack(f"<{len(positions)}f", *positions)
    normal_bytes = struct.pack(f"<{len(normals)}f", *normals)
    position_length = len(position_bytes)
    normal_offset = position_length
    binary_chunk = position_bytes + normal_bytes
    if len(binary_chunk) % 4:
        binary_chunk += b"\x00" * (4 - (len(binary_chunk) % 4))

    vertex_count = len(positions) // 3
    gltf_payload = {
        "asset": {"version": "2.0", "generator": "Pistola FreeCAD bridge"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1},
                        "mode": 4,
                        "material": 0,
                    }
                ]
            }
        ],
        "materials": [
            {
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.376, 0.647, 0.98, 1.0],
                    "metallicFactor": 0.1,
                    "roughnessFactor": 0.65,
                }
            }
        ],
        "buffers": [{"byteLength": len(binary_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": position_length, "target": 34962},
            {"buffer": 0, "byteOffset": normal_offset, "byteLength": len(normal_bytes), "target": 34962},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": vertex_count,
                "type": "VEC3",
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": vertex_count,
                "type": "VEC3",
            },
        ],
    }

    json_chunk = json.dumps(gltf_payload, separators=(",", ":")).encode("utf-8")
    if len(json_chunk) % 4:
        json_chunk += b" " * (4 - (len(json_chunk) % 4))

    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary_chunk)
    output_path.write_bytes(
        b"glTF"
        + struct.pack("<I", 2)
        + struct.pack("<I", total_length)
        + struct.pack("<I", len(json_chunk))
        + b"JSON"
        + json_chunk
        + struct.pack("<I", len(binary_chunk))
        + b"BIN\x00"
        + binary_chunk
    )


def _new_document(job_id: str) -> Any:
    return App.newDocument(f"Pistola_{job_id}")


def _first_shape_object(document: Any) -> Any | None:
    for obj in getattr(document, "Objects", []):
        shape = getattr(obj, "Shape", None)
        if shape is not None and not shape.isNull():
            return obj
    return None


def save_shape_document(job_id: str, shape: Any, cad_path: Path) -> None:
    document = _new_document(job_id)
    try:
        body = document.addObject("Part::Feature", "Body")
        body.Shape = shape

        document.recompute()
        document.saveAs(str(cad_path))
    finally:
        App.closeDocument(document.Name)


def load_shape_from_cad_artifact(cad_artifact_path: Path) -> Any:
    suffix = cad_artifact_path.suffix.lower()
    if suffix in {".fcstd"}:
        document = App.openDocument(str(cad_artifact_path))
        try:
            obj = _first_shape_object(document)
            if obj is None:
                raise ValueError(f"No shape object was found in {cad_artifact_path.name}.")
            return obj.Shape.copy()
        finally:
            App.closeDocument(document.Name)

    if suffix in {".step", ".stp"}:
        shape = Part.Shape()
        shape.read(str(cad_artifact_path))
        return shape

    raise ValueError(
        f"Unsupported CAD artifact format for regeneration/export: {cad_artifact_path.suffix}"
    )


def _cad_artifact_path(payload: dict[str, Any], body: dict[str, Any]) -> Path | None:
    for candidate in [
        payload.get("cadArtifactRef"),
        body.get("cadArtifactRef"),
        (body.get("artifacts") or {}).get("cadArtifactRef"),
        (body.get("artifacts") or {}).get("cadUrl"),
    ]:
        if isinstance(candidate, str) and candidate:
            path = Path(candidate)
            if path.exists() and path.is_file():
                return path
    return None


def _sanitize_export_name(name: str) -> str:
    return "-".join(
        part for part in "".join(ch.lower() if ch.isalnum() else " " for ch in name).split()
    ) or "cad-body"


def _build_artifacts(
    *,
    artifact_dir: Path,
    preview_path: Path | None,
    cad_path: Path | None,
    export_path: Path | None = None,
) -> dict[str, Any]:
    return {
        **(
            {
                "previewUrl": artifact_url(preview_path, artifact_dir),
                "previewArtifactRef": artifact_ref(preview_path),
            }
            if preview_path and preview_path.exists()
            else {}
        ),
        **(
            {
                "cadUrl": artifact_url(cad_path, artifact_dir),
                "cadArtifactRef": artifact_ref(cad_path),
            }
            if cad_path and cad_path.exists()
            else {}
        ),
        **(
            {
                "exportUrl": artifact_url(export_path, artifact_dir),
            }
            if export_path and export_path.exists()
            else {}
        ),
    }


def _build_result(
    *,
    job_id: str,
    job_type: str,
    artifact_dir: Path,
    shape: Any,
    operations: list[dict[str, Any]],
    color: str,
    cad_path: Path,
    preview_path: Path | None,
    warnings: list[str] | None = None,
    export_file: dict[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "jobId": job_id,
        "type": job_type,
        "status": "succeeded",
        "warnings": warnings or [],
        "result": {
            "preview": _bounding_box_preview(shape, color),
            "operations": operations,
            "artifacts": _build_artifacts(
                artifact_dir=artifact_dir,
                preview_path=preview_path,
                cad_path=cad_path,
                export_path=Path(export_file["path"]) if export_file and "path" in export_file else None,
            ),
            **(
                {
                    "exportFile": {
                        "filename": export_file["filename"],
                        "content": export_file["content"],
                    }
                }
                if export_file
                else {}
            ),
        },
    }


def run_sketch_to_solid(job_id: str, payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    sketch = payload.get("sketch") or {}
    depth = float(payload.get("depth", 1.2))
    profile_wire, profile_face = build_profile_from_sketch(sketch)
    shape = profile_face.extrude(App.Vector(0.0, depth, 0.0))
    cad_path = artifact_dir / f"{job_id}-sketch_to_solid.FCStd"
    preview_path = artifact_dir / f"{job_id}-sketch_to_solid.glb"
    save_shape_document(job_id, shape, cad_path)
    write_glb_preview(shape, preview_path)
    operation = {
        "id": f"op_{job_id}",
        "type": "extrude",
        "kind": "extrude",
        "params": {"distance": depth, "direction": [0.0, 1.0, 0.0], "symmetric": False},
        "suppressed": False,
        "sketchId": sketch.get("id", "sketch"),
        "depth": depth,
        "distance": depth,
        "direction": [0.0, 1.0, 0.0],
        "symmetric": False,
    }
    return _build_result(
        job_id=job_id,
        job_type="sketch_to_solid",
        artifact_dir=artifact_dir,
        shape=shape,
        operations=[operation],
        color="#60a5fa",
        cad_path=cad_path,
        preview_path=preview_path,
    )


def run_extrude(job_id: str, payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    sketch = payload.get("sketch") or {}
    distance = float(payload.get("distance", 1.2))
    direction = payload.get("direction") or [0.0, 1.0, 0.0]
    symmetric = bool(payload.get("symmetric", False))
    _, profile_face = build_profile_from_sketch(sketch)

    extrude_vector = App.Vector(float(direction[0]), float(direction[1]), float(direction[2]))
    scaled_vector = App.Vector(
        extrude_vector.x * distance,
        extrude_vector.y * distance,
        extrude_vector.z * distance,
    )
    if symmetric:
        half_vector = App.Vector(
            scaled_vector.x / 2.0,
            scaled_vector.y / 2.0,
            scaled_vector.z / 2.0,
        )
        shape = profile_face.extrude(half_vector)
        mirrored = profile_face.extrude(
            App.Vector(-half_vector.x, -half_vector.y, -half_vector.z)
        )
        shape = shape.fuse(mirrored)
    else:
        shape = profile_face.extrude(scaled_vector)

    cad_path = artifact_dir / f"{job_id}-extrude.FCStd"
    preview_path = artifact_dir / f"{job_id}-extrude.glb"
    save_shape_document(job_id, shape, cad_path)
    write_glb_preview(shape, preview_path)
    operation = {
        "id": f"op_{job_id}",
        "type": "extrude",
        "kind": "extrude",
        "params": {"distance": distance, "direction": direction, "symmetric": symmetric},
        "suppressed": False,
        "sketchId": payload.get("sketchId", sketch.get("id", "sketch")),
        "depth": distance,
        "distance": distance,
        "direction": direction,
        "symmetric": symmetric,
    }
    return _build_result(
        job_id=job_id,
        job_type="extrude",
        artifact_dir=artifact_dir,
        shape=shape,
        operations=[operation],
        color="#60a5fa",
        cad_path=cad_path,
        preview_path=preview_path,
    )


def run_revolve(job_id: str, payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    sketch = payload.get("sketch") or {}
    angle = float(payload.get("angle", 360.0))
    axis = str(payload.get("axis", "Z"))
    custom_axis = payload.get("customAxis")
    _, profile_face = build_profile_from_sketch(sketch)
    shape = profile_face.revolve(App.Vector(0.0, 0.0, 0.0), _axis_vector(axis, custom_axis), angle)

    cad_path = artifact_dir / f"{job_id}-revolve.FCStd"
    preview_path = artifact_dir / f"{job_id}-revolve.glb"
    save_shape_document(job_id, shape, cad_path)
    write_glb_preview(shape, preview_path)
    operation = {
        "id": f"op_{job_id}",
        "type": "revolve",
        "kind": "revolve",
        "params": {
            "axis": axis,
            "angle": angle,
            **({"customAxis": custom_axis} if axis == "custom" and custom_axis else {}),
        },
        "suppressed": False,
        "sketchId": payload.get("sketchId", sketch.get("id", "sketch")),
        "axis": axis,
        "angle": angle,
        **({"customAxis": custom_axis} if axis == "custom" and custom_axis else {}),
    }
    return _build_result(
        job_id=job_id,
        job_type="revolve",
        artifact_dir=artifact_dir,
        shape=shape,
        operations=[operation],
        color="#38bdf8",
        cad_path=cad_path,
        preview_path=preview_path,
    )


def run_regenerate(job_id: str, payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    body = payload.get("body") or {}
    sketch = payload.get("sketch") or {}
    overrides = payload.get("overrides") or {}
    operations = body.get("operationHistory") or body.get("operations") or []
    latest_operation = next(
        (operation for operation in reversed(operations) if not operation.get("suppressed")),
        None,
    )

    if latest_operation is None:
        cad_path = _cad_artifact_path(payload, body)
        if cad_path is None:
            raise ValueError(
                "Regenerate requires either an operation history with a linked sketch or an existing CAD artifact."
            )
        shape = load_shape_from_cad_artifact(cad_path)
        next_cad_path = artifact_dir / f"{job_id}-regenerate.FCStd"
        preview_path = artifact_dir / f"{job_id}-regenerate.glb"
        save_shape_document(job_id, shape, next_cad_path)
        write_glb_preview(shape, preview_path)
        return _build_result(
            job_id=job_id,
            job_type="regenerate",
            artifact_dir=artifact_dir,
            shape=shape,
            operations=[],
            color="#60a5fa",
            cad_path=next_cad_path,
            preview_path=preview_path,
        )

    latest_kind = str(latest_operation.get("kind") or latest_operation.get("type") or "")
    if latest_kind in {"boolean_union", "boolean_cut", "boolean_intersect", "fillet", "chamfer", "boolean"}:
        raise ValueError(
            f"{latest_kind} regeneration is deferred until post-phase-1 FreeCAD integration."
        )

    if latest_kind == "revolve":
        result = run_revolve(
            job_id,
            {
                "sketchId": latest_operation.get("sketchId", sketch.get("id", "sketch")),
                "axis": latest_operation.get("axis")
                or (latest_operation.get("params") or {}).get("axis", "Z"),
                "angle": latest_operation.get("angle")
                or (latest_operation.get("params") or {}).get("angle", 360.0),
                "customAxis": latest_operation.get("customAxis")
                or (latest_operation.get("params") or {}).get("customAxis"),
                "sketch": sketch,
            },
            artifact_dir,
        )
    else:
        distance = float(
            overrides.get("depth")
            or latest_operation.get("distance")
            or latest_operation.get("depth")
            or (latest_operation.get("params") or {}).get("distance", 1.2)
        )
        result = run_extrude(
            job_id,
            {
                "sketchId": latest_operation.get("sketchId", sketch.get("id", "sketch")),
                "distance": distance,
                "direction": latest_operation.get("direction")
                or (latest_operation.get("params") or {}).get("direction", [0.0, 1.0, 0.0]),
                "symmetric": latest_operation.get("symmetric")
                or (latest_operation.get("params") or {}).get("symmetric", False),
                "sketch": sketch,
            },
            artifact_dir,
        )

    if result.get("result"):
        result["result"]["operations"] = operations
    result["type"] = "regenerate"
    return result


def run_import_step(job_id: str, payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    source_path_value = payload.get("filePath")
    if not isinstance(source_path_value, str) or not source_path_value:
        raise ValueError("import_step requires a STEP filePath.")

    source_path = Path(source_path_value)
    if not source_path.exists() or not source_path.is_file():
        raise ValueError(f"STEP source file does not exist: {source_path}")

    shape = Part.Shape()
    shape.read(str(source_path))

    cad_path = artifact_dir / f"{job_id}-import.FCStd"
    preview_path = artifact_dir / f"{job_id}-import.glb"
    save_shape_document(job_id, shape, cad_path)
    write_glb_preview(shape, preview_path)

    return _build_result(
        job_id=job_id,
        job_type="import_step",
        artifact_dir=artifact_dir,
        shape=shape,
        operations=[],
        color="#93c5fd",
        cad_path=cad_path,
        preview_path=preview_path,
    )


def run_export_step(job_id: str, payload: dict[str, Any], artifact_dir: Path) -> dict[str, Any]:
    body = payload.get("body") or {}
    source_path = _cad_artifact_path(payload, body)
    if source_path is None:
        raise ValueError("export_step requires a CAD artifact reference to a .FCStd or STEP file.")

    shape = load_shape_from_cad_artifact(source_path)
    cad_path = artifact_dir / f"{job_id}-export.FCStd"
    preview_path = artifact_dir / f"{job_id}-export.glb"
    save_shape_document(job_id, shape, cad_path)
    write_glb_preview(shape, preview_path)

    filename = f"{_sanitize_export_name(str(payload.get('bodyName') or body.get('name') or body.get('id') or 'cad-body'))}.step"
    target_path = (
        Path(payload["targetPath"]).resolve()
        if isinstance(payload.get("targetPath"), str) and payload.get("targetPath")
        else artifact_dir / filename
    )
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shape.exportStep(str(target_path))
    content = target_path.read_text(encoding="utf-8", errors="ignore")

    result = _build_result(
        job_id=job_id,
        job_type="export_step",
        artifact_dir=artifact_dir,
        shape=shape,
        operations=body.get("operations") or [],
        color="#60a5fa",
        cad_path=cad_path,
        preview_path=preview_path,
        export_file={
            "path": str(target_path),
            "filename": target_path.name,
            "content": content,
        },
    )
    return result


def main() -> int:
    if len(sys.argv) < 5:
        raise SystemExit(
            "freecad_worker.py requires jobId, jobType, artifactDir, payloadPath, and outputPath."
        )

    job_id = sys.argv[-5]
    job_type = sys.argv[-4]
    artifact_dir = Path(sys.argv[-3]).resolve()
    payload_path = Path(sys.argv[-2]).resolve()
    output_path = Path(sys.argv[-1]).resolve()

    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    try:
        if job_type == "sketch_to_solid":
            result = run_sketch_to_solid(job_id, payload, artifact_dir)
        elif job_type == "extrude":
            result = run_extrude(job_id, payload, artifact_dir)
        elif job_type == "revolve":
            result = run_revolve(job_id, payload, artifact_dir)
        elif job_type == "regenerate":
            result = run_regenerate(job_id, payload, artifact_dir)
        elif job_type == "import_step":
            result = run_import_step(job_id, payload, artifact_dir)
        elif job_type == "export_step":
            result = run_export_step(job_id, payload, artifact_dir)
        else:
            raise ValueError(f"Unsupported FreeCAD core job: {job_type}")
    except Exception as error:  # pragma: no cover - exercised through bridge contract
        result = {
            "jobId": job_id,
            "type": job_type,
            "status": "failed",
            "warnings": [],
            "error": str(error),
        }

    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
