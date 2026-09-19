export const MANIFOLD_KERNEL_STATUS = {
  chosen: false,
  alternative: 'three-bvh-csg',
  reason:
    'three-bvh-csg is already a Sites-safe dependency of @pascal-app/core. manifold-3d would add a WASM fetch that static hosts can fail; the local kernel now uses three-bvh-csg and throws instead of faking a cut.',
} as const
