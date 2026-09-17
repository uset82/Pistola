from __future__ import annotations

from pathlib import Path

from operations.boolean import run_boolean_operation
from operations.export_step import run_export_step
from operations.extrude import run_extrude
from operations.fillet_chamfer import run_chamfer, run_fillet
from operations.import_step import run_import_step
from operations.revolve import run_revolve
from operations.sketch_to_solid import run_regenerate, run_sketch_to_solid
from schemas import (
    BooleanCutPayload,
    ChamferPayload,
    ExportStepPayload,
    ExtrudePayload,
    FilletPayload,
    ImportStepPayload,
    RegeneratePayload,
    RevolvePayload,
    SketchToSolidPayload,
)


def _artifact_dir(tmp_path: Path) -> Path:
    artifact_dir = tmp_path / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return artifact_dir


def _sketch() -> dict[str, object]:
    return {
        "id": "sketch-1",
        "entities": [
            {
                "id": "rect-1",
                "kind": "rectangle",
                "center": [0.0, 0.0],
                "width": 2.0,
                "height": 1.0,
            }
        ],
    }


def _body() -> dict[str, object]:
    return {
        "id": "body-1",
        "name": "Body 1",
        "preview": {
            "primitive": "box",
            "dimensions": [2.0, 1.2, 1.0],
            "color": "#60a5fa",
        },
        "operations": [],
        "artifacts": {},
    }


def _assert_succeeded(result, expected_type: str):
    assert result.jobId
    assert result.type == expected_type
    assert result.status == "succeeded"
    assert result.result is not None
    assert result.result.artifacts.previewArtifactRef
    assert result.result.artifacts.cadArtifactRef


def test_sketch_to_solid_result_shape(tmp_path: Path, fake_freecad):
    result = run_sketch_to_solid(
        job_id="job-sketch",
        payload=SketchToSolidPayload(sketch=_sketch(), depth=1.2),
        artifact_dir=_artifact_dir(tmp_path),
    )
    _assert_succeeded(result, "sketch_to_solid")


def test_regenerate_result_shape(tmp_path: Path, fake_freecad):
    result = run_regenerate(
        job_id="job-regenerate",
        payload=RegeneratePayload(body=_body(), sketch=_sketch(), overrides={"depth": 1.2}),
        artifact_dir=_artifact_dir(tmp_path),
    )
    _assert_succeeded(result, "regenerate")


def test_extrude_result_shape(tmp_path: Path, fake_freecad):
    result = run_extrude(
        job_id="job-extrude",
        payload=ExtrudePayload(sketchId="sketch-1", distance=1.2, sketch=_sketch()),
        artifact_dir=_artifact_dir(tmp_path),
    )
    _assert_succeeded(result, "extrude")


def test_revolve_result_shape(tmp_path: Path, fake_freecad):
    result = run_revolve(
        job_id="job-revolve",
        payload=RevolvePayload(sketchId="sketch-1", axis="Z", angle=360.0, sketch=_sketch()),
        artifact_dir=_artifact_dir(tmp_path),
    )
    _assert_succeeded(result, "revolve")


def test_boolean_result_is_deferred(tmp_path: Path):
    result = run_boolean_operation(
        job_id="job-boolean",
        operation="cut",
        payload=BooleanCutPayload(
            bodyIdA="body-a",
            bodyIdB="body-b",
            targetBody=_body(),
            toolBody=_body(),
        ),
        artifact_dir=_artifact_dir(tmp_path),
    )

    assert result.status == "failed"
    assert "deferred" in (result.error or "")


def test_regenerate_uses_the_freecad_bridge_contract(tmp_path: Path, fake_freecad):
    body = _body()
    body["operationHistory"] = [
        {
            "id": "cad-op-1",
            "type": "boolean_cut",
            "kind": "boolean_cut",
            "suppressed": False,
            "operation": "cut",
            "toolBodyIds": ["body-b"],
            "params": {"toolBodyIds": ["body-b"]},
        }
    ]

    result = run_regenerate(
        job_id="job-regenerate-boolean-cut",
        payload=RegeneratePayload(body=body, sketch=_sketch(), overrides={}),
        artifact_dir=_artifact_dir(tmp_path),
    )

    assert result.status == "succeeded"
    assert result.result is not None


def test_fillet_result_is_deferred(tmp_path: Path):
    result = run_fillet(
        job_id="job-fillet",
        payload=FilletPayload(bodyId="body-1", edgeRefs=["edge-1"], radius=0.1, body=_body()),
        artifact_dir=_artifact_dir(tmp_path),
    )

    assert result.status == "failed"
    assert "deferred" in (result.error or "")


def test_chamfer_result_is_deferred(tmp_path: Path):
    result = run_chamfer(
        job_id="job-chamfer",
        payload=ChamferPayload(bodyId="body-1", edgeRefs=["edge-1"], distance=0.1, body=_body()),
        artifact_dir=_artifact_dir(tmp_path),
    )

    assert result.status == "failed"
    assert "deferred" in (result.error or "")


def test_import_result_shape(tmp_path: Path, fake_freecad):
    source_path = tmp_path / "fixture.step"
    source_path.write_text("ISO-10303-21;\nEND-ISO-10303-21;\n", encoding="utf-8")

    result = run_import_step(
        job_id="job-import",
        payload=ImportStepPayload(filePath=source_path.as_posix()),
        artifact_dir=_artifact_dir(tmp_path),
    )
    _assert_succeeded(result, "import_step")


def test_import_creates_cad_and_preview_artifacts(tmp_path: Path, fake_freecad):
    source_path = tmp_path / "fixture.step"
    source_path.write_text("ISO-10303-21;\nEND-ISO-10303-21;\n", encoding="utf-8")

    result = run_import_step(
        job_id="job-import-copy",
        payload=ImportStepPayload(filePath=source_path.as_posix()),
        artifact_dir=_artifact_dir(tmp_path),
    )

    assert result.result is not None
    assert result.result.artifacts.cadArtifactRef is not None
    assert result.result.artifacts.previewArtifactRef is not None
    assert Path(result.result.artifacts.cadArtifactRef).exists()
    assert Path(result.result.artifacts.previewArtifactRef).exists()


def test_export_result_shape(tmp_path: Path, fake_freecad):
    result = run_export_step(
        job_id="job-export",
        payload=ExportStepPayload(cadArtifactRef=(tmp_path / "body.FCStd").as_posix(), body=_body()),
        artifact_dir=_artifact_dir(tmp_path),
    )
    assert result.jobId
    assert result.type == "export_step"
    assert result.status == "succeeded"
    assert result.result is not None
    assert result.result.exportFile is not None


def test_export_returns_step_artifact(tmp_path: Path, fake_freecad):
    source_path = tmp_path / "body.FCStd"
    source_path.write_text("FCSTD", encoding="utf-8")
    artifact_dir = _artifact_dir(tmp_path)

    result = run_export_step(
        job_id="job-export-copy",
        payload=ExportStepPayload(cadArtifactRef=source_path.as_posix(), bodyName="Copied Body"),
        artifact_dir=artifact_dir,
    )

    assert result.result is not None
    assert result.result.artifacts.exportUrl is not None
    export_relative_path = result.result.artifacts.exportUrl.removeprefix("/v1/cad/artifacts/")
    export_path = artifact_dir / export_relative_path
    assert export_path.exists()
