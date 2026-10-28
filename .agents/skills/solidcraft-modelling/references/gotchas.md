# SolidCraft traps (0.25.1)

- **Batch file-loading steps**: `doc.open`, `file.insert_step`, and `file.insert_mesh` are refused inside `batch`. Send them one at a time.
- **Unknown ids fail a batch up front**: any unknown command id rejects the whole batch before the first step runs.
- **Long bridged calls**: a request can run for about 300 s before returning `still running:`; call `pending`, never resend blindly.
- **Edges are points**: `solid.fillet` takes `edges: [[x,y,z], ...]` or `[{body, index}]`. A corner where three edges meet is rejected; use a midpoint from `body_topology`.
- **No glTF export**: 0.25.1 imports glTF but `file.export` formats are STL, STLA, OBJ, STEP, 3MF, 3MF-tagged, URDF, and JSON. Use STEP for the editor round-trip and STL as the mesh fallback.
- **Headless screenshots** may use the CPU rasterizer when no GPU adapter exists; the reply's `renderer` says `cpu` and includes a warning.
- **Path sandbox**: file tools only reach the open design's folder (with restrictions), SolidCraft's recovery folder, the server scratch folder, and each `--allow-path` folder. The portable CLI's working directory alone does not count.
- **Units**: command coordinates are millimetres. Do not pass metres directly from Pistola scene data.
- **`doc.change_units` does not exist** in 0.25.1; use `document.units`.
- **Batch rollback** restores an engine checkpoint. If a step is still running, rollback can report `rolled_back: false`; inspect before retrying.
