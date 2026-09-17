from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def entity_points(entity: dict[str, Any]) -> list[tuple[float, float]]:
    kind = entity.get("kind")
    if kind == "line":
        return [tuple(entity.get("start", [0.0, 0.0])), tuple(entity.get("end", [1.0, 0.0]))]
    if kind == "rectangle":
        center_x, center_y = entity.get("center", [0.0, 0.0])
        width = float(entity.get("width", 2.0))
        height = float(entity.get("height", 1.5))
        half_w = width / 2
        half_h = height / 2
        return [
            (center_x - half_w, center_y - half_h),
            (center_x + half_w, center_y + half_h),
        ]
    if kind in {"circle", "arc"}:
        center_x, center_y = entity.get("center", [0.0, 0.0])
        radius = float(entity.get("radius", 1.0))
        return [(center_x - radius, center_y - radius), (center_x + radius, center_y + radius)]
    if kind == "polyline":
        return [tuple(point) for point in entity.get("points", [])]
    return [(-1.0, -0.75), (1.0, 0.75)]


def sketch_bounds(sketch: dict[str, Any]) -> tuple[float, float]:
    entities = sketch.get("entities", [])
    points = [point for entity in entities for point in entity_points(entity)]
    if not points:
        return 2.0, 1.5

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    width = max(max(xs) - min(xs), 0.5)
    depth = max(max(ys) - min(ys), 0.5)
    return width, depth


def write_placeholder_artifact(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json.dumps(payload, indent=2).encode("utf-8"))


def artifact_ref(path: Path) -> str:
    return path.as_posix()


def artifact_url(path: Path, artifact_dir: Path) -> str:
    relative_path = path.relative_to(artifact_dir).as_posix()
    return f"/v1/cad/artifacts/{relative_path}"


def preview_dimensions_from_body(body: dict[str, Any]) -> tuple[float, float, float]:
    preview = body.get("preview") or {}
    primitive = preview.get("primitive")

    if primitive == "box":
        dimensions = preview.get("dimensions") or [2.0, 1.2, 1.5]
        return float(dimensions[0]), float(dimensions[1]), float(dimensions[2])

    if primitive == "cylinder":
        radius = float(preview.get("radius", 0.5))
        height = float(preview.get("height", 1.2))
        diameter = radius * 2
        return diameter, height, diameter

    return 2.0, 1.2, 1.5


def body_operations(body: dict[str, Any]) -> list[dict[str, Any]]:
    operations = body.get("operations") or body.get("operationHistory") or []
    return [dict(operation) for operation in operations]
