import { serializeSceneToIfc, type AnyNode } from '@pascal-app/core'

type ExportIfcScene = {
  nodes: Record<string, AnyNode>
  rootNodeIds: string[]
  projectName?: string
}

const resolveProjectName = (
  nodes: Record<string, AnyNode>,
  rootNodeIds: string[],
  projectName?: string,
) => {
  if (projectName?.trim()) {
    return projectName.trim()
  }

  for (const rootNodeId of rootNodeIds) {
    const nodeName = nodes[rootNodeId]?.name?.trim()
    if (nodeName) {
      return nodeName
    }
  }

  const spatialNode = Object.values(nodes).find(
    (node) => (node.type === 'site' || node.type === 'building') && node.name?.trim(),
  )

  return spatialNode?.name?.trim() || undefined
}

export function downloadIfcScene({ nodes, rootNodeIds, projectName }: ExportIfcScene) {
  const ifc = serializeSceneToIfc(nodes, rootNodeIds, {
    projectName: resolveProjectName(nodes, rootNodeIds, projectName),
  })
  const blob = new Blob([ifc], { type: 'application/x-step' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().split('T')[0]

  link.href = url
  link.download = `scene_${date}.ifc`
  link.click()

  URL.revokeObjectURL(url)
}
