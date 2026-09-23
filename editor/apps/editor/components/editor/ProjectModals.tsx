'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createNewProject,
  useProjectStore,
} from '../../lib/project-actions'

export function ProjectModals() {
  const activeModal = useProjectStore((s) => s.activeModal)
  const setActiveModal = useProjectStore((s) => s.setActiveModal)
  const projectName = useProjectStore((s) => s.projectName)
  const setProjectName = useProjectStore((s) => s.setProjectName)

  const [copied, setCopied] = useState(false)
  const [newProjectInput, setNewProjectInput] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeModal === 'new-project') nameInputRef.current?.focus()
  }, [activeModal])

  if (!activeModal) return null

  const closeModal = () => setActiveModal(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* NEW PROJECT MODAL */}
        {activeModal === 'new-project' && (
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white">Create New Project</h3>
                <p className="text-[12px] text-white/50">Start a fresh CAD and architecture workspace</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-white/50">
                Project Name
              </label>
              <input
                ref={nameInputRef}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-cyan-300 focus:outline-none"
                defaultValue={newProjectInput || 'Untitled Project'}
                onChange={(e) => setNewProjectInput(e.target.value)}
                placeholder="e.g. Model Boat, Modern Studio"
                type="text"
              />
              <p className="mt-2 text-[11px] text-amber-200/70">
                ⚠️ Current scene elements will be cleared. Be sure to save backups first.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                className="rounded-xl px-4 py-2 text-[12px] text-white/60 hover:bg-white/5 hover:text-white"
                onClick={closeModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-cyan-300 px-4 py-2 font-medium text-[12px] text-black transition hover:bg-cyan-200"
                onClick={() => {
                  createNewProject(newProjectInput || 'Untitled Project')
                  closeModal()
                }}
                type="button"
              >
                Create Project
              </button>
            </div>
          </div>
        )}

        {/* SHARE MODAL */}
        {activeModal === 'share' && (
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white">Share Project</h3>
                <p className="text-[12px] text-white/50">Collaborate or preview this 3D workspace</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-white/50">
                Workspace URL
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-1.5 pr-2">
                <input
                  className="flex-1 bg-transparent px-2 text-[12px] font-mono text-cyan-200/90 outline-none"
                  readOnly
                  value={typeof window !== 'undefined' ? window.location.href : ''}
                />
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-1.5 font-medium text-[11px] text-black transition hover:bg-cyan-200"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(window.location.href)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2500)
                    }
                  }}
                  type="button"
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-white/60">
              Anyone with this link can view the workspace, inspect CAD sketches and 3D objects, and interact with the AI assistant.
            </div>

            <div className="mt-6 flex justify-end">
              <button
                className="rounded-xl px-4 py-2 text-[12px] text-white/60 hover:bg-white/5 hover:text-white"
                onClick={closeModal}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* SHORTCUTS REFERENCE MODAL */}
        {activeModal === 'shortcuts' && (
          <div className="max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-[15px] font-semibold text-white">Keyboard Shortcuts</h3>
                <p className="text-[11px] text-white/50">Fusion 360 / AutoCAD & Pistola shortcuts</p>
              </div>
              <button
                className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white"
                onClick={closeModal}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-[12px]">
              <div>
                <div className="font-semibold text-[11px] uppercase tracking-wider text-cyan-300">
                  CAD & Solid Modeling
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">New CAD Sketch</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">S</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Extrude Active Sketch</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">E</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Revolve Active Sketch</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">R</kbd>
                  </div>
                </div>
              </div>

              <div>
                <div className="font-semibold text-[11px] uppercase tracking-wider text-cyan-300">
                  Workspace & Navigation
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Command Palette</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">Ctrl / Cmd + K</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Architecture Workspace</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">1</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">CAD Workspace</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">4</kbd>
                  </div>
                </div>
              </div>

              <div>
                <div className="font-semibold text-[11px] uppercase tracking-wider text-cyan-300">
                  Transform & Editing
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Move Gizmo</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">G</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Rotate Gizmo</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">R</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Scale Gizmo</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">E</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Duplicate Selection</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">D</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Delete Selected</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">Delete / Backspace</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Undo</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">Ctrl / Cmd + Z</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Redo</span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">Ctrl / Cmd + Shift + Z</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                className="rounded-xl bg-white/10 px-4 py-2 text-[12px] text-white hover:bg-white/15"
                onClick={closeModal}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
