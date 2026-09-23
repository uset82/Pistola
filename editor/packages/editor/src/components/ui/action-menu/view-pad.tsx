'use client'

import { emitter } from '@pascal-app/core'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const STORAGE_KEY = 'pistola-view-pad'
const GUTTER = 16
const PAD_WIDTH = 188

type Position = { x: number; y: number }

const buttonClass =
  'rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/90 hover:bg-white/10'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampPosition = (position: Position, width: number, height: number): Position => {
  if (typeof window === 'undefined') return position
  return {
    x: clamp(position.x, GUTTER, Math.max(GUTTER, window.innerWidth - width - GUTTER)),
    y: clamp(position.y, GUTTER, Math.max(GUTTER, window.innerHeight - height - GUTTER)),
  }
}

const defaultPosition = (height: number): Position => {
  const sidebar = document.querySelector('[data-slot="sidebar"][data-state="expanded"]')
  const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 0
  const x = sidebarWidth > 48 ? sidebarWidth + GUTTER : GUTTER
  const y = Math.max(GUTTER, Math.round((window.innerHeight - height) * 0.62))
  return clampPosition({ x, y }, PAD_WIDTH, height)
}

const readStorage = () => {
  if (typeof window === 'undefined') {
    return { collapsed: false, position: null as Position | null }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { collapsed: false, position: null as Position | null }
    const parsed = JSON.parse(raw) as {
      collapsed?: unknown
      position?: { x?: unknown; y?: unknown } | null
    }
    const position =
      parsed.position &&
      typeof parsed.position.x === 'number' &&
      typeof parsed.position.y === 'number'
        ? { x: parsed.position.x, y: parsed.position.y }
        : null
    return { collapsed: parsed.collapsed === true, position }
  } catch {
    return { collapsed: false, position: null as Position | null }
  }
}

export function ViewPad() {
  const padRef = useRef<HTMLElement | null>(null)
  const assignPadRef = (node: HTMLElement | null) => {
    padRef.current = node
  }
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; moved: boolean } | null>(
    null,
  )
  const [position, setPosition] = useState<Position>({ x: GUTTER, y: 160 })
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const stored = readStorage()
    const height = padRef.current?.getBoundingClientRect().height ?? 240
    setCollapsed(stored.collapsed)
    setPosition(stored.position ? clampPosition(stored.position, PAD_WIDTH, height) : defaultPosition(height))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed, position }))
    } catch {
      // Private browsing can block storage. The pad still works for this session.
    }
  }, [collapsed, hydrated, position])

  useEffect(() => {
    const handleResize = () => {
      const rect = padRef.current?.getBoundingClientRect()
      setPosition((current) =>
        clampPosition(current, rect?.width ?? PAD_WIDTH, rect?.height ?? 240),
      )
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const stopDragListeners = useRef<(() => void) | null>(null)

  useEffect(() => () => stopDragListeners.current?.(), [])

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const hitButton = event.target instanceof Element ? event.target.closest('button') : null
    if (hitButton && hitButton !== event.currentTarget) return
    const rect = padRef.current?.getBoundingClientRect()
    if (!rect) return

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    }
    setIsDragging(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is optional. Window listeners still follow the drag.
    }

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== moveEvent.pointerId) return
      const bounds = padRef.current?.getBoundingClientRect()
      const next = clampPosition(
        { x: moveEvent.clientX - drag.offsetX, y: moveEvent.clientY - drag.offsetY },
        bounds?.width ?? PAD_WIDTH,
        bounds?.height ?? 48,
      )
      if (Math.abs(moveEvent.clientX - (rect.left + drag.offsetX)) > 3 || Math.abs(moveEvent.clientY - (rect.top + drag.offsetY)) > 3) {
        drag.moved = true
      }
      setPosition(next)
    }
    const handleUp = (upEvent: PointerEvent) => {
      if (dragRef.current?.pointerId !== upEvent.pointerId) return
      const moved = dragRef.current.moved
      dragRef.current = null
      setIsDragging(false)
      stopDragListeners.current?.()
      stopDragListeners.current = null
      if (collapsed && !moved) setCollapsed(false)
    }
    stopDragListeners.current?.()
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    stopDragListeners.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }

  const positionStyle = { left: position.x, top: position.y }

  if (collapsed) {
    return (
      <button
        aria-label="Show view controls"
        className={`pointer-events-auto fixed z-[160] rounded-full border border-white/10 bg-neutral-950/90 px-3 py-2 text-xs text-white shadow-lg ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        data-testid="view-pad-toggle"
        onPointerDown={handleDragStart}
        ref={assignPadRef}
        style={positionStyle}
        type="button"
      >
        View
      </button>
    )
  }

  return (
    <div
      aria-label="View controls"
      className="pointer-events-auto fixed z-[160] w-[188px] rounded-2xl border border-white/10 bg-neutral-950/88 p-2 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      data-testid="view-pad"
      ref={assignPadRef}
      style={positionStyle}
    >
      <div
        aria-label="Drag view controls"
        className={`mb-1 flex items-center justify-between gap-2 px-1 text-white/55 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } touch-none select-none`}
        data-testid="view-pad-drag-handle"
        onPointerDown={handleDragStart}
        role="button"
        tabIndex={0}
      >
        <span className="text-[10px] uppercase tracking-[0.18em]">Drag</span>
        <button
          aria-label="Hide view controls"
          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/80"
          data-testid="view-pad-hide"
          onClick={() => setCollapsed(true)}
          type="button"
        >
          Hide
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          aria-label="Zoom in"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:dolly', { direction: 'in' })}
          type="button"
        >
          Zoom +
        </button>
        <button
          aria-label="Fit view"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:fit')}
          type="button"
        >
          Fit
        </button>
        <button
          aria-label="Zoom out"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:dolly', { direction: 'out' })}
          type="button"
        >
          Zoom −
        </button>
        <button
          aria-label="Pan up"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:truck', { x: 0, y: 1.25 })}
          type="button"
        >
          Up
        </button>
        <button
          aria-label="Pan down"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:truck', { x: 0, y: -1.25 })}
          type="button"
        >
          Down
        </button>
        <button
          aria-label="Pan left"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:truck', { x: -1.25, y: 0 })}
          type="button"
        >
          Left
        </button>
        <button
          aria-label="Pan right"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:truck', { x: 1.25, y: 0 })}
          type="button"
        >
          Right
        </button>
        <button
          aria-label="Orbit left"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:orbit-ccw', {})}
          type="button"
        >
          Orbit L
        </button>
        <button
          aria-label="Orbit right"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:orbit-cw', {})}
          type="button"
        >
          Orbit R
        </button>
        <button
          aria-label="Top view"
          className={buttonClass}
          onClick={() => emitter.emit('camera-controls:top-view')}
          type="button"
        >
          Top
        </button>
        <button
          aria-label="Front view"
          className={`${buttonClass} col-span-2`}
          onClick={() => emitter.emit('camera-controls:front-view')}
          type="button"
        >
          Front
        </button>
      </div>
    </div>
  )
}
