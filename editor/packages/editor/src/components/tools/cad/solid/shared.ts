import type { CadBodyNode } from '@pascal-app/core'

export const getCadBodyEdgeRefs = (body: CadBodyNode): string[] => {
  if (body.preview.primitive === 'cylinder') {
    return ['edge-top', 'edge-bottom', 'edge-side']
  }

  return Array.from({ length: 12 }, (_, index) => `edge-${index + 1}`)
}
