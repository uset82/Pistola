export type InvokeArgs = unknown

export type PageDriver = {
  kind: 'browser' | 'bridge'
  target: { name: string; url: string }
  apiVersion: number | null
  forbiddenCount: () => number
  forbiddenHits: () => { method: string; url: string; reason: string }[]
  open: (options?: { launch?: boolean }) => Promise<
    { url: string; apiVersion: number; signInRequired: boolean } & Record<string, unknown>
  >
  invoke: (method: string, args?: InvokeArgs) => Promise<unknown>
  screenshot: () => Promise<{ mime: string; data: string }>
  close?: () => Promise<void>
}
