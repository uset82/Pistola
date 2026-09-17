from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from freecad_runtime import (
    FreeCADRuntimeError,
    get_freecad_bridge_script_path,
    get_freecad_cmd_path,
)
from freecad_runtime import _run_freecad_script as run_freecad_script
from schemas import JobResult


def run_freecad_job(
    *,
    job_id: str,
    job_type: str,
    payload: dict[str, Any],
    artifact_dir: Path,
) -> JobResult:
    artifact_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"{job_id}-") as temp_dir:
        output_path = Path(temp_dir) / "result.json"
        result_payload = run_freecad_script(
            script_path=get_freecad_bridge_script_path(),
            output_path=output_path,
            args=[
                job_id,
                job_type,
                str(artifact_dir.resolve()),
                payload_to_file(payload, Path(temp_dir) / "payload.json"),
            ],
        )

    return JobResult.model_validate(result_payload)


def payload_to_file(payload: dict[str, Any], payload_path: Path) -> str:
    payload_path.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )
    return str(payload_path)


__all__ = ["FreeCADRuntimeError", "get_freecad_cmd_path", "run_freecad_job"]
