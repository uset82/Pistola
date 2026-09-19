'use client'

import { emitter } from '@pascal-app/core'

const buttonClass =
  'rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/90 hover:bg-white/10'

export function ViewPad() {
  return (
    <div
      aria-label="View controls"
      className="pointer-events-auto fixed right-4 bottom-6 z-[160] grid w-[168px] grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-neutral-950/88 p-2 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      data-testid="view-pad"
    >
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
        onClick={() => emitter.emit('camera-controls:orbit-ccw')}
        type="button"
      >
        Orbit L
      </button>
      <button
        aria-label="Orbit right"
        className={buttonClass}
        onClick={() => emitter.emit('camera-controls:orbit-cw')}
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
  )
}
