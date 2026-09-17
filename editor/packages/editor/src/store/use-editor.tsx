'use client'

import type { AssetInput } from '@pascal-app/core'
import {
  type BuildingNode,
  type DoorNode,
  type ItemNode,
  type LevelNode,
  type Space,
  useScene,
  type WindowNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { create } from 'zustand'
import type {
  ReferenceTransformTarget,
  TransformMode,
  TransformPivot,
  TransformTarget,
} from '../lib/transform-target'

export type Phase = 'site' | 'structure' | 'furnish' | 'cad'

export type Mode = 'select' | 'edit' | 'delete' | 'build'

// Structure mode tools (building elements)
export type StructureTool =
  | 'wall'
  | 'room'
  | 'custom-room'
  | 'slab'
  | 'ceiling'
  | 'roof'
  | 'column'
  | 'stair'
  | 'item'
  | 'zone'
  | 'window'
  | 'door'

// Furnish mode tools (items and decoration)
export type FurnishTool = 'item'

export type CadTool =
  | 'cad-sketch'
  | 'cad-line'
  | 'cad-rectangle'
  | 'cad-circle'
  | 'cad-arc'
  | 'cad-polyline'
  | 'cad-coincident'
  | 'cad-horizontal-vertical'
  | 'cad-parallel-perpendicular'
  | 'cad-tangent'
  | 'cad-equal'
  | 'cad-dimension'
  | 'cad-import-step'
  | 'cad-extrude'
  | 'cad-revolve'
  | 'cad-boolean'
  | 'cad-fillet'
  | 'cad-chamfer'
  | 'cad-inspect'
export type CadMode = 'sketch' | 'solid' | 'modify' | 'inspect'
export type CadWorkplane = 'XY' | 'XZ' | 'YZ' | 'level' | 'face'
export type CadBooleanMode = 'union' | 'cut' | 'intersect'

// Site mode tools
export type SiteTool = 'property-line'

// Catalog categories for furnish mode items
export type CatalogCategory =
  | 'furniture'
  | 'appliance'
  | 'bathroom'
  | 'kitchen'
  | 'outdoor'
  | 'window'
  | 'door'

export type StructureLayer = 'zones' | 'elements'

// Combined tool type
export type Tool = SiteTool | StructureTool | FurnishTool | CadTool

const getDefaultVisibleCadTool = (cadMode: CadMode): CadTool =>
  cadMode === 'solid' ? 'cad-extrude' : 'cad-sketch'

type EditorState = {
  phase: Phase
  setPhase: (phase: Phase) => void
  cadMode: CadMode
  setCadMode: (mode: CadMode) => void
  cadBooleanMode: CadBooleanMode
  setCadBooleanMode: (mode: CadBooleanMode) => void
  activeWorkplane: CadWorkplane
  setActiveWorkplane: (workplane: CadWorkplane) => void
  activeSketchId: string | null
  setActiveSketchId: (id: string | null) => void
  mode: Mode
  setMode: (mode: Mode) => void
  tool: Tool | null
  setTool: (tool: Tool | null) => void
  structureLayer: StructureLayer
  setStructureLayer: (layer: StructureLayer) => void
  catalogCategory: CatalogCategory | null
  setCatalogCategory: (category: CatalogCategory | null) => void
  selectedItem: AssetInput | null
  setSelectedItem: (item: AssetInput) => void
  movingNode: ItemNode | WindowNode | DoorNode | null
  setMovingNode: (node: ItemNode | WindowNode | DoorNode | null) => void
  selectedReferenceId: string | null
  setSelectedReferenceId: (id: string | null) => void
  transformMode: TransformMode
  setTransformMode: (mode: TransformMode) => void
  transformTarget: TransformTarget | null
  setTransformTarget: (target: TransformTarget | null) => void
  transformPivot: TransformPivot
  setTransformPivot: (pivot: TransformPivot) => void
  clearTransformSession: () => void
  // Space detection for cutaway mode
  spaces: Record<string, Space>
  setSpaces: (spaces: Record<string, Space>) => void
  // Generic hole editing (works for slabs, ceilings, and any future polygon nodes)
  editingHole: { nodeId: string; holeIndex: number } | null
  setEditingHole: (hole: { nodeId: string; holeIndex: number } | null) => void
  // Preview mode (viewer-like experience inside the editor)
  isPreviewMode: boolean
  setPreviewMode: (preview: boolean) => void
}

const useEditor = create<EditorState>()((set, get) => ({
  phase: 'site',
  cadMode: 'sketch',
  setCadMode: (cadMode) => set({ cadMode }),
  cadBooleanMode: 'union',
  setCadBooleanMode: (cadBooleanMode) => set({ cadBooleanMode }),
  activeWorkplane: 'XY',
  setActiveWorkplane: (activeWorkplane) => set({ activeWorkplane }),
  activeSketchId: null,
  setActiveSketchId: (activeSketchId) => set({ activeSketchId }),
  setPhase: (phase) => {
    const currentPhase = get().phase
    if (currentPhase === phase) return

    set({
      phase,
      selectedReferenceId: null,
      transformMode: 'move',
      transformTarget: null,
    })

    const { cadMode, mode, structureLayer } = get()

    if (mode === 'build') {
      // Stay in build mode, select the first tool for the new phase
      if (phase === 'site') {
        set({ tool: 'property-line', catalogCategory: null })
      } else if (phase === 'structure' && structureLayer === 'zones') {
        set({ tool: 'zone', catalogCategory: null })
      } else if (phase === 'structure') {
        set({ tool: 'wall', catalogCategory: null })
      } else if (phase === 'furnish') {
        set({ tool: 'item', catalogCategory: 'furniture' })
      } else if (phase === 'cad') {
        set({ tool: getDefaultVisibleCadTool(cadMode), catalogCategory: null })
      }
    } else {
      // Reset to select mode and clear tool/catalog when switching phases
      set({ mode: 'select', tool: null, catalogCategory: null })
    }

    const viewer = useViewer.getState()
    const scene = useScene.getState()

    // Helper to find building and level 0
    const selectBuildingAndLevel0 = () => {
      let buildingId = viewer.selection.buildingId

      // If no building selected, find the first one from site's children
      if (!buildingId) {
        const siteNode = scene.rootNodeIds[0] ? scene.nodes[scene.rootNodeIds[0]] : null
        if (siteNode?.type === 'site') {
          const firstBuilding = siteNode.children
            .map((child) => (typeof child === 'string' ? scene.nodes[child] : child))
            .find((node) => node?.type === 'building')
          if (firstBuilding) {
            buildingId = firstBuilding.id as BuildingNode['id']
            viewer.setSelection({ buildingId })
          }
        }
      }

      // If no level selected, find level 0 in the building
      if (buildingId && !viewer.selection.levelId) {
        const buildingNode = scene.nodes[buildingId] as BuildingNode
        const level0Id = buildingNode.children.find((childId) => {
          const levelNode = scene.nodes[childId] as LevelNode
          return levelNode?.type === 'level' && levelNode.level === 0
        })
        if (level0Id) {
          viewer.setSelection({ levelId: level0Id as LevelNode['id'] })
        } else if (buildingNode.children[0]) {
          // Fallback to first level if level 0 doesn't exist
          viewer.setSelection({ levelId: buildingNode.children[0] as LevelNode['id'] })
        }
      }
    }

    switch (phase) {
      case 'site':
        // In Site mode, we zoom out and deselect specific levels/buildings
        viewer.resetSelection()
        break

      case 'structure':
        selectBuildingAndLevel0()
        break

      case 'furnish':
        selectBuildingAndLevel0()
        // Furnish mode only supports elements layer, not zones
        set({ structureLayer: 'elements' })
        break
      case 'cad':
        selectBuildingAndLevel0()
        break
    }
  },
  mode: 'select',
  setMode: (mode) => {
    const nextState: Partial<EditorState> = { mode }
    if (mode !== 'select') {
      nextState.selectedReferenceId = null
      nextState.transformMode = 'move'
      nextState.transformTarget = null
    }
    set(nextState)

    const { cadMode, phase, structureLayer, tool } = get()

    if (mode === 'build') {
      // Clear selection when entering build mode
      const viewer = useViewer.getState()
      viewer.setSelection({
        selectedIds: [],
        zoneId: null,
      })

      // Ensure a tool is selected in build mode
      if (!tool) {
        if (phase === 'structure' && structureLayer === 'zones') {
          set({ tool: 'zone' })
        } else if (phase === 'structure' && structureLayer === 'elements') {
          set({ tool: 'wall' })
        } else if (phase === 'furnish') {
          set({ tool: 'item', catalogCategory: 'furniture' })
        } else if (phase === 'cad') {
          set({ tool: getDefaultVisibleCadTool(cadMode), catalogCategory: null })
        }
      }
    }
    // When leaving build mode, clear tool
    else if (tool) {
      set({ tool: null })
    }
  },
  tool: null,
  setTool: (tool) => {
    if (
      tool === 'cad-sketch' ||
      tool === 'cad-line' ||
      tool === 'cad-rectangle' ||
      tool === 'cad-circle' ||
      tool === 'cad-arc' ||
      tool === 'cad-polyline' ||
      tool === 'cad-coincident' ||
      tool === 'cad-horizontal-vertical' ||
      tool === 'cad-parallel-perpendicular' ||
      tool === 'cad-tangent' ||
      tool === 'cad-equal' ||
      tool === 'cad-dimension'
    ) {
      set({ tool, cadMode: 'sketch' })
      return
    }

    if (tool === 'cad-import-step' || tool === 'cad-extrude') {
      set({ tool, cadMode: 'solid' })
      return
    }

    if (tool === 'cad-revolve') {
      set({ tool, cadMode: 'solid' })
      return
    }

    if (tool === 'cad-boolean' || tool === 'cad-fillet' || tool === 'cad-chamfer') {
      set({ tool, cadMode: 'modify' })
      return
    }

    if (tool === 'cad-inspect') {
      set({ tool, cadMode: 'inspect' })
      return
    }

    set({ tool })
  },
  structureLayer: 'elements',
  setStructureLayer: (layer) => {
    const { mode } = get()

    if (mode === 'build') {
      const tool = layer === 'zones' ? 'zone' : 'wall'
      set({ structureLayer: layer, tool })
    } else {
      set({ structureLayer: layer, mode: 'select', tool: null })
    }

    const viewer = useViewer.getState()
    viewer.setSelection({
      selectedIds: [],
      zoneId: null,
    })
  },
  catalogCategory: null,
  setCatalogCategory: (category) => set({ catalogCategory: category }),
  selectedItem: null,
  setSelectedItem: (item) => set({ selectedItem: item }),
  movingNode: null as ItemNode | WindowNode | DoorNode | null,
  setMovingNode: (node) =>
    set({
      movingNode: node,
      ...(node ? { transformMode: 'move', transformTarget: null } : {}),
    }),
  selectedReferenceId: null,
  setSelectedReferenceId: (id) => {
    if (id) {
      useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
      set({
        selectedReferenceId: id,
        transformTarget: {
          kind: 'reference',
          nodeId: id as ReferenceTransformTarget['nodeId'],
        },
      })
      return
    }

    const currentTarget = get().transformTarget
    set({
      selectedReferenceId: null,
      transformTarget: currentTarget?.kind === 'reference' ? null : currentTarget,
    })
  },
  transformMode: 'move',
  setTransformMode: (transformMode) => set({ transformMode }),
  transformTarget: null,
  setTransformTarget: (transformTarget) => set({ transformTarget }),
  transformPivot: 'bounds-center',
  setTransformPivot: (transformPivot) => set({ transformPivot }),
  clearTransformSession: () => set({ transformMode: 'move', transformTarget: null }),
  spaces: {},
  setSpaces: (spaces) => set({ spaces }),
  editingHole: null,
  setEditingHole: (hole) => set({ editingHole: hole }),
  isPreviewMode: false,
  setPreviewMode: (preview) => {
    if (preview) {
      set({
        isPreviewMode: true,
        mode: 'select',
        tool: null,
        catalogCategory: null,
        selectedReferenceId: null,
        transformMode: 'move',
        transformTarget: null,
      })
      // Clear zone/item selection for clean viewer drill-down hierarchy
      useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
    } else {
      set({ isPreviewMode: false })
    }
  },
}))

export default useEditor
