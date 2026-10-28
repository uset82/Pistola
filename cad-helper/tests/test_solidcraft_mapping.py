from __future__ import annotations

import json

import pytest

from solidcraft.mapping import (
    SolidCraftMappingError,
    TARGETING_BODY_COMMANDS,
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


def _solidcraft_command(command: str, params: dict) -> dict:
    return {
        "id": "op-solidcraft",
        "kind": "solidcraft_command",
        "params": {
            "command": command,
            "commandParams": params,
        },
    }


def test_body_creating_command_joins_the_pistola_body():
    warnings: list[str] = []
    commands = operations_to_commands(
        operations=[
            _solidcraft_command(
                "solid.box", {"length": 10, "width": 10, "height": 40}
            )
        ],
        sketches={},
        body_name="PistolaBody",
        warnings=warnings,
    )

    command = commands[-1]
    assert command["command"] == "solid.box"
    assert command["params"]["operation"] == "join"
    assert command["params"]["targets"] == ["PistolaBody"]
    assert "body_name" not in command["params"]
    assert warnings == []


def test_caller_supplied_command_placement_wins():
    supplied = {
        "operation": "cut",
        "targets": ["OtherBody"],
        "name": "Custom",
        "body_name": "CustomBody",
    }
    commands = operations_to_commands(
        operations=[_solidcraft_command("solid.box", dict(supplied))],
        sketches={},
        body_name="PistolaBody",
    )

    params = commands[-1]["params"]
    assert params["operation"] == "cut"
    assert params["targets"] == ["OtherBody"]
    assert params["name"] == "Custom"
    assert params["body_name"] == "CustomBody"


def test_bounding_solid_warns_instead_of_joining():
    warnings: list[str] = []
    commands = operations_to_commands(
        operations=[
            _solidcraft_command("solid.bounding_solid", {"margin": 1})
        ],
        sketches={},
        body_name="PistolaBody",
        warnings=warnings,
    )

    params = commands[-1]["params"]
    assert params["body_name"] == "PistolaBody"
    assert "targets" not in params
    assert "operation" not in params
    assert len(warnings) == 1
    assert "does not represent it" in warnings[0]


def test_non_body_command_is_unchanged():
    params_in = {"bodies": ["PistolaBody"], "factor": 2}
    commands = operations_to_commands(
        operations=[_solidcraft_command("solid.scale", params_in)],
        sketches={},
        body_name="PistolaBody",
    )

    assert commands[-1]["params"] == params_in


def test_targeting_commands_are_derived_from_the_catalog():
    assert "solid.bounding_solid" not in TARGETING_BODY_COMMANDS
    assert len(TARGETING_BODY_COMMANDS) == 11
    assert "solid.box" in TARGETING_BODY_COMMANDS
    assert "solid.extrude" in TARGETING_BODY_COMMANDS
