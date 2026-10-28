"""The SolidCraft bridge and the job schemas must agree on field names.

A missing field here does not fail at import or in any unit test: it raises
`AttributeError` only when a real job runs, which surfaces in the editor as an
opaque "Internal Server Error". These tests read the attribute accesses out of
`solidcraft/jobs.py` and assert every one exists on the payload it is used
with, so the two files cannot drift apart silently again.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import schemas

CAD_HELPER_ROOT = Path(__file__).resolve().parents[1]
BRIDGE_JOBS = CAD_HELPER_ROOT / "solidcraft" / "jobs.py"

#: Which payload each `run_*` handler in the bridge receives. Mirrors the
#: dispatch in `routers/jobs.py`.
HANDLER_PAYLOADS = {
    "run_sketch_to_solid": schemas.SketchToSolidPayload,
    "run_extrude": schemas.ExtrudePayload,
    "run_revolve": schemas.RevolvePayload,
    "run_regenerate": schemas.RegeneratePayload,
    "run_fillet": schemas.FilletPayload,
    "run_chamfer": schemas.ChamferPayload,
    "run_import_step": schemas.ImportStepPayload,
    "run_export_step": schemas.ExportStepPayload,
    "run_command": schemas.CommandPayload,
    "run_batch": schemas.BatchPayload,
    "run_list_commands": schemas.ListCommandsPayload,
    "run_describe_command": schemas.DescribeCommandPayload,
    "run_inspection": schemas.InspectionPayload,
    "run_assign_cad_material": schemas.AssignCadMaterialPayload,
}

BOOLEAN_PAYLOADS = (
    schemas.BooleanUnionPayload,
    schemas.BooleanCutPayload,
    schemas.BooleanIntersectPayload,
)


def _payload_attributes(function_name: str) -> set[str]:
    """Every `payload.<name>` read inside one top-level function."""
    tree = ast.parse(BRIDGE_JOBS.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == function_name:
            return {
                child.attr
                for child in ast.walk(node)
                if isinstance(child, ast.Attribute)
                and isinstance(child.value, ast.Name)
                and child.value.id == "payload"
            }
    raise AssertionError(f"{function_name} not found in {BRIDGE_JOBS.name}")


@pytest.mark.parametrize(("handler", "payload_type"), sorted(HANDLER_PAYLOADS.items()))
def test_handler_only_reads_fields_its_payload_defines(handler, payload_type):
    used = _payload_attributes(handler)
    defined = set(payload_type.model_fields)
    missing = sorted(used - defined)
    assert not missing, (
        f"solidcraft/jobs.py::{handler} reads {missing} off "
        f"{payload_type.__name__}, which does not define them"
    )


@pytest.mark.parametrize("payload_type", BOOLEAN_PAYLOADS, ids=lambda t: t.__name__)
def test_boolean_handler_only_reads_fields_its_payload_defines(payload_type):
    used = _payload_attributes("run_boolean_operation")
    missing = sorted(used - set(payload_type.model_fields))
    assert not missing, (
        f"solidcraft/jobs.py::run_boolean_operation reads {missing} off "
        f"{payload_type.__name__}, which does not define them"
    )


@pytest.mark.parametrize(
    "payload_type",
    (schemas.RegeneratePayload, schemas.ExportStepPayload, *BOOLEAN_PAYLOADS),
    ids=lambda t: t.__name__,
)
def test_closure_payloads_carry_sketches_and_bodies(payload_type):
    """The bridge replays a timeline, so it needs the whole dependency closure.

    FreeCAD resolves its own document and ignores these, which is why they
    default to empty rather than being required.
    """
    fields = payload_type.model_fields
    for name in ("sketches", "bodies"):
        assert name in fields, f"{payload_type.__name__} is missing {name!r}"
        # Read the declared default rather than constructing the model: the
        # boolean payloads have required ids and cannot be built empty.
        default = fields[name].get_default(call_default_factory=True)
        assert default == {}, (
            f"{payload_type.__name__}.{name} must default to an empty dict so the "
            "FreeCAD path is unaffected"
        )
