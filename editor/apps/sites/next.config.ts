import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const appNodeModules = path.join(appRoot, 'node_modules')

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ASSETS_CDN_URL: '',
    // The static Sites build calls the Canner-hosted editor API for native
    // FreeCAD and Multi-Agent-CAD work. This is intentionally public: auth
    // remains enforced by the Canner API session, never by a bundled secret.
    NEXT_PUBLIC_PISTOLA_API_BASE:
      process.env.NEXT_PUBLIC_PISTOLA_API_BASE || 'https://pistola.canner.app',
  },
  images: {
    unoptimized: true,
  },
  output: 'export',
  outputFileTracingRoot: path.resolve(appRoot, '../..'),
  transpilePackages: [
    '@pascal-app/viewer',
    '@pascal-app/core',
    '@pascal-app/editor',
    '@pascal-app/nodes',
  ],
  webpack: (config) => {
    config.resolve ??= {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      three$: path.join(appNodeModules, 'three', 'build', 'three.module.js'),
      'three/webgpu': path.join(appNodeModules, 'three', 'build', 'three.webgpu.js'),
      'three/tsl': path.join(appNodeModules, 'three', 'build', 'three.tsl.js'),
      '@react-three/fiber': path.join(appNodeModules, '@react-three', 'fiber'),
      '@react-three/drei': path.join(appNodeModules, '@react-three', 'drei'),
    }

    return config
  },
}

export default nextConfig
