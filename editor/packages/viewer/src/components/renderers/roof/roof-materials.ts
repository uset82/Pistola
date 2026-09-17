import * as THREE from 'three'

// Production materials — match the rest of the scene (white walls, light-gray slabs).
// Indices: 0 = Wall/Trim, 1 = Deck, 2 = Interior, 3 = Shingle
// Indices 4–5 are guard entries so the initial BoxGeometry placeholder (which always
// has 6 face-groups, materialIndex 0–5) never resolves to undefined and crashes the
// WebGPU renderer / MeshBVH with "Cannot read properties of undefined (reading 'side')".
export const roofMaterials: THREE.Material[] = [
  new THREE.MeshStandardMaterial({ color: 'white', roughness: 1, side: THREE.DoubleSide }), // 0: Wall/Trim
  new THREE.MeshStandardMaterial({ color: '#e5e5e5', roughness: 1, side: THREE.FrontSide }), // 1: Deck
  new THREE.MeshStandardMaterial({ color: 'white', roughness: 1, side: THREE.DoubleSide }), // 2: Interior
  new THREE.MeshStandardMaterial({ color: '#e5e5e5', roughness: 0.9, side: THREE.FrontSide }), // 3: Shingle
  new THREE.MeshStandardMaterial({ color: 'white', roughness: 1, side: THREE.DoubleSide }), // 4: guard (Wall/Trim alias)
  new THREE.MeshStandardMaterial({ color: 'white', roughness: 1, side: THREE.DoubleSide }), // 5: guard (Wall/Trim alias)
]

// Debug materials — vivid, distinct colours to identify each surface group.
// Indices 4–5 are guard entries for the same BoxGeometry reason as above.
export const roofDebugMaterials: THREE.Material[] = [
  new THREE.MeshStandardMaterial({ color: '#eaeaea', roughness: 0.8, side: THREE.DoubleSide }), // 0: Wall
  new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.9, side: THREE.FrontSide }), // 1: Deck
  new THREE.MeshStandardMaterial({ color: '#dddddd', roughness: 0.9, side: THREE.DoubleSide }), // 2: Interior
  new THREE.MeshStandardMaterial({ color: '#4ade80', roughness: 0.9, side: THREE.FrontSide }), // 3: Shingle
  new THREE.MeshStandardMaterial({ color: '#eaeaea', roughness: 0.8, side: THREE.DoubleSide }), // 4: guard (Wall alias)
  new THREE.MeshStandardMaterial({ color: '#eaeaea', roughness: 0.8, side: THREE.DoubleSide }), // 5: guard (Wall alias)
]
