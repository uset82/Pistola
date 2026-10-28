# SolidCraft bridge

An opt-in second geometry engine behind the same `/v1/cad` contract. **FreeCAD
is the default** and is unaffected by anything here; select this one with
`PISTOLA_CAD_ENGINE=solidcraft`.

It answers the same eleven canonical job types as FreeCAD and adds four
passthrough types that reach SolidCraft's ~493-command catalog directly. Those
four are refused with a 400 while FreeCAD is active, because FreeCAD has no
addressable command catalog.

- `client.py` — headless `solidcraft-cli` process or bridged TCP control channel.
- `mapping.py` — Pistola metres to SolidCraft millimetres, sketch/entity/operation translation, edge-reference resolution.
- `jobs.py` — canonical job handlers plus `command`, `batch`, `list_commands`, and `describe_command` passthrough.
- `catalog.json` — the live command registry dumped from `solidcraft-cli commands` 0.25.1.

## Configuration

```bash
PISTOLA_CAD_ENGINE=solidcraft     # required; default is freecad
SOLIDCRAFT_MODE=headless          # headless | bridged
# Optional. Unset auto-resolves .tools/solidcraft-*/ then %ProgramFiles%.
SOLIDCRAFT_CLI_PATH=C:/Program Files/SolidCraft/solidcraft-cli.exe
SOLIDCRAFT_CONTROL_PORT=27878
SOLIDCRAFT_UNITS=mm
```

See `cad-helper/.env.example` for the full set, and `engine.py` for the
selector.

Headless writes a JSON script, runs `solidcraft-cli run`, and returns the STEP file. Bridged sends `engine.batch` to a running SolidCraft app using the launch token from `SOLIDCRAFT_CONTROL_TOKEN` or `%LOCALAPPDATA%\SolidCraft\control\<port>.token`.

A missing binary makes `/health` return `status: "error"`; the editor never treats a missing engine as ready and never writes placeholder geometry.

## Regenerate `catalog.json`

```bash
solidcraft-cli commands > cad-helper/solidcraft/catalog.json
```
