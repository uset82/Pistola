'use client'

import Image from 'next/image'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import { ActionButton } from './action-button'

export function CameraActions() {
  return (
    <div className="flex items-center gap-1">
      {/* Orbit CCW */}
      <ActionButton
        className="group hover:bg-white/5"
        label="Orbit Left"
        onClick={() => void runAssistantCommand([{ type: 'orbit_camera', direction: 'ccw' }])}
        size="icon"
        variant="ghost"
      >
        <Image
          alt="Orbit Left"
          className="h-[28px] w-[28px] -scale-x-100 object-contain opacity-70 transition-opacity group-hover:opacity-100"
          height={28}
          src="/icons/rotate.png"
          width={28}
        />
      </ActionButton>

      {/* Orbit CW */}
      <ActionButton
        className="group hover:bg-white/5"
        label="Orbit Right"
        onClick={() => void runAssistantCommand([{ type: 'orbit_camera', direction: 'cw' }])}
        size="icon"
        variant="ghost"
      >
        <Image
          alt="Orbit Right"
          className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
          height={28}
          src="/icons/rotate.png"
          width={28}
        />
      </ActionButton>

      {/* Top View */}
      <ActionButton
        className="group hover:bg-white/5"
        label="Top View"
        onClick={() => void runAssistantCommand([{ type: 'camera_top_view' }])}
        size="icon"
        variant="ghost"
      >
        <Image
          alt="Top View"
          className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
          height={28}
          src="/icons/topview.png"
          width={28}
        />
      </ActionButton>
    </div>
  )
}
