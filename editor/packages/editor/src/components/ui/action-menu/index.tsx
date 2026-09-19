'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { TooltipProvider } from './../../../components/ui/primitives/tooltip'
import { useReducedMotion } from './../../../hooks/use-reduced-motion'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'
import { ItemCatalog } from '../item-catalog/item-catalog'
import { getToolShortcutHints, ToolShortcutBar } from '../helpers/tool-shortcuts'
import { CameraActions } from './camera-actions'
import { CadTools } from './cad-tools'
import { ControlModes } from './control-modes'
import { FurnishTools } from './furnish-tools'
import { StructureTools } from './structure-tools'
import { ViewToggles } from './view-toggles'

const STORAGE_KEY = 'pistola-action-menu'
const GUTTER = 16

// Anchored by its bottom-left corner so rows that expand (catalog, CAD tools) grow upward.
type Position = { x: number; bottom: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampPosition = (position: Position, width: number, height: number): Position => {
  if (typeof window === 'undefined') return position
  return {
    x: clamp(position.x, GUTTER, Math.max(GUTTER, window.innerWidth - width - GUTTER)),
    bottom: clamp(position.bottom, GUTTER, Math.max(GUTTER, window.innerHeight - height - GUTTER)),
  }
}

const readStoredPosition = (): Position | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { position?: { x?: unknown; bottom?: unknown } | null }
    return parsed.position &&
      typeof parsed.position.x === 'number' &&
      typeof parsed.position.bottom === 'number'
      ? { x: parsed.position.x, bottom: parsed.position.bottom }
      : null
  } catch {
    return null
  }
}

/** Drag state for the floating action menu. `null` position keeps the default bottom-center spot. */
function useDraggableMenu() {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetBottom: number } | null>(null)
  const stopDragListeners = useRef<(() => void) | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    setPosition(readStoredPosition())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ position }))
    } catch {
      // Private browsing can block storage. The menu still moves for this session.
    }
  }, [hydrated, position])

  // Keep the menu on screen when the window shrinks or a tool row makes it taller.
  useEffect(() => {
    const element = menuRef.current
    if (!element) return
    const reclamp = () => {
      const rect = element.getBoundingClientRect()
      setPosition((current) => (current ? clampPosition(current, rect.width, rect.height) : current))
    }
    const observer = new ResizeObserver(reclamp)
    observer.observe(element)
    window.addEventListener('resize', reclamp)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reclamp)
    }
  }, [])

  useEffect(() => () => stopDragListeners.current?.(), [])

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const rect = menuRef.current?.getBoundingClientRect()
    if (!rect) return

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetBottom: rect.bottom - event.clientY,
    }
    setPosition(
      clampPosition({ x: rect.left, bottom: window.innerHeight - rect.bottom }, rect.width, rect.height),
    )
    setIsDragging(true)
    event.preventDefault()

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== moveEvent.pointerId) return
      const bounds = menuRef.current?.getBoundingClientRect()
      setPosition(
        clampPosition(
          {
            x: moveEvent.clientX - drag.offsetX,
            bottom: window.innerHeight - (moveEvent.clientY + drag.offsetBottom),
          },
          bounds?.width ?? rect.width,
          bounds?.height ?? rect.height,
        ),
      )
    }
    const handleUp = (upEvent: PointerEvent) => {
      if (dragRef.current?.pointerId !== upEvent.pointerId) return
      dragRef.current = null
      setIsDragging(false)
      stopDragListeners.current?.()
      stopDragListeners.current = null
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

  return {
    handleDragStart,
    isDragging,
    menuRef,
    position,
    resetPosition: () => setPosition(null),
  }
}

export function ActionMenu({
  className,
  enableCadRuntime = true,
}: {
  className?: string
  enableCadRuntime?: boolean
}) {
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const movingNode = useEditor((state) => state.movingNode)
  const isAuthoringPhase = phase === 'structure' || phase === 'furnish' || phase === 'cad'
  const isBuildMode = mode === 'build'
  const toolShortcutHints = getToolShortcutHints({ movingNode: movingNode !== null, phase, tool })
  const reducedMotion = useReducedMotion()
  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, bounce: 0.2, duration: 0.4 }
  const { handleDragStart, isDragging, menuRef, position, resetPosition } = useDraggableMenu()

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          'fixed z-50',
          !position && 'bottom-6 left-1/2 -translate-x-1/2',
          'rounded-2xl border border-border bg-background/90 shadow-2xl backdrop-blur-md',
          'transition-colors duration-200 ease-out',
          className,
        )}
        data-testid="action-menu"
        layout={!isDragging}
        ref={menuRef}
        style={position ? { left: position.x, bottom: position.bottom } : undefined}
        transition={transition}
      >
        <div
          aria-label="Drag toolbar"
          className={cn(
            'group flex h-3.5 touch-none select-none items-center justify-center',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
          data-testid="action-menu-drag-handle"
          onDoubleClick={resetPosition}
          onPointerDown={handleDragStart}
          role="button"
          tabIndex={0}
          title="Drag to move toolbar · double-click to re-center"
        >
          <span
            className={cn(
              'h-1 w-8 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/60',
              isDragging && 'bg-muted-foreground/70',
            )}
          />
        </div>
        {/* Item Catalog Row - Only show when in build mode with item tool */}
        <AnimatePresence>
          {isBuildMode && tool === 'item' && catalogCategory && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 160,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className={cn('overflow-hidden border-border border-b px-2 py-2')}
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <ItemCatalog category={catalogCategory} key={catalogCategory} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'cad' && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 80,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className={cn(
                'overflow-hidden border-border',
                'max-h-20 border-b px-2 py-2',
                !isBuildMode && 'opacity-80',
              )}
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <div className="mx-auto w-max">
                <CadTools enableCadRuntime={enableCadRuntime} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'furnish' && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 80,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className={cn(
                'overflow-hidden border-border',
                'max-h-20 border-b px-2 py-2',
                !isBuildMode && 'opacity-80',
              )}
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <div className="mx-auto w-max">
                <FurnishTools />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Structure Tools Row - Animated */}
        <AnimatePresence>
          {phase === 'structure' && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 80,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className={cn(
                'max-h-20 overflow-hidden border-border border-b px-2 py-2',
                !isBuildMode && 'opacity-80',
              )}
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <div className="w-max">
                <StructureTools />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {toolShortcutHints.length > 0 && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 64,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className="overflow-hidden border-border border-b px-2 py-2"
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <ToolShortcutBar hints={toolShortcutHints} />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Control Mode Row - Always visible, centered */}
        <div className="flex items-center justify-center gap-1 px-2 py-1.5">
          <ControlModes />
          {isAuthoringPhase && (
            <>
              <div className="mx-1 h-5 w-px bg-border" />
              <div
                className={cn(
                  'rounded-full border px-2.5 py-1 font-medium text-[10px] leading-none',
                  isBuildMode
                    ? 'border-green-500/40 bg-green-500/10 text-green-300'
                    : 'border-border/60 bg-background/50 text-muted-foreground',
                )}
              >
                {isBuildMode ? 'Build tools active' : 'Pick a tool or press B'}
              </div>
            </>
          )}
          <div className="mx-1 h-5 w-px bg-border" />
          <ViewToggles />
          <div className="mx-1 h-5 w-px bg-border" />
          <CameraActions />
        </div>
      </motion.div>
    </TooltipProvider>
  )
}
