from __future__ import annotations

import json

import pytest

from solidcraft.mapping import (
    SolidCraftMappingError,
    from_solidcraft_length,
    operations_to_commands,
    preview_from_measurement,
    resolve_edge_refs,
    sketch_commands,
    to_solidcraft_length,
)


def test_length_round_trip_is_exact_for_scene_values():
    for value in (0.0, 0.01, 0.05, 1.2, 2.7, 40.0):
        assert from_solidcraft_length(to_solidcraft_length(value)) == pytest.approx(value)


def test_sketch_rectangle_maps_to_verified_command_ids():
    commands = sketch_commands(
        {
            "id": "sketch-1",
            "name": "Sketch 1",
            "plane": "level",
            "position": [1.0, 0.01, 2.0],
            "entities": [
                {
                    "id": "rect-1",
                    "kind": "rectangle",
                    "center": [0.0, 0.0],
                    "width": 40.0,
                    "height": 30.0,
                }
            ],
        }
    )

    assert commands[0]["command"] == "sketch.create"
    assert commands[0]["params"]["plane"] == {
        "origin": [1000.0, -2000.0, 10.0],
        "x_dir": [1, 0, 0],
        "y_dir": [0, 1, 0],
    }
    assert commands[1] == {
        "command": "sketch.rectangle.two_point",
        "params": {"p0": [-20000.0, -15000.0], "p1": [20000.0, 15000.0]},
    }
    assert commands[-1]["command"] == "sketch.finish"


def test_sketch_entity_kinds_map_to_live_catalog_ids():
    commands = sketch_commands(
        {
            "plane": "XY",
            "position": [0, 0, 0],
            "entities": [
                {"kind": "line", "start": [0, 0], "end": [1, 0]},
                {"kind": "circle", "center": [0, 0], "radius": 0.5},
                {
                    "kind": "arc",
                    "center": [0, 0],
                    "radius": 0.5,
                    "startAngle": 0,
                    "endAngle": 1.57,
                },
                {"kind": "polyline", "points": [[0, 0], [1, 0], [1, 1]], "closed": True},
            ],
        }
    )
    ids = [command["command"] for command in commands]
    assert ids[:5] == [
        "sketch.create",
        "sketch.line",
        "sketch.circle.center",
        "sketch.arc.center_point",
        "sketch.line",
    ]
    assert commands[-1]["command"] == "sketch.finish"


def test_unit_conversion_is_metres_to_millimetres():
    assert to_solidcraft_length(1.2) == 1200.0
    assert from_solidcraft_length(1200.0) == 1.2


def test_operation_timeline_sets_units_and_creates_body():
    sketch = {
        "id": "sketch-1",
        "plane": "level",
        "position": [0, 0, 0],
        "entities": [{"kind": "rectangle", "center": [0, 0], "width": 1.0, "height": 0.5}],
    }
    operation = {
        "id": "op-1",
        "kind": "extrude",
        "params": {"distance": 0.2, "direction": [0, 1, 0], "symmetric": False},
        "sketchId": "sketch-1",
    }

    commands = operations_to_commands(
        operations=[operation],
        sketches={"sketch-1": sketch},
        body_name="PistolaBody",
    )

    assert commands[0] == {"command": "document.units", "params": {"units": "mm"}}
    extrude = commands[-1]
    assert extrude["command"] == "solid.extrude"
    assert extrude["params"]["distance"] == pytest.approx(200.0)
    assert extrude["params"]["body_name"] == "PistolaBody"
    assert extrude["params"]["operation"] == "new"


def test_edge_refs_resolve_by_zero_based_index_and_midpoint():
    topology = {
        "edges": [
            {"index": 0, "mid": [10.0, 0.0, 5.0]},
            {"index": 1, "midpoint": [20.0, 5.0, 5.0]},
        ]
    }
    assert resolve_edge_refs(["edge-1"], topology) == [[10.0, 0.0, 5.0]]
    assert resolve_edge_refs(["edge-2"], topology) == [[20.0, 5.0, 5.0]]
    assert resolve_edge_refs([json.dumps([1, 2, 3])], topology) == [[1.0, 2.0, 3.0]]


def test_unresolvable_edge_fails_with_available_edges():
    topology = {"edges": [{"index": 0, "mid": [0, 0, 0]}]}
    with pytest.raises(SolidCraftMappingError, match="available edges"):
        resolve_edge_refs(["edge-9"], topology)
    with pytest.raises(SolidCraftMappingError):
        resolve_edge_refs(["not-an-edge"], topology)


def test_preview_is_converted_from_solidcraft_z_up_to_scene_y_up():
    preview = preview_from_measurement(
        {"bodies": [{"bbox": {"min": [0, 0, 0], "max": [40000, 30000, 20000]}}]}
    )
    assert preview["dimensions"] == pytest.approx([40.0, 20.0, 30.0])


def test_missing_sketch_fails_loudly():
    with pytest.raises(SolidCraftMappingError, match="not available"):
        operations_to_commands(
            operations=[{"kind": "extrude", "sketchId": "missing", "params": {"distance": 1}}],
            sketches={},
        )
