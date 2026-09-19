import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boxFromSize } from '../lib/geometry.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const part = (name, role, assetId, position, scale, color) => ({
  name,
  role,
  assetId,
  position,
  scale,
  color,
  box: boxFromSize(position, scale),
})

const toAction = (entry) => ({
  type: 'place_item',
  name: entry.name,
  role: entry.role,
  assetId: entry.assetId,
  placement: 'explicit',
  position: entry.position,
  scale: entry.scale,
  color: entry.color,
  allowOverlap: true,
})

const assemblies = [
  {
    slug: 'chair',
    set: 'dev',
    parts: [
      part('seat', 'seat', 'primitive-box', [0, 0.42, 0.02], [0.48, 0.05, 0.44], '#c4a574'),
      part('back', 'back', 'primitive-box', [0, 0.47, -0.195], [0.48, 0.43, 0.05], '#b08958'),
      part('leg-fl', 'leg', 'primitive-box', [-0.19, 0, 0.17], [0.05, 0.42, 0.05], '#8b5a2b'),
      part('leg-fr', 'leg', 'primitive-box', [0.19, 0, 0.17], [0.05, 0.42, 0.05], '#8b5a2b'),
      part('leg-bl', 'leg', 'primitive-box', [-0.19, 0, -0.15], [0.05, 0.42, 0.05], '#8b5a2b'),
      part('leg-br', 'leg', 'primitive-box', [0.19, 0, -0.15], [0.05, 0.42, 0.05], '#8b5a2b'),
    ],
  },
  {
    slug: 'table-lamp',
    set: 'dev',
    parts: [
      part('base', 'base', 'primitive-cylinder', [0, 0, 0], [0.22, 0.04, 0.22], '#3f3f46'),
      part('stem', 'stem', 'primitive-cylinder', [0, 0.04, 0], [0.03, 0.32, 0.03], '#71717a'),
      part('shade', 'shade', 'primitive-cone', [0, 0.36, 0], [0.24, 0.16, 0.24], '#fde68a'),
    ],
  },
  {
    slug: 'sailboat',
    set: 'dev',
    parts: [
      part('hull', 'hull', 'primitive-box', [0, 0, 0], [1.4, 0.4, 3.2], '#8b5a2b'),
      part('keel', 'keel', 'primitive-box', [0, 0, 0], [0.12, 0.28, 1.4], '#4a3728'),
      part('mast', 'mast', 'primitive-cylinder', [0, 0.4, 0.15], [0.08, 2.2, 0.08], '#d6c6a8'),
      part('sail', 'sail', 'primitive-wedge', [0.07, 0.55, 0.2], [0.06, 1.9, 1.5], '#f4f1ea'),
    ],
  },
  {
    slug: 'toy-car',
    set: 'dev',
    parts: [
      part('body', 'body', 'primitive-box', [0, 0.2, 0], [1.4, 0.28, 0.58], '#2563eb'),
      part('cabin', 'cabin', 'primitive-box', [-0.15, 0.48, 0], [0.7, 0.2, 0.54], '#93c5fd'),
      part('wheel-fl', 'wheel', 'primitive-box', [0.45, 0, 0.32], [0.22, 0.2, 0.1], '#18181b'),
      part('wheel-fr', 'wheel', 'primitive-box', [0.45, 0, -0.32], [0.22, 0.2, 0.1], '#18181b'),
      part('wheel-rl', 'wheel', 'primitive-box', [-0.45, 0, 0.32], [0.22, 0.2, 0.1], '#18181b'),
      part('wheel-rr', 'wheel', 'primitive-box', [-0.45, 0, -0.32], [0.22, 0.2, 0.1], '#18181b'),
    ],
  },
  {
    slug: 'wall-bracket',
    set: 'dev',
    parts: [
      part('plate', 'plate', 'primitive-box', [0, 0, 0], [0.22, 0.18, 0.02], '#78716c'),
      part('arm', 'arm', 'primitive-box', [0, 0.07, 0.1], [0.04, 0.04, 0.18], '#57534e'),
      part('shelf', 'shelf', 'primitive-box', [0, 0.11, 0.1], [0.2, 0.02, 0.16], '#d6d3d1'),
    ],
  },
  {
    slug: 'dog',
    set: 'dev',
    parts: [
      part('body', 'body', 'primitive-box', [0, 0.22, 0], [0.4, 0.18, 0.18], '#92400e'),
      part('head', 'head', 'primitive-box', [0.26, 0.28, 0], [0.16, 0.14, 0.14], '#b45309'),
      part('leg-fl', 'leg', 'primitive-box', [0.12, 0, 0.08], [0.06, 0.22, 0.06], '#78350f'),
      part('leg-fr', 'leg', 'primitive-box', [0.12, 0, -0.08], [0.06, 0.22, 0.06], '#78350f'),
      part('leg-rl', 'leg', 'primitive-box', [-0.12, 0, 0.08], [0.06, 0.22, 0.06], '#78350f'),
      part('leg-rr', 'leg', 'primitive-box', [-0.12, 0, -0.08], [0.06, 0.22, 0.06], '#78350f'),
      part('tail', 'tail', 'primitive-box', [-0.26, 0.3, 0], [0.14, 0.05, 0.05], '#92400e'),
      part('ear-l', 'ear', 'primitive-box', [0.24, 0.42, 0.05], [0.04, 0.08, 0.03], '#78350f'),
      part('ear-r', 'ear', 'primitive-box', [0.24, 0.42, -0.05], [0.04, 0.08, 0.03], '#78350f'),
    ],
  },
  {
    slug: 'bench',
    set: 'heldOut',
    parts: [
      part('seat', 'seat', 'primitive-box', [0, 0.4, 0], [1.2, 0.05, 0.38], '#a16207'),
      part('leg-fl', 'leg', 'primitive-box', [-0.52, 0, 0.14], [0.06, 0.4, 0.06], '#713f12'),
      part('leg-fr', 'leg', 'primitive-box', [0.52, 0, 0.14], [0.06, 0.4, 0.06], '#713f12'),
      part('leg-bl', 'leg', 'primitive-box', [-0.52, 0, -0.14], [0.06, 0.4, 0.06], '#713f12'),
      part('leg-br', 'leg', 'primitive-box', [0.52, 0, -0.14], [0.06, 0.4, 0.06], '#713f12'),
    ],
  },
  {
    slug: 'mug',
    set: 'heldOut',
    parts: [
      part('body', 'body', 'primitive-cylinder', [0, 0, 0], [0.08, 0.1, 0.08], '#f97316'),
      part('handle', 'handle', 'primitive-box', [0.05, 0.03, 0], [0.02, 0.05, 0.02], '#c2410c'),
    ],
  },
  {
    slug: 'desk-fan',
    set: 'heldOut',
    parts: [
      part('base', 'base', 'primitive-cylinder', [0, 0, 0], [0.2, 0.03, 0.2], '#44403c'),
      part('column', 'stem', 'primitive-cylinder', [0, 0.03, 0], [0.04, 0.18, 0.04], '#78716c'),
      part('motor', 'motor', 'primitive-box', [0, 0.17, 0], [0.08, 0.08, 0.08], '#a8a29e'),
      part('blade-h', 'blade', 'primitive-box', [0, 0.2, 0.06], [0.2, 0.02, 0.04], '#e7e5e4'),
      part('blade-v', 'blade', 'primitive-box', [0, 0.13, 0.06], [0.04, 0.16, 0.02], '#e7e5e4'),
    ],
  },
  {
    slug: 'wheelbarrow',
    set: 'heldOut',
    parts: [
      part('tub', 'tub', 'primitive-box', [0.1, 0.2, 0], [0.7, 0.22, 0.42], '#16a34a'),
      part('wheel', 'wheel', 'primitive-cylinder', [0.48, 0, 0], [0.08, 0.28, 0.28], '#1c1917'),
      part('leg-l', 'leg', 'primitive-box', [-0.22, 0, 0.14], [0.04, 0.2, 0.04], '#365314'),
      part('leg-r', 'leg', 'primitive-box', [-0.22, 0, -0.14], [0.04, 0.2, 0.04], '#365314'),
      part('handle-l', 'handle', 'primitive-box', [-0.1, 0.36, 0.16], [0.7, 0.04, 0.04], '#854d0e'),
      part('handle-r', 'handle', 'primitive-box', [-0.1, 0.36, -0.16], [0.7, 0.04, 0.04], '#854d0e'),
    ],
  },
  {
    slug: 'rocket',
    set: 'heldOut',
    parts: [
      part('body', 'body', 'primitive-cylinder', [0, 0.12, 0], [0.28, 0.9, 0.28], '#dc2626'),
      part('nose', 'nose', 'primitive-cone', [0, 1.02, 0], [0.28, 0.28, 0.28], '#f8fafc'),
      part('fin-n', 'fin', 'primitive-wedge', [0, 0, 0.18], [0.04, 0.2, 0.16], '#0f172a'),
      part('fin-s', 'fin', 'primitive-wedge', [0, 0, -0.18], [0.04, 0.2, 0.16], '#0f172a'),
      part('fin-e', 'fin', 'primitive-wedge', [0.18, 0, 0], [0.16, 0.2, 0.04], '#0f172a'),
      part('fin-w', 'fin', 'primitive-wedge', [-0.18, 0, 0], [0.16, 0.2, 0.04], '#0f172a'),
    ],
  },
  {
    slug: 'bookshelf',
    set: 'heldOut',
    parts: [
      part('side-l', 'side', 'primitive-box', [-0.385, 0, 0], [0.03, 1.2, 0.28], '#9a3412'),
      part('side-r', 'side', 'primitive-box', [0.385, 0, 0], [0.03, 1.2, 0.28], '#9a3412'),
      part('back', 'back', 'primitive-box', [0, 0, -0.13], [0.8, 1.2, 0.02], '#7c2d12'),
      part('shelf-0', 'shelf', 'primitive-box', [0, 0, 0.01], [0.74, 0.03, 0.26], '#fed7aa'),
      part('shelf-1', 'shelf', 'primitive-box', [0, 0.39, 0.01], [0.74, 0.03, 0.26], '#fed7aa'),
      part('shelf-2', 'shelf', 'primitive-box', [0, 0.78, 0.01], [0.74, 0.03, 0.26], '#fed7aa'),
      part('shelf-3', 'shelf', 'primitive-box', [0, 1.17, 0.01], [0.74, 0.03, 0.26], '#fed7aa'),
    ],
  },
]

export const listAssemblies = () => assemblies

export const writeGoldFiles = async () => {
  await mkdir(here, { recursive: true })
  for (const assembly of assemblies) {
    const payload = {
      slug: assembly.slug,
      set: assembly.set,
      frame: {
        up: '+Y',
        front: '+Z',
        right: '+X',
        units: 'meters',
        origin: 'bottom-center',
      },
      parts: assembly.parts,
      actions: assembly.parts.map(toAction),
    }
    await writeFile(path.join(here, `${assembly.slug}.json`), `${JSON.stringify(payload, null, 2)}\n`)
  }
  return assemblies.map((assembly) => assembly.slug)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const slugs = await writeGoldFiles()
  console.log(JSON.stringify({ wrote: slugs }, null, 2))
}
