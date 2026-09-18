import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import './globals.css'
import { DevToolsLoader } from './dev-tools-loader'

const enableDevToolsOverlay = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === '1'

const fontVariables: CSSProperties &
  Record<'--font-geist-sans' | '--font-geist-mono' | '--font-barlow', string> = {
  '--font-geist-sans': 'ui-sans-serif, system-ui, sans-serif',
  '--font-geist-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  '--font-barlow': 'ui-sans-serif, system-ui, sans-serif',
}

export const metadata: Metadata = {
  title: 'Pistola',
  description: 'From idea to prototype. Chat-driven 3D scenes and CAD.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      style={fontVariables}
      suppressHydrationWarning
    >
      <body className="font-sans" suppressHydrationWarning>
        {children}
        {process.env.NODE_ENV === 'development' && enableDevToolsOverlay && <DevToolsLoader />}
      </body>
    </html>
  )
}
