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
