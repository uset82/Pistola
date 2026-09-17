import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const appNodeModules = path.join(appRoot, 'node_modules')

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@openai/codex', '@openai/codex-sdk'],
  transpilePackages: ['three', '@pascal-app/viewer', '@pascal-app/core', '@pascal-app/editor'],
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
  turbopack: {
    root: appRoot,
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    unoptimized: process.env.NEXT_PUBLIC_ASSETS_CDN_URL?.startsWith('http://localhost') ?? false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
