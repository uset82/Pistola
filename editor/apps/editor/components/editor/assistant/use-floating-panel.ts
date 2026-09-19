'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type PanelPosition = { x: number; y: number }

const STORAGE_KEY = 'pistola-assistant-panel'
const PANEL_GUTTER = 16
export const ASSISTANT_PANEL_WIDTH = 380

const readStoredPanelState = () => {
  if (typeof window === 'undefined') {
    return { collapsed: false, position: null as PanelPosition | null }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { collapsed: false, position: null as PanelPosition | null }
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
    return { collapsed: false, position: null as PanelPosition | null }
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampPanelPosition = (
  position: PanelPosition,
  width: number,
  height: number,
): PanelPosition => ({
  x: clamp(
    position.x,
    PANEL_GUTTER,
    Math.max(PANEL_GUTTER, window.innerWidth - width - PANEL_GUTTER),
  ),
  y: clamp(
    position.y,
    PANEL_GUTTER,
    Math.max(PANEL_GUTTER, window.innerHeight - height - PANEL_GUTTER),
  ),
})

const isInteractiveDragTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, input, textarea, select, option, label, a, img'))
}

/**
 * Position, drag, dock and collapse state for the floating assistant. The
 * panel sits bottom-right until the user drags or docks it; both the position
 * and the collapsed state persist in localStorage.
 */
export function useFloatingPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [element, setElement] = useState<HTMLElement | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    const stored = readStoredPanelState()
    setCollapsed(stored.collapsed)
    setPosition(stored.position)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed, position }))
    } catch {
      // Private browsing can block storage. The panel still works for this session.
    }
  }, [hydrated, collapsed, position])

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      const rect = elementRef.current?.getBoundingClientRect()
      if (!dragState || dragState.pointerId !== event.pointerId || !rect) return

      const next = clampPanelPosition(
        { x: event.clientX - dragState.offsetX, y: event.clientY - dragState.offsetY },
        rect.width,
        rect.height,
      )
      setPosition((current) => (current?.x === next.x && current?.y === next.y ? current : next))
    }

    const stopDragging = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return
      dragStateRef.current = null
      setIsDragging(false)
    }

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [isDragging])

  useEffect(() => {
    const syncPosition = () => {
      const rect = elementRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition((current) => {
        if (!current) return current
        const next = clampPanelPosition(current, rect.width, rect.height)
        return next.x === current.x && next.y === current.y ? current : next
      })
    }

    const resizeObserver =
      element && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncPosition) : null
    if (resizeObserver && element) resizeObserver.observe(element)
    window.addEventListener('resize', syncPosition)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncPosition)
    }
  }, [element])

  const assignRef = (node: HTMLElement | null) => {
    elementRef.current = node
    setElement(node)
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isInteractiveDragTarget(event.target)) return

    const rect = elementRef.current?.getBoundingClientRect()
    if (!rect) return

    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    setPosition(
      clampPanelPosition(
        { x: rect.left, y: rect.top },
        rect.width || ASSISTANT_PANEL_WIDTH,
        rect.height,
      ),
    )
    setIsDragging(true)
    event.preventDefault()
  }

  const dockLeft = () => {
    const sidebar = document.querySelector('[data-slot="sidebar"][data-state="expanded"]')
    const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 0
    const height = elementRef.current?.getBoundingClientRect().height ?? 480
    setCollapsed(false)
    setPosition(
      clampPanelPosition(
        { x: sidebarWidth > 48 ? sidebarWidth + PANEL_GUTTER : PANEL_GUTTER, y: PANEL_GUTTER },
        ASSISTANT_PANEL_WIDTH,
        height,
      ),
    )
  }

  return {
    collapsed,
    setCollapsed,
    isDragging,
    assignRef,
    startDrag,
    dockLeft,
    /** Undefined while the panel keeps its default bottom-right anchor. */
    positionStyle: position
      ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
      : undefined,
  }
}
