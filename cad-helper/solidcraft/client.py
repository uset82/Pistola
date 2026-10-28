from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable

DEFAULT_CLI = r"C:\Program Files\SolidCraft\solidcraft-cli.exe"
DEFAULT_CONTROL_PORT = 27878
DEFAULT_TIMEOUT_SECONDS = 300
FILE_LOADING_COMMANDS = {"doc.open", "file.insert_step", "file.insert_mesh"}


class SolidCraftError(RuntimeError):
    """A SolidCraft invocation failed and no geometry should be reported as built."""


def _env_path(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def resolve_cli_path() -> str:
    configured = _env_path("SOLIDCRAFT_CLI_PATH")
    if configured:
        return configured

    tools_dir = Path(__file__).resolve().parents[2] / ".tools"
    # Any portable build under .tools/ counts, newest version name first, so an
    # upgrade does not silently fall back to the Program Files install.
    for candidate in sorted(tools_dir.glob("solidcraft-*/solidcraft-cli*"), reverse=True):
        if candidate.is_file():
            return candidate.as_posix()

    return DEFAULT_CLI


def control_token_path(port: int) -> Path:
    override = _env_path("SOLIDCRAFT_CONTROL_DIR")
    if override:
        return Path(override) / f"{port}.token"

    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "SolidCraft" / "control" / f"{port}.token"

    return Path.home() / ".local" / "share" / "solidcraft" / "control" / f"{port}.token"


def discover_control_port() -> int:
    configured = _env_path("SOLIDCRAFT_CONTROL_PORT")
    if configured:
        return int(configured)

    candidate = control_token_path(DEFAULT_CONTROL_PORT).parent / "current.port"
    try:
        return int(candidate.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return DEFAULT_CONTROL_PORT


def discover_control_token(port: int) -> str | None:
    configured = _env_path("SOLIDCRAFT_CONTROL_TOKEN")
    if configured:
        return configured

    path = control_token_path(port)
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return None


class HeadlessSolidCraftClient:
    """Runs SolidCraft in a fresh headless process for each request."""

    mode = "headless"

    def __init__(self, cli_path: str | None = None, timeout: int = DEFAULT_TIMEOUT_SECONDS):
        self.cli_path = cli_path or resolve_cli_path()
        self.timeout = timeout

    def _run(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        if not Path(self.cli_path).exists():
            raise SolidCraftError(
                f"SolidCraft CLI was not found at {self.cli_path!r}. "
                "Install SolidCraft or set SOLIDCRAFT_CLI_PATH."
            )

        try:
            result = subprocess.run(
                [self.cli_path, *args],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise SolidCraftError(
                f"SolidCraft did not finish within {self.timeout}s."
            ) from error
        except OSError as error:
            raise SolidCraftError(f"SolidCraft could not be started: {error}") from error

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise SolidCraftError(detail or f"SolidCraft exited with code {result.returncode}.")
        return result

    def version(self) -> str:
        result = self._run(["--version"])
        return result.stdout.strip().splitlines()[0] if result.stdout.strip() else "unknown"

    def commands(self, filter_text: str | None = None) -> list[dict[str, Any]]:
        result = self._run(["commands"])
        commands = json.loads(result.stdout)
        if filter_text:
            needle = filter_text.lower()
            commands = [
                command
                for command in commands
                if needle
                in " ".join(
                    str(command.get(key, ""))
                    for key in ("id", "label", "tab", "panel")
                ).lower()
            ]
        return commands

    def describe(self, command: str) -> Any:
        result = self._run(["exec", "engine.describe", json.dumps({"command": command})])
        return json.loads(result.stdout)

    def run_script(
        self,
        commands: Iterable[dict[str, Any]],
        *,
        outputs: Iterable[str] = (),
        input_path: str | None = None,
        save_path: str | None = None,
        allow_errors: bool = False,
    ) -> list[Any]:
        commands = list(commands)
        if not commands:
            return []

        with tempfile.TemporaryDirectory(prefix="pistola-solidcraft-") as temp_dir:
            temp = Path(temp_dir)
            script_path = temp / "script.json"
            result_path = temp / "result.json"
            script_path.write_text(
                json.dumps({"commands": commands}, ensure_ascii=False),
                encoding="utf-8",
            )

            args = ["run", script_path.as_posix(), "--results", "--json-out", result_path.as_posix()]
            if input_path:
                args.extend(["--in", input_path])
            for output in outputs:
                Path(output).parent.mkdir(parents=True, exist_ok=True)
                args.extend(["--out", output])
            if save_path:
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                args.extend(["--save", save_path])
            if allow_errors:
                args.append("--allow-errors")

            self._run(args)
            if not result_path.exists():
                return []
            return json.loads(result_path.read_text(encoding="utf-8"))

    def evaluate(
        self,
        commands: Iterable[dict[str, Any]],
        *,
        input_path: str | None = None,
    ) -> dict[str, Any]:
        commands = list(commands)
        with tempfile.TemporaryDirectory(prefix="pistola-solidcraft-") as temp_dir:
            temp = Path(temp_dir)
            result_path = temp / "measure.json"

            if commands:
                script_path = temp / "script.json"
                script_path.write_text(
                    json.dumps({"commands": commands}, ensure_ascii=False),
                    encoding="utf-8",
                )
                args = ["eval", script_path.as_posix(), "--json-out", result_path.as_posix()]
                if input_path:
                    args.extend(["--in", input_path])
            elif input_path:
                args = ["eval", "--in", input_path, "--json-out", result_path.as_posix()]
            else:
                return {}

            self._run(args)
            return json.loads(result_path.read_text(encoding="utf-8"))


class BridgedSolidCraftClient:
    """Drives an already-running SolidCraft app over its local control channel."""

    mode = "bridged"

    def __init__(self, port: int | None = None, token: str | None = None, timeout: int = DEFAULT_TIMEOUT_SECONDS):
        self.port = port or discover_control_port()
        self.token = token or discover_control_token(self.port)
        self.timeout = timeout
        if not self.token:
            raise SolidCraftError(
                f"No SolidCraft control token found for port {self.port}. "
                "Start SolidCraft with its control channel or set SOLIDCRAFT_CONTROL_TOKEN."
            )

    def _request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        request: dict[str, Any] = {"id": 1, "method": method, "params": params or {}}
        if self.token:
            request["token"] = self.token
        payload = json.dumps(request).encode("utf-8") + b"\n"

        try:
            with socket.create_connection(("127.0.0.1", self.port), timeout=10) as connection:
                connection.sendall(payload)
                response = b""
                while not response.endswith(b"\n"):
                    chunk = connection.recv(65536)
                    if not chunk:
                        break
                    response += chunk
        except OSError as error:
            raise SolidCraftError(
                f"No SolidCraft app is listening at 127.0.0.1:{self.port}: {error}"
            ) from error

        reply = json.loads(response.decode("utf-8"))
        if not reply.get("ok"):
            if reply.get("running"):
                raise SolidCraftError(
                    f"SolidCraft is still running the request: {reply.get('error')}. "
                    "Use the pending tool before sending another change."
                )
            raise SolidCraftError(reply.get("error") or "SolidCraft rejected the request.")
        # Later requests on the same connection may omit the token, but this
        # client opens a fresh connection per request, so keep sending it.
        return reply.get("result")

    def version(self) -> str:
        # Probe the control channel. An unreachable app raises SolidCraftError,
        # which health turns into status "error" rather than a fake version.
        self._request("engine.execute", {"command": "document.revision", "params": {}})
        return f"bridged (control port {self.port})"

    def commands(self, filter_text: str | None = None) -> list[dict[str, Any]]:
        commands = self._request("engine.commands") or []
        if filter_text:
            needle = filter_text.lower()
            commands = [
                command
                for command in commands
                if needle
                in " ".join(
                    str(command.get(key, ""))
                    for key in ("id", "label", "tab", "panel")
                ).lower()
            ]
        return commands

    def describe(self, command: str) -> Any:
        return self._request("engine.describe", {"command": command})

    def run_script(
        self,
        commands: Iterable[dict[str, Any]],
        *,
        outputs: Iterable[str] = (),
        input_path: str | None = None,
        save_path: str | None = None,
        allow_errors: bool = False,
    ) -> list[Any]:
        commands = list(commands)
        if not commands:
            return []

        if input_path:
            self._request("engine.execute", {"command": "doc.open", "params": {"path": input_path}})

        results: list[Any] = []
        if any(command.get("command") in FILE_LOADING_COMMANDS for command in commands):
            for command in commands:
                results.append(
                    self._request(
                        "engine.execute",
                        {"command": command.get("command"), "params": command.get("params") or {}},
                    )
                )
        else:
            batch = self._request(
                "engine.batch",
                {"commands": commands, "rollback": not allow_errors},
            )
            results = batch.get("results", []) if isinstance(batch, dict) else []

        for output in outputs:
            self._request(
                "engine.execute",
                {"command": "file.export", "params": {"path": output}},
            )
        if save_path:
            self._request(
                "engine.execute",
                {"command": "file.save", "params": {"path": save_path}},
            )
        return results

    def evaluate(
        self,
        commands: Iterable[dict[str, Any]],
        *,
        input_path: str | None = None,
    ) -> dict[str, Any]:
        self.run_script(commands, input_path=input_path)
        measurement = self._request("engine.execute", {"command": "inspect.measure", "params": {}})
        return measurement if isinstance(measurement, dict) else {}


def get_client(mode: str | None = None) -> HeadlessSolidCraftClient | BridgedSolidCraftClient:
    configured_mode = (mode or _env_path("SOLIDCRAFT_MODE", "headless")).lower()
    if configured_mode == "bridged":
        return BridgedSolidCraftClient()
    return HeadlessSolidCraftClient()


SolidCraftClientTypes = HeadlessSolidCraftClient | BridgedSolidCraftClient
