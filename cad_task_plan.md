# FreeCAD-Inspired CAD Tools Integration Plan

The Pascal editor engine already defines 19 powerful backend CAD operations (Sketching, Constraints, 3D Solids, Modifiers, and Inspection). However, the current UI only shows 4 generic aggregate buttons ([Sketch](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/components/editor/AiAssistantPanel.tsx#236-249), `Solid`, `Modify`, `Inspect`).

This task plan outlines the steps required to expose these tools directly in the bottom action bar when the CAD phase is active, imitating the direct-access philosophy of FreeCAD workbenches.

## 📋 Task Checklist

Please review this plan. Once approved, we will execute it step-by-step.

- [x] **1. Extend CAD Tool Icons**
  - [x] Add new `lucide-react` icons (or custom SVGs) for all 19 supported tools (e.g., `cad-line`, `cad-rectangle`, `cad-extrude`, `cad-fillet`, `cad-boolean`, etc.).
  
- [x] **2. Redesign [CadTools](file:///c:/Users/carlos/PROYECTOS/pistola/editor/packages/editor/src/components/ui/action-menu/cad-tools.tsx#96-160) UI Component ([cad-tools.tsx](file:///c:/Users/carlos/PROYECTOS/pistola/editor/packages/editor/src/components/ui/action-menu/cad-tools.tsx))**
  - [x] Group the tools logically by CAD Mode (Sketch, Solid, Modify, Inspect) mimicking FreeCAD workbenches.
  - [x] Add visual vertical dividers (`<div className="w-px h-5 bg-border mx-1" />`) between functional groups.
  - [x] Map each `cadTool` ID to its respective `ActionButton` in the secondary horizontal menu.
  - [x] *Optional:* Implement a 2-tier toolbar or "flyout" sub-menus if the action bar becomes too wide (e.g., clicking "Sketch" reveals the Line, Rect, Circle tools). Given the current bottom bar design, horizontal tool grouping might be the cleanest native approach.

- [x] **3. Wire State & Shortcuts ([cad-tools.tsx](file:///c:/Users/carlos/PROYECTOS/pistola/editor/packages/editor/src/components/ui/action-menu/cad-tools.tsx))**
  - [x] Update tool selection logic so clicking a specific tool (e.g. `cad-rectangle`) updates both [setTool()](file:///c:/Users/carlos/PROYECTOS/pistola/editor/packages/editor/src/store/use-editor.tsx#282-323) and [setCadMode()](file:///c:/Users/carlos/PROYECTOS/pistola/editor/packages/editor/src/store/use-editor.tsx#132-133) correctly via `useEditor`.
  - [x] Ensure `requiresBuildMode` logic remains intact so that selecting a generative CAD tool automatically switches the Editor mode to [build](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.ts#297-307).
  - [x] Assign keyboard shortcuts to primary tools (S=Sketch, L=Line, T=Rectangle, O=Circle, E=Extrude, R=Revolve).

- [x] **4. AI Assistant Context Sync ([assistant-ai-provider.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.ts))**
  - [x] Verify that telling the AI "open the fillet tool" maps accurately to the new decomposed UI states, updating the schema if necessary.

- [x] **5. Verification**
  - [x] Launch the editor and select the **CAD** phase.
  - [x] Visually verify that the new rich set of CAD feature tools replaces the 4 aggregate buttons on the bottom action bar.
  - [x] Test toggling different tool modes and verifying UI responsiveness.

---
*Note: If you approve of this plan, let me know, and we'll start executing task 1!*
