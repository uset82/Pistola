from __future__ import annotations

import sys
from pathlib import Path

import pytest

import freecad_runtime
from freecad_runtime import (
    FreeCADRuntimeError,
    build_helper_health_payload,
    get_default_freecad_cmd_candidates,
    get_default_freecad_cmd_path,
    get_freecad_cmd_path,
    get_freecad_runtime_info,
)


def test_get_freecad_cmd_path_requires_env_or_default_build(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("FREECAD_PATH", raising=False)

    with pytest.raises(FreeCADRuntimeError, match="no integrated FreeCAD executable was found"):
        get_freecad_cmd_path()


def test_build_helper_health_payload_reports_real_freecad_metadata(
    fake_freecad,
):
    get_freecad_runtime_info.cache_clear()
    payload = build_helper_health_payload("127.0.0.1", "7878")

    assert payload["status"] == "ready"
    assert payload["runtime"] == "python"
    assert payload["engine"] == "freecad"
    assert payload["version"] == "1.0.0 (test-shim)"
    assert payload["helperUrl"] == "http://127.0.0.1:7878"


def test_get_freecad_cmd_path_accepts_existing_executable(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("FREECAD_PATH", sys.executable)
    assert get_freecad_cmd_path() == Path(sys.executable).resolve()


def test_get_freecad_cmd_path_defaults_to_the_integrated_submodule_build(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    monkeypatch.delenv("FREECAD_PATH", raising=False)
    default_path = tmp_path / "third_party" / "FreeCAD" / "build" / "release" / "bin" / "FreeCADCmd.exe"
    default_path.parent.mkdir(parents=True, exist_ok=True)
    default_path.write_text("fake-freecad", encoding="utf-8")

    monkeypatch.setattr(
        freecad_runtime,
        "get_default_freecad_cmd_candidates",
        lambda: (default_path,),
    )

    assert get_default_freecad_cmd_path() != default_path
    assert get_freecad_cmd_path() == default_path.resolve()


def test_get_default_freecad_cmd_candidates_include_release_debug_and_pixi_outputs():
    candidates = get_default_freecad_cmd_candidates()
    candidate_paths = {str(candidate).replace("\\", "/") for candidate in candidates}

    assert any(path.endswith("/third_party/FreeCAD/build/release/bin/FreeCADCmd.exe") for path in candidate_paths)
    assert any(path.endswith("/third_party/FreeCAD/build/debug/bin/FreeCADCmd.exe") for path in candidate_paths)
    assert any(
        path.endswith("/third_party/FreeCAD/.pixi/envs/default/Library/bin/FreeCADCmd.exe")
        for path in candidate_paths
    )
