export type TriangleMesh = {
  positions: number[]
  indices: number[]
}

const pushBox = (positions: number[], indices: number[], min: [number, number, number], max: [number, number, number]) => {
  const corners: Array<[number, number, number]> = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]],
  ]
  const start = positions.length / 3
  for (const corner of corners) positions.push(...corner)
  const faces = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [3, 2, 6, 7],
    [0, 3, 7, 4],
    [1, 5, 6, 2],
  ]
  for (const face of faces) {
    const a = face[0] ?? 0
    const b = face[1] ?? 0
    const c = face[2] ?? 0
    const d = face[3] ?? 0
    indices.push(start + a, start + b, start + c, start + a, start + c, start + d)
  }
}

export const boxMeshFromSize = (width: number, height: number, depth: number): TriangleMesh => {
  const positions: number[] = []
  const indices: number[] = []
  pushBox(positions, indices, [-width / 2, 0, -depth / 2], [width / 2, height, depth / 2])
  return { positions, indices }
}

const rotateXyz = (x: number, y: number, z: number, rotation: [number, number, number]): [number, number, number] => {
  let [px, py, pz] = [x, y, z]
  if (rotation[0]) {
    const c = Math.cos(rotation[0])
    const s = Math.sin(rotation[0])
    ;[py, pz] = [py * c - pz * s, py * s + pz * c]
  }
  if (rotation[1]) {
    const c = Math.cos(rotation[1])
    const s = Math.sin(rotation[1])
    ;[px, pz] = [px * c + pz * s, -px * s + pz * c]
  }
  if (rotation[2]) {
    const c = Math.cos(rotation[2])
    const s = Math.sin(rotation[2])
    ;[px, py] = [px * c - py * s, px * s + py * c]
  }
  return [px, py, pz]
}

const latheMesh = (
  radius: (t: number) => number,
  height: number,
  segs = 16,
  stacks = 8,
): TriangleMesh => {
  const positions: number[] = []
  const indices: number[] = []
  for (let iy = 0; iy <= stacks; iy += 1) {
    const t = iy / stacks
    const y = t * height
    const r = radius(t)
    for (let ix = 0; ix <= segs; ix += 1) {
      const a = (ix / segs) * Math.PI * 2
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r)
    }
  }
  const stride = segs + 1
  for (let iy = 0; iy < stacks; iy += 1) {
    for (let ix = 0; ix < segs; ix += 1) {
      const a = iy * stride + ix
      const b = a + stride
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { positions, indices }
}

const sphereMesh = (width: number, height: number, depth: number): TriangleMesh => {
  const rx = width / 2
  const ry = height / 2
  const rz = depth / 2
  const segs = 16
  const stacks = 10
  const positions: number[] = []
  const indices: number[] = []
  for (let iy = 0; iy <= stacks; iy += 1) {
    const v = iy / stacks
    const phi = v * Math.PI
    for (let ix = 0; ix <= segs; ix += 1) {
      const u = ix / segs
      const theta = u * Math.PI * 2
      positions.push(
        rx * Math.sin(phi) * Math.cos(theta),
        ry + ry * Math.cos(phi),
        rz * Math.sin(phi) * Math.sin(theta),
      )
    }
  }
  const stride = segs + 1
  for (let iy = 0; iy < stacks; iy += 1) {
    for (let ix = 0; ix < segs; ix += 1) {
      const a = iy * stride + ix
      const b = a + stride
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { positions, indices }
}

const torusMesh = (width: number, height: number): TriangleMesh => {
  const R = width / 2
  const r = Math.max(0.02, height / 4)
  const tube = 12
  const radial = 24
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= radial; i += 1) {
    const u = (i / radial) * Math.PI * 2
    for (let j = 0; j <= tube; j += 1) {
      const v = (j / tube) * Math.PI * 2
      const cx = Math.cos(u)
      const cz = Math.sin(u)
      positions.push((R + r * Math.cos(v)) * cx, r + r * Math.sin(v), (R + r * Math.cos(v)) * cz)
    }
  }
  const stride = tube + 1
  for (let i = 0; i < radial; i += 1) {
    for (let j = 0; j < tube; j += 1) {
      const a = i * stride + j
      const b = a + stride
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { positions, indices }
}

const capsuleMesh = (width: number, height: number): TriangleMesh => {
  const r = width / 2
  const cyl = Math.max(0.01, height - width)
  const hemi = latheMesh(() => r, r, 16, 6)
  const mid = latheMesh(() => r, cyl, 16, 2)
  const positions: number[] = []
  const indices: number[] = []
  const append = (mesh: TriangleMesh, dy: number, flipY = false) => {
    const start = positions.length / 3
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const y = mesh.positions[i + 1] ?? 0
      positions.push(
        mesh.positions[i] ?? 0,
        dy + (flipY ? -y : y),
        mesh.positions[i + 2] ?? 0,
      )
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] ?? 0
      const b = mesh.indices[i + 1] ?? 0
      const c = mesh.indices[i + 2] ?? 0
      if (flipY) indices.push(start + a, start + c, start + b)
      else indices.push(start + a, start + b, start + c)
    }
  }
  append(hemi, r, true)
  append(mid, r)
  append(hemi, r + cyl)
  return { positions, indices }
}

const wedgeMesh = (width: number, height: number, depth: number): TriangleMesh => {
  const hw = width / 2
  const hd = depth / 2
  const positions = [
    -hw, 0, -hd,
    hw, 0, -hd,
    -hw, 0, hd,
    hw, 0, hd,
    -hw, height, -hd,
    hw, height, -hd,
  ]
  const indices = [0, 2, 3, 0, 3, 1, 0, 1, 5, 0, 5, 4, 0, 4, 2, 1, 3, 5, 2, 4, 5, 2, 5, 3]
  return { positions, indices }
}

export const primitiveMesh = (kind: string, size: [number, number, number]): TriangleMesh => {
  const [w, h, d] = size
  const type = kind.replace(/^primitive-/, '')
  if (type === 'sphere') return sphereMesh(w, h, d)
  if (type === 'cylinder') return latheMesh((t) => (t === 0 || t === 1 ? w / 2 : Math.max(w, d) / 2), h)
  if (type === 'cone') return latheMesh((t) => ((1 - t) * w) / 2, h)
  if (type === 'torus') return torusMesh(w, h)
  if (type === 'capsule') return capsuleMesh(w, h)
  if (type === 'wedge') return wedgeMesh(w, h, d)
  return boxMeshFromSize(w, h, d)
}

export const meshBounds = (positions: number[]) => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    min[0] = Math.min(min[0], positions[i] ?? Infinity)
    min[1] = Math.min(min[1], positions[i + 1] ?? Infinity)
    min[2] = Math.min(min[2], positions[i + 2] ?? Infinity)
    max[0] = Math.max(max[0], positions[i] ?? -Infinity)
    max[1] = Math.max(max[1], positions[i + 1] ?? -Infinity)
    max[2] = Math.max(max[2], positions[i + 2] ?? -Infinity)
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as [number, number, number] }
}

export const transformMesh = (
  mesh: TriangleMesh,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
): TriangleMesh => {
  const positions: number[] = []
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = rotateXyz(
      (mesh.positions[i] ?? 0) * scale[0],
      (mesh.positions[i + 1] ?? 0) * scale[1],
      (mesh.positions[i + 2] ?? 0) * scale[2],
      rotation,
    )
    positions.push(x + position[0], y + position[1], z + position[2])
  }
  return { positions, indices: [...mesh.indices] }
}
