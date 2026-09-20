'use client'

import { useScene } from '@pascal-app/core'
import {
  executeAssistantPlan,
  useCommandPalette,
  useEditor,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useRef, useState } from 'react'
import { fileLooksLikeGltf } from '../../lib/import-glb'
import { importGlbFileAsItem } from '../../lib/import-glb-item'
import {
  captureCanvasScreenshot,
  copyShareLink,
  downloadProjectFile,
  exportProjectFormat,
  loadProjectFromJson,
  saveProjectToStorage,
  useProjectStore,
} from '../../lib/project-actions'

type MenuId =
  | 'file'
  | 'edit'
  | 'selection'
  | 'view'
  | 'go'
  | 'run'
  | 'terminal'
  | 'help'
  | 'export-quick'
  | null

interface MenuItem {
  id?: string
  label: string
  shortcut?: string
  icon?: string
  disabled?: boolean
  separator?: boolean
  danger?: boolean
  action?: () => void | Promise<void>
}

export function WorkspaceMenuBar() {
  const [activeMenu, setActiveMenu] = useState<MenuId>(null)
  const [saveStatusText, setSaveStatusText] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const projectName = useProjectStore((s) => s.projectName)
  const isDirty = useProjectStore((s) => s.isDirty)
  const setActiveModal = useProjectStore((s) => s.setActiveModal)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const hasCadBodySelected = selectedIds.some(
    (id) => (useScene.getState().nodes as Record<string, any>)[id]?.type === 'cad-body',
  )

  // Handle outside clicks to close menus
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setActiveMenu(null)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const triggerSave = () => {
    const success = saveProjectToStorage()
    if (success) {
      setSaveStatusText('Saved!')
      setTimeout(() => setSaveStatusText(null), 2500)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    void (async () => {
      if (await fileLooksLikeGltf(file)) {
        const result = await importGlbFileAsItem(file)
        if (result.success) {
          setSaveStatusText('Model imported')
          setTimeout(() => setSaveStatusText(null), 2500)
        } else {
          alert(result.error)
        }
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result
        if (typeof content === 'string') {
          const res = loadProjectFromJson(content)
          if (res.success) {
            setSaveStatusText('Project Loaded!')
            setTimeout(() => setSaveStatusText(null), 2500)
          } else {
            alert(res.error || 'Failed to open project file.')
          }
        }
      }
      reader.readAsText(file)
    })()
  }

  const handleExport = async (format: 'glb' | 'step' | 'ifc' | 'json' | 'screenshot') => {
    setIsExporting(true)
    setActiveMenu(null)
    try {
      await exportProjectFormat(format)
    } finally {
      setIsExporting(false)
    }
  }

  const handleShare = async () => {
    const success = await copyShareLink()
    if (success) {
      setShareSuccess(true)
      setTimeout(() => setShareSuccess(false), 2500)
    }
    setActiveModal('share')
  }

  // Global CAD & Editor Keyboard Shortcuts (Ctrl+S, Ctrl+O, Ctrl+N, etc.)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement | null)?.isContentEditable

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const modifier = isMac ? e.metaKey : e.ctrlKey

      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (e.shiftKey) {
          captureCanvasScreenshot(`${projectName.toLowerCase().replace(/\s+/g, '_')}_capture.png`)
        } else {
          triggerSave()
        }
        return
      }

      if (modifier && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        fileInputRef.current?.click()
        return
      }

      if (modifier && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setActiveModal('new-project')
        return
      }

      if (e.key === 'Escape' && activeMenu) {
        setActiveMenu(null)
        return
      }

      if (e.key === '?' && !isInput && !modifier) {
        e.preventDefault()
        setActiveModal('shortcuts')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeMenu, projectName, setActiveModal])

  // Listen to cross-component commands from Command Palette or Assistant
  useEffect(() => {
    function handleModalEvent(e: Event) {
      const modal = (e as CustomEvent).detail
      if (modal) setActiveModal(modal)
    }
    function handleActionEvent(e: Event) {
      const action = (e as CustomEvent).detail
      if (action === 'save') triggerSave()
      if (action === 'export-json') void handleExport('json')
      if (action === 'screenshot') void handleExport('screenshot')
      if (action === 'share') void handleShare()
    }
    window.addEventListener('pistola:modal', handleModalEvent)
    window.addEventListener('pistola:action', handleActionEvent)
    return () => {
      window.removeEventListener('pistola:modal', handleModalEvent)
      window.removeEventListener('pistola:action', handleActionEvent)
    }
  }, [setActiveModal])

  // Define Menu Configurations
  const menus: Record<Exclude<MenuId, 'export-quick' | null>, MenuItem[]> = {
    file: [
      {
        label: 'New Project...',
        shortcut: 'Ctrl+N',
        action: () => setActiveModal('new-project'),
      },
      {
        label: 'Open...',
        shortcut: 'Ctrl+O',
        action: () => fileInputRef.current?.click(),
      },
      { separator: true, label: '' },
      {
        label: 'Save Project',
        shortcut: 'Ctrl+S',
        action: triggerSave,
      },
      {
        label: 'Save Backup File (JSON)...',
        action: () => downloadProjectFile(),
      },
      { separator: true, label: '' },
      {
        label: 'Export 3D Scene (GLB)',
        action: () => handleExport('glb'),
      },
      {
        label: 'Export CAD Solid (STEP)',
        action: () => handleExport('step'),
      },
      {
        label: 'Export BIM Model (IFC)',
        action: () => handleExport('ifc'),
      },
      {
        label: 'Export Project Scene (JSON)',
        action: () => handleExport('json'),
      },
      {
        label: 'Take Canvas Screenshot',
        shortcut: 'Ctrl+Shift+S',
        action: () => handleExport('screenshot'),
      },
      { separator: true, label: '' },
      {
        label: 'Share Project Link...',
        action: handleShare,
      },
    ],
    edit: [
      {
        label: 'Undo',
        shortcut: 'Ctrl+Z',
        action: () => {
          const temporal = (useScene as any).temporal?.getState?.()
          if (temporal?.undo) temporal.undo()
        },
      },
      {
        label: 'Redo',
        shortcut: 'Ctrl+Y',
        action: () => {
          const temporal = (useScene as any).temporal?.getState?.()
          if (temporal?.redo) temporal.redo()
        },
      },
      { separator: true, label: '' },
      {
        label: 'Duplicate Selected',
        shortcut: 'D',
        action: () => {
          const selectedIds = useViewer.getState().selection.selectedIds
          if (!selectedIds[0]) return
          void executeAssistantPlan([{ type: 'duplicate_target', nodeId: selectedIds[0] }])
        },
      },
      {
        label: 'Delete Selected',
        shortcut: 'Del',
        danger: true,
        action: () => void executeAssistantPlan([{ type: 'delete_selected' }]),
      },
      { separator: true, label: '' },
      {
        label: 'Clear Level Contents',
        danger: true,
        action: () => {
          if (confirm('Are you sure you want to clear all contents in the active level?')) {
            void executeAssistantPlan([{ type: 'clear_level_contents' }])
          }
        },
      },
      {
        label: 'Clear Entire Project',
        danger: true,
        action: () => setActiveModal('new-project'),
      },
    ],
    selection: [
      {
        label: 'Select All in Level',
        shortcut: 'Ctrl+A',
        action: () => {
          const nodes = useScene.getState().nodes
          const levelId = useViewer.getState().selection.levelId
          const nodeIds = Object.keys(nodes).filter((id) =>
            levelId ? (nodes as any)[id]?.levelId === levelId : true,
          )
          useViewer.getState().setSelection({ selectedIds: nodeIds })
        },
      },
      {
        label: 'Deselect All',
        shortcut: 'Esc',
        action: () => useViewer.getState().setSelection({ selectedIds: [] }),
      },
      {
        label: 'Focus Selection',
        shortcut: 'F',
        action: () => {
          const selectedIds = useViewer.getState().selection.selectedIds
          if (selectedIds.length === 0) return
          void executeAssistantPlan([{ type: 'focus_camera_on_nodes', nodeIds: [...selectedIds] }])
        },
      },
      { separator: true, label: '' },
      {
        label: 'Transform: Move Tool',
        shortcut: 'G',
        action: () => useEditor.getState().setTransformMode('move'),
      },
      {
        label: 'Transform: Rotate Tool',
        shortcut: 'R',
        action: () => useEditor.getState().setTransformMode('rotate'),
      },
      {
        label: 'Transform: Scale Tool',
        shortcut: 'E',
        action: () => useEditor.getState().setTransformMode('scale'),
      },
      {
        label: 'Toggle Pivot (Center / Origin)',
        action: () => {
          const current = useEditor.getState().transformPivot
          useEditor.getState().setTransformPivot(
            current === 'bounds-center' ? 'asset-origin' : 'bounds-center',
          )
        },
      },
    ],
    view: [
      {
        label: 'Architecture Workspace',
        shortcut: '1',
        action: () => useEditor.getState().setWorkspace('architecture'),
      },
      {
        label: 'CAD Workspace',
        shortcut: '4',
        action: () => useEditor.getState().setWorkspace('cad'),
      },
      { separator: true, label: '' },
      {
        label: 'Camera: Perspective 3D',
        action: () => void executeAssistantPlan([{ type: 'set_camera_mode', cameraMode: 'perspective' }]),
      },
      {
        label: 'Camera: Orthographic 2D/Iso',
        action: () => void executeAssistantPlan([{ type: 'set_camera_mode', cameraMode: 'orthographic' }]),
      },
      { separator: true, label: '' },
      {
        label: 'Wall Mode: Cutaway',
        action: () => useViewer.getState().setWallMode('cutaway'),
      },
      {
        label: 'Wall Mode: Full Height',
        action: () => useViewer.getState().setWallMode('up'),
      },
      {
        label: 'Level Mode: Solo',
        action: () => useViewer.getState().setLevelMode('solo'),
      },
      {
        label: 'Level Mode: Stacked',
        action: () => useViewer.getState().setLevelMode('stacked'),
      },
      { separator: true, label: '' },
      {
        label: 'Toggle Fullscreen',
        shortcut: 'F11',
        action: () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {})
          } else {
            document.exitFullscreen().catch(() => {})
          }
        },
      },
    ],
    go: [
      {
        label: 'Go to Level 0',
        action: () => useViewer.getState().setSelection({ levelId: 'level_0' as any }),
      },
      {
        label: 'Add New Level',
        action: () => void executeAssistantPlan([{ type: 'create_level' }]),
      },
      { separator: true, label: '' },
      {
        label: 'Go to Site View',
        action: () => useViewer.getState().setSelection({ levelId: null, zoneId: null }),
      },
      {
        label: 'Reset 3D Camera to Center',
        shortcut: '0',
        action: () => void executeAssistantPlan([{ type: 'camera_top_view' }]),
      },
    ],
    run: [
      {
        label: 'New CAD Sketch',
        shortcut: 'S',
        action: () => void executeAssistantPlan([{ type: 'activate_tool', tool: 'cad-sketch' }]),
      },
      {
        label: 'Close Active CAD Sketch',
        action: () => void executeAssistantPlan([{ type: 'close_cad_sketch' }]),
      },
      {
        label: 'Extrude Active Sketch',
        shortcut: 'E',
        action: () => void executeAssistantPlan([{ type: 'activate_tool', tool: 'cad-extrude' }]),
      },
      {
        label: 'Revolve Active Sketch',
        shortcut: 'R',
        action: () => void executeAssistantPlan([{ type: 'activate_tool', tool: 'cad-revolve' }]),
      },
      {
        label: 'Regenerate CAD Body',
        disabled: !hasCadBodySelected,
        action: () => void executeAssistantPlan([{ type: 'regenerate_cad_body' }]),
      },
      { separator: true, label: '' },
      {
        label: 'Architecture: Wall Tool',
        action: () => useEditor.getState().setTool('wall'),
      },
      {
        label: 'Architecture: Slab Tool',
        action: () => useEditor.getState().setTool('slab'),
      },
      {
        label: 'Architecture: Door Tool',
        action: () => useEditor.getState().setTool('door'),
      },
      {
        label: 'Architecture: Window Tool',
        action: () => useEditor.getState().setTool('window'),
      },
      {
        label: 'Architecture: Item Tool',
        action: () => useEditor.getState().setTool('item'),
      },
      {
        label: 'Architecture: Zone Tool',
        action: () => useEditor.getState().setTool('zone'),
      },
    ],
    terminal: [
      {
        label: 'Command Palette...',
        shortcut: 'Ctrl+K',
        action: () => useCommandPalette.getState().setOpen(true),
      },
      {
        label: 'Toggle AI Assistant Panel',
        shortcut: 'Ctrl+J',
        action: () => {
          const toggle = document.querySelector('[data-testid="assistant-toggle"]') as HTMLElement | null
          toggle?.click()
        },
      },
    ],
    help: [
      {
        label: 'Keyboard Shortcuts Cheat Sheet',
        shortcut: '?',
        action: () => setActiveModal('shortcuts'),
      },
      { separator: true, label: '' },
      {
        label: 'FreeCAD & MAC Engine Documentation',
        action: () => {
          window.open('https://github.com/uset82/Pistola#readme', '_blank')
        },
      },
      {
        label: 'Pistola GitHub Repository',
        action: () => {
          window.open('https://github.com/uset82/Pistola', '_blank')
        },
      },
      {
        label: 'Open Cloud Workspace Preview',
        action: () => {
          window.open('https://pistolacodex-cad.gi-o-vi-n-ch-5540.chatgpt.site/workspace', '_blank')
        },
      },
    ],
  }

  const menuHeaders: Array<{ id: Exclude<MenuId, 'export-quick' | null>; label: string }> = [
    { id: 'file', label: 'File' },
    { id: 'edit', label: 'Edit' },
    { id: 'selection', label: 'Selection' },
    { id: 'view', label: 'View' },
    { id: 'go', label: 'Go' },
    { id: 'run', label: 'Run' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'help', label: 'Help' },
  ]

  return (
    <>
      {/* Hidden file input for Open Project */}
      <input
        accept=".json,.pistola.json,application/json,.glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      {/* Top Application Menu Bar */}
      <header
        className="fixed top-0 right-0 left-0 z-40 flex h-9 select-none items-center justify-between border-white/[0.08] border-b bg-neutral-950/95 px-3 font-sans text-[12px] text-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.4)] backdrop-blur-md"
        ref={menuContainerRef}
      >
        {/* Left: Brand Mark + Menus (File, Edit, Selection, View, Go, Run, Terminal, Help) */}
        <div className="flex items-center gap-1">
          {/* Logo Mark */}
          <div
            className="mr-2 flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300 transition hover:bg-cyan-400/20"
            title="Pistola CAD Workspace"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          {/* Menus List */}
          <nav className="flex items-center gap-0.5">
            {menuHeaders.map(({ id, label }) => {
              const isOpen = activeMenu === id
              return (
                <div className="relative" key={id}>
                  <button
                    className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      isOpen
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                    }`}
                    onClick={() => setActiveMenu(isOpen ? null : id)}
                    onMouseEnter={() => {
                      if (activeMenu && activeMenu !== id) {
                        setActiveMenu(id)
                      }
                    }}
                    type="button"
                  >
                    {label}
                  </button>

                  {/* Dropdown Menu */}
                  {isOpen && (
                    <div className="absolute top-full left-0 z-50 mt-1 min-w-[210px] rounded-xl border border-white/10 bg-neutral-900/98 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in duration-100">
                      {menus[id]?.map((item, idx) => {
                        if (item.separator) {
                          return (
                            <div
                              className="my-1 border-white/[0.08] border-t"
                              key={`sep-${idx}`}
                            />
                          )
                        }

                        return (
                          <button
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition ${
                              item.disabled
                                ? 'cursor-not-allowed text-white/30'
                                : item.danger
                                ? 'text-red-300 hover:bg-red-500/20 hover:text-red-200'
                                : 'text-white/80 hover:bg-white/10 hover:text-white'
                            }`}
                            disabled={item.disabled}
                            key={item.label}
                            onClick={() => {
                              setActiveMenu(null)
                              item.action?.()
                            }}
                            type="button"
                          >
                            <span>{item.label}</span>
                            {item.shortcut && (
                              <span className="ml-3 font-mono text-[10px] text-white/40">
                                {item.shortcut}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </div>

        {/* Center / Right: Quick Actions & Status */}
        <div className="flex items-center gap-2">
          {/* Active Project Title Pill */}
          <div
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/70"
            title={isDirty ? 'Unsaved changes' : 'All changes saved'}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isDirty ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <span className="max-w-[130px] truncate font-medium text-white/90">
              {projectName}
            </span>
            {saveStatusText && (
              <span className="font-semibold text-emerald-400 text-[10px] animate-in fade-in">
                · {saveStatusText}
              </span>
            )}
          </div>

          {/* Quick Action: New Project */}
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={() => setActiveModal('new-project')}
            title="Create New Project (Ctrl+N)"
            type="button"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" />
            </svg>
            <span>New</span>
          </button>

          {/* Quick Action: Save */}
          <button
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              isDirty
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                : 'border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            onClick={triggerSave}
            title="Save Project (Ctrl+S)"
            type="button"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>Save</span>
          </button>

          {/* Quick Action: Export Dropdown */}
          <div className="relative">
            <button
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-white/80 transition ${
                activeMenu === 'export-quick'
                  ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-white/[0.05] hover:bg-white/10 hover:text-white'
              }`}
              disabled={isExporting}
              onClick={() =>
                setActiveMenu(activeMenu === 'export-quick' ? null : 'export-quick')
              }
              type="button"
            >
              <span>{isExporting ? 'Exporting...' : 'Export'}</span>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {activeMenu === 'export-quick' && (
              <div className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-xl border border-white/10 bg-neutral-900/98 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in duration-100">
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => handleExport('glb')}
                  type="button"
                >
                  <span>Export GLB (3D)</span>
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => handleExport('step')}
                  type="button"
                >
                  <span>Export STEP (CAD)</span>
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => handleExport('ifc')}
                  type="button"
                >
                  <span>Export IFC (BIM)</span>
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => handleExport('json')}
                  type="button"
                >
                  <span>Export JSON (Scene)</span>
                </button>
                <div className="my-1 border-white/[0.08] border-t" />
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => handleExport('screenshot')}
                  type="button"
                >
                  <span>Take Screenshot</span>
                  <span className="font-mono text-[10px] text-white/40">^⇧S</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick Action: Share */}
          <button
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
              shareSuccess
                ? 'border-emerald-400/40 bg-emerald-400/20 text-emerald-200'
                : 'border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/10 hover:text-white'
            }`}
            onClick={handleShare}
            title="Share Workspace Link"
            type="button"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" x2="12" y1="2" y2="15" />
            </svg>
            <span>{shareSuccess ? 'Copied Link!' : 'Share'}</span>
          </button>

          {/* Command Palette Trigger Pill */}
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 font-medium text-[11px] text-cyan-200 transition hover:bg-cyan-400/20 hover:text-cyan-100"
            onClick={() => useCommandPalette.getState().setOpen(true)}
            title="Open Command Palette (Ctrl+K)"
            type="button"
          >
            <svg className="h-3 w-3 text-cyan-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" x2="16.65" y1="21" y2="16.65" />
            </svg>
            <span>Commands</span>
            <kbd className="rounded border border-cyan-300/30 bg-black/40 px-1 py-0.2 text-[9px] font-mono text-cyan-300/90">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>
    </>
  )
}
