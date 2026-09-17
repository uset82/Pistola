from __future__ import annotations

import sys
from pathlib import Path

import pytest

from freecad_runtime import (
    FreeCADRuntimeError,
    build_helper_health_payload,
    get_freecad_cmd_path,
    get_freecad_runtime_info,
)


def test_get_freecad_cmd_path_requires_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("FREECAD_PATH", raising=False)

    with pytest.raises(FreeCADRuntimeError):
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



def test_get_freecad_cmd_path_rejects_nonexistent_path(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FREECAD_PATH", "/nonexistent/path/FreeCADCmd.exe")

    with pytest.raises(FreeCADRuntimeError, match="does not point to an existing executable"):
        get_freecad_cmd_path()


def test_get_freecad_cmd_path_rejects_empty_string(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FREECAD_PATH", "   ")

    with pytest.raises(FreeCADRuntimeError, match="FREECAD_PATH is required"):
        get_freecad_cmd_path()


def test_build_helper_health_payload_includes_build_label(fake_freecad):
    get_freecad_runtime_info.cache_clear()
    payload = build_helper_health_payload("0.0.0.0", "8080")

    assert payload["status"] == "ready"
    assert payload["engine"] == "freecad"
    # The test shim includes a build label, so version should be "1.0.0 (test-shim)"
    assert "test-shim" in payload["version"]
    assert payload["helperUrl"] == "http://0.0.0.0:8080"


def test_health_payload_shape_matches_public_interface(fake_freecad):
    get_freecad_runtime_info.cache_clear()
    payload = build_helper_health_payload("127.0.0.1", "7878")

    required_keys = {"status", "runtime", "engine", "version", "helperUrl"}
    assert set(payload.keys()) == required_keys
    assert payload["engine"] != "freecad-stub"
    assert payload["engine"] != "mock"