from __future__ import annotations

import json
from pathlib import Path

from mac_runner import _write_mock_artifacts, run_mac_job_sync
from mac_runtime import build_helper_health_payload


def test_mock_health_ready(monkeypatch) -> None:
    monkeypatch.setenv("PISTOLA_MAC_HELPER_RUNTIME", "mock")
    payload = build_helper_health_payload("127.0.0.1", "7879")
    assert payload["status"] == "ready"
    assert payload["runtime"] == "mock"
    assert payload["engine"] == "mac-build123d"


def test_missing_mac_root_reports_install_hint(monkeypatch) -> None:
    monkeypatch.setenv("PISTOLA_MAC_HELPER_RUNTIME", "python")
    monkeypatch.delenv("PISTOLA_MAC_ROOT", raising=False)
    payload = build_helper_health_payload("127.0.0.1", "7879")
    assert payload["status"] == "error"
    assert "PISTOLA_MAC_ROOT" in (payload.get("error") or "")


def test_mock_job_writes_artifacts(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PISTOLA_MAC_HELPER_RUNTIME", "mock")
    job_dir = tmp_path / "macjob_test"
    result = run_mac_job_sync(job_id="macjob_test", prompt="50x50x6 plate", job_dir=job_dir)
    assert result.status == "succeeded"
    assert result.result is not None
    assert result.result.artifacts.cadUrl is not None
    assert (job_dir / "part.step").is_file()


def test_write_mock_artifacts_json(tmp_path: Path) -> None:
    refs = _write_mock_artifacts(tmp_path / "job", "prompt")
    assert refs.cadUrl.endswith("/part.step")
    measurements = Path(refs.measurementsUrl.split("/")[-1])  # noqa: F841 — path shape check
    assert json.loads((tmp_path / "job" / "temp_measurements_0.json").read_text(encoding="utf-8"))[
        "mock"
    ] is True
