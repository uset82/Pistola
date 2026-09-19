type CadBodyPreviewSource = {
  warnings: string[]
  artifacts?: {
    previewUrl?: string | null
  }
  previewArtifactRef?: string | null
  metadata?: unknown
}

export const isRenderableCadAssetUrl = (url: string | null | undefined) =>
  Boolean(url && (url.startsWith('/') || url.startsWith('http')) && /\.(glb|gltf)(\?.*)?$/i.test(url))

const readMacEngine = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }
  const macMetadata = (metadata as { macMetadata?: unknown }).macMetadata
  if (!macMetadata || typeof macMetadata !== 'object' || Array.isArray(macMetadata)) {
    return null
  }
  const engine = (macMetadata as { engine?: unknown }).engine
  return typeof engine === 'string' ? engine : null
}

type CadBodyPreviewGeometry = {
  primitive: 'box' | 'cylinder' | 'extruded-profile' | 'mesh'
  dimensions?: [number, number, number]
  radius?: number
  height?: number
  points?: [number, number][]
  positions?: number[]
  indices?: number[]
  normals?: number[]
  roughness?: number
  metalness?: number
  opacity?: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const cadBodyHasRenderableMesh = (preview?: CadBodyPreviewGeometry | null) =>
  preview?.primitive === 'mesh' && (preview.positions?.length ?? 0) >= 9 && (preview.indices?.length ?? 0) >= 3

export const cadMeshGeometryFromPreview = (preview?: CadBodyPreviewGeometry | null) => {
  if (!cadBodyHasRenderableMesh(preview) || !preview?.positions) return null
  const normals =
    preview.normals && preview.normals.length === preview.positions.length ? preview.normals : undefined
  return {
    positions: preview.positions,
    indices: preview.indices ?? [],
    normals,
  }
}

type CadBodyPbrSource = {
  roughness?: number
  metalness?: number
  opacity?: number
  preview?: unknown
}

const previewPbr = (preview: unknown) => {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return {}
  const source = preview as Record<string, unknown>
  return {
    roughness: typeof source.roughness === 'number' ? source.roughness : undefined,
    metalness: typeof source.metalness === 'number' ? source.metalness : undefined,
    opacity: typeof source.opacity === 'number' ? source.opacity : undefined,
  }
}

export const cadBodyPbr = (node: CadBodyPbrSource) => {
  const preview = previewPbr(node.preview)
  const roughness = clamp01(node.roughness ?? preview.roughness ?? 0.45)
  const metalness = clamp01(node.metalness ?? preview.metalness ?? 0.15)
  const opacity = clamp01(node.opacity ?? preview.opacity ?? 1)
  return {
    roughness,
    metalness,
    opacity,
    transparent: opacity < 1 - 1e-6,
  }
}

const meshBounds = (positions: number[]): [number, number, number] => {
  if (positions.length < 3) return [1, 1, 1]
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0
    const y = positions[i + 1] ?? 0
    const z = positions[i + 2] ?? 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  return [Math.max(0.2, maxX - minX), Math.max(0.2, maxY - minY), Math.max(0.2, maxZ - minZ)]
}

export const getCadBodyPlaceholderDimensions = (preview: CadBodyPreviewGeometry): [number, number, number] => {
  if (preview.primitive === 'box' && preview.dimensions) return preview.dimensions
  if (preview.primitive === 'cylinder') {
    return [(preview.radius ?? 0.5) * 2, preview.height ?? 1, (preview.radius ?? 0.5) * 2]
  }
  if (preview.primitive === 'mesh') return meshBounds(preview.positions ?? [])
  const points = preview.points ?? []
  if (points.length === 0) return [1, preview.height ?? 1, 1]
  return [
    Math.max(...points.map((point) => point[0])) - Math.min(...points.map((point) => point[0])),
    preview.height ?? 1,
    Math.max(...points.map((point) => point[1])) - Math.min(...points.map((point) => point[1])),
  ]
}

export const shouldUseCadBodyAssetPreview = (node: CadBodyPreviewSource) => {
  const warnings = node.warnings.join(' ').toLowerCase()
  if (
    warnings.includes('placeholder artifact') ||
    warnings.includes('mock runtime') ||
    warnings.includes('mock mode') ||
    warnings.includes('mac-mock')
  ) {
    return false
  }

  if (readMacEngine(node.metadata) === 'mac-mock') {
    return false
  }

  return isRenderableCadAssetUrl(node.artifacts?.previewUrl || node.previewArtifactRef || null)
}
