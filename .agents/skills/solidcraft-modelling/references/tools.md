# SolidCraft MCP tools (0.25.1)

| Tool | Arguments | Use |
|---|---|---|
| `list_commands` | `filter?` | Search the 493-command catalog by id, label, tab, or panel |
| `describe_command` | `id` | Read parameters and JSON Schemas for one command |
| `execute` | `command`, `params?`, `verbose?` | Run one command |
| `batch` | `commands[]`, `rollback?`, `verbose?`, `timings?`, `profile?` | Run steps atomically; stop and roll back on failure |
| `inspect_design` | `measure?`, `sketches?`, `joints?` | Design, timeline, bodies, sketches, joints |
| `measure` | `body?` or `items?` | Volume, area, bbox, mass, distance, angle |
| `body_topology` | `body` | Edges and faces with picking data |
| `set_parameter` | `name`, `value` or `expression` | Create or change a parameter and rebuild |
| `screenshot` | `view?`, `camera?`, `path?`, `width?`, `height?` | PNG render |
| `export` | `path`, `format?`, `bodies?` | STEP, 3MF, STL, OBJ, URDF |
| `undo` / `redo` | — | One undoable change |
| `pending` | — | Retrieve a bridged request that was still running |
| `crash_reports` | `id?`, `limit?` | Inspect local crash reports |
| `skill_reference` | `skill`, `file?` | Read SolidCraft's bundled skills |
| `running` | — | Requests currently running or queued |
| `new_design` | `name?` | Start an empty design |
| `open` | `path` | Open `.sc`, STEP, 3MF, or STL |
| `save` | `path?` | Save the design |

The same discovery commands are available as engine commands: `engine.commands` and `engine.describe`.

## Useful command families

- Sketch: `sketch.create`, `sketch.line`, `sketch.rectangle.two_point`, `sketch.circle.center`, `sketch.arc.three_point`, `sketch.finish`
- Solid: `solid.extrude`, `solid.revolve`, `solid.combine`, `solid.fillet`, `solid.chamfer`, `solid.shell`, `solid.hole`
- Inspect: `inspect.measure`, `model.edges`, `model.faces`, `document.inspect`, `document.units`
- File: `file.export`, `file.insert_step`, `file.insert_mesh`, `file.save`
