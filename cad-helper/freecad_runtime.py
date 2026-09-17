from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


class FreeCADRuntimeError(RuntimeError):
    pass


@dataclass(frozen=True)
class FreeCADRuntimeInfo:
    path: Path
    engine: str
    version: str
    build: str | None = None


def _trimmed_env(name: str, env: dict[str, str] | None = None) -> str | None:
    value = (env or os.environ).get(name, "").strip()
    return value or None


def get_freecad_cmd_path(env: dict[str, str] | None = None) -> Path:
    raw_path = _trimmed_env("FREECAD_PATH", env)
    if not raw_path:
        raise FreeCADRuntimeError(
            "FREECAD_PATH is required and must point to FreeCADCmd.exe."
        )

    resolved_path = Path(raw_path).expanduser().resolve()
    if not resolved_path.exists() or not resolved_path.is_file():
        raise FreeCADRuntimeError(
            f"FREECAD_PATH does not point to an existing executable: {resolved_path}"
        )

    return resolved_path


def get_freecad_bridge_script_path(env: dict[str, str] | None = None) -> Path:
    override = _trimmed_env("PISTOLA_FREECAD_BRIDGE_SCRIPT", env)
    return (
        Path(override).expanduser().resolve()
        if override
        else Path(__file__).resolve().with_name("freecad_worker.py")
    )


def get_freecad_inspect_script_path(env: dict[str, str] | None = None) -> Path:
    override = _trimmed_env("PISTOLA_FREECAD_INSPECT_SCRIPT", env)
    return (
        Path(override).expanduser().resolve()
        if override
        else Path(__file__).resolve().with_name("freecad_inspect.py")
    )


def _subprocess_timeout_seconds(env: dict[str, str] | None = None) -> int:
    raw_timeout = _trimmed_env("PISTOLA_FREECAD_TIMEOUT_SECONDS", env)
    if raw_timeout is None:
        return 120

    try:
        timeout = int(raw_timeout)
    except ValueError as error:
        raise FreeCADRuntimeError(
            f"PISTOLA_FREECAD_TIMEOUT_SECONDS must be an integer, received {raw_timeout!r}."
        ) from error

    return max(timeout, 30)


def _run_freecad_script(
    *,
    script_path: Path,
    output_path: Path,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    runtime_env = os.environ.copy()
    if env:
        runtime_env.update(env)

    freecad_cmd_path = get_freecad_cmd_path(runtime_env)
    if not script_path.exists():
        raise FreeCADRuntimeError(f"FreeCAD bridge script was not found: {script_path}")

    process = subprocess.run(
        [str(freecad_cmd_path), str(script_path), *(args or []), str(output_path)],
        capture_output=True,
        text=True,
        timeout=_subprocess_timeout_seconds(runtime_env),
        env=runtime_env,
        check=False,
    )

    if process.returncode != 0:
        stderr = (process.stderr or process.stdout or "").strip()
        message = stderr or f"FreeCADCmd exited with code {process.returncode}."
        raise FreeCADRuntimeError(message)

    if not output_path.exists():
        raise FreeCADRuntimeError(
            f"FreeCAD bridge script did not create its output file: {output_path}"
        )

    try:
        return json.loads(output_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise FreeCADRuntimeError(
            f"FreeCAD bridge script returned malformed JSON in {output_path.name}."
        ) from error


@lru_cache(maxsize=1)
def get_freecad_runtime_info() -> FreeCADRuntimeInfo:
    inspect_script_path = get_freecad_inspect_script_path()

    with tempfile.TemporaryDirectory(prefix="pistola-freecad-inspect-") as temp_dir:
        output_path = Path(temp_dir) / "inspect.json"
        payload = _run_freecad_script(
            script_path=inspect_script_path,
            output_path=output_path,
        )

    engine = str(payload.get("engine") or "").strip().lower()
    version = str(payload.get("version") or "").strip()
    build = str(payload.get("build") or "").strip() or None

    if engine != "freecad":
        raise FreeCADRuntimeError(
            f"FREECAD_PATH did not report a FreeCAD engine. Received {engine or 'unknown'}."
        )
    if not version:
        raise FreeCADRuntimeError("FreeCAD runtime metadata did not include a version.")

    return FreeCADRuntimeInfo(
        path=get_freecad_cmd_path(),
        engine="freecad",
        version=version,
        build=build,
    )


def build_helper_health_payload(host: str, port: str) -> dict[str, str]:
    runtime = get_freecad_runtime_info()
    version = runtime.version
    if runtime.build:
        version = f"{runtime.version} ({runtime.build})"

    return {
        "status": "ready",
        "runtime": "python",
        "engine": runtime.engine,
        "version": version,
        "helperUrl": f"http://{host}:{port}",
    }
