'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { Group } from 'three'

const canUseWebGL = () => {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function Solid({ spinning }: { spinning: boolean }) {
  const group = useRef<Group>(null)

  useFrame((_, delta) => {
    if (!spinning || !group.current) return
    group.current.rotation.y += delta * 0.32
  })

  return (
    <group ref={group}>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[1.2, 0.62, 1.75]} />
        <meshStandardMaterial color="#67e8f9" metalness={0.08} roughness={0.42} />
      </mesh>
      <mesh position={[0.08, 0.92, -0.18]}>
        <boxGeometry args={[0.52, 0.38, 0.62]} />
        <meshStandardMaterial color="#e4e4e7" metalness={0.04} roughness={0.55} />
      </mesh>
    </group>
  )
}

export function LandingViewport({ caption }: { caption?: string }) {
  const [webgl, setWebgl] = useState(false)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => setSpinning(!media.matches)
    syncMotion()
    media.addEventListener('change', syncMotion)
    setWebgl(canUseWebGL())
    return () => media.removeEventListener('change', syncMotion)
  }, [])

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#18181b]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="mono text-[11px] text-zinc-400">
          <span className="text-[#67e8f9]">Architecture</span>
          <span className="px-1.5 text-zinc-600">|</span>
          CAD
        </p>
        <p className="mono text-[10px] tracking-wide text-zinc-500">workspace</p>
      </div>
      <div className="relative h-[260px] bg-[#09090b] sm:h-[320px]">
        {webgl ? (
          <Canvas
            camera={{ fov: 42, position: [2.7, 1.7, 3.05] }}
            dpr={[1, 1.5]}
            frameloop={spinning ? 'always' : 'demand'}
            gl={{ antialias: true, alpha: false }}
          >
            <color args={['#09090b']} attach="background" />
            <ambientLight intensity={0.62} />
            <directionalLight intensity={1.35} position={[4, 6, 3]} />
            <Solid spinning={spinning} />
            <gridHelper args={[10, 20, '#52525b', '#27272a']} />
          </Canvas>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
        )}
      </div>
      <p className="mono truncate border-t border-white/10 px-3 py-2 text-[11px] text-zinc-400">
        {caption ?? 'prompt → editable scene'}
      </p>
    </div>
  )
}
