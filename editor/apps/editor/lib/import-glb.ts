export const GLTF_IMPORT_HINT = 'Use Open on a .glb or .gltf file to import a mesh.'

export type AxisBounds = {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

const GLTF_MAGIC = [0x67, 0x6c, 0x54, 0x46] as const

export const isGltfFileName = (name: string) => /\.(glb|gltf)$/i.test(name.trim())

export const isGltfMagic = (bytes: ArrayLike<number>) =>
  bytes.length >= 4 && GLTF_MAGIC.every((byte, index) => bytes[index] === byte)

const isPistolaNodeMap = (nodes: unknown) =>
  Boolean(nodes) && typeof nodes === 'object' && !Array.isArray(nodes)

/** glTF JSON (`asset.version` + `meshes`) that must not be loaded as a Pistola scene graph. */
export const isGltfJsonDocument = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const doc = value as { asset?: { version?: unknown }; meshes?: unknown; nodes?: unknown }
  if (isPistolaNodeMap(doc.nodes)) return false
  return typeof doc.asset?.version === 'string' && doc.asset.version.length > 0 && Array.isArray(doc.meshes)
}

export const textLooksLikeGltf = (text: string) => text.trimStart().startsWith('glTF')

export const fileLooksLikeGltf = async (file: File) => {
  if (isGltfFileName(file.name)) return true
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  return isGltfMagic(head)
}

/** Width, height, depth. Null when the bounds are empty or non-finite. */
export const dimensionsFromBounds = (bounds: AxisBounds): [number, number, number] | null => {
  const size: [number, number, number] = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ]
  if (size.some((value) => !Number.isFinite(value) || value < 0)) return null
  if (size.every((value) => value === 0)) return null
  return size
}

/** Bottom-center the mesh on the item origin, matching catalog item placement. */
export const floorOffsetFromBounds = (bounds: AxisBounds): [number, number, number] => {
  const centerX = (bounds.min.x + bounds.max.x) / 2
  const centerZ = (bounds.min.z + bounds.max.z) / 2
  return [-centerX, -bounds.min.y, -centerZ]
}
