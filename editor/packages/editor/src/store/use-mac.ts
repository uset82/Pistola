import { create } from 'zustand'
import { fetchMacHealth, type MacHelperHealth } from '../lib/mac/client'
import { generateMacPart } from '../lib/mac/generate-part'

type MacHelperStatus = 'unknown' | 'checking' | 'ready' | 'busy' | 'error'

export const macHelperUnavailableMessage =
  'MAC helper unavailable. Multi-Agent-CAD could not be reached.'

type MacState = {
  helperStatus: MacHelperStatus
  helperInfo: MacHelperHealth | null
  lastError: string | null
  activeJobId: string | null
  generateStatus: string | null
  refreshHealth: () => Promise<void>
  generatePart: (prompt: string) => Promise<string | null>
}

const getMacUnavailableMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : macHelperUnavailableMessage

const useMac = create<MacState>()((set) => ({
  helperStatus: 'unknown',
  helperInfo: null,
  lastError: null,
  activeJobId: null,
  generateStatus: null,
  refreshHealth: async () => {
    set({ helperStatus: 'checking', lastError: null })
    try {
      const helperInfo = await fetchMacHealth()
      set({
        helperInfo,
        helperStatus: helperInfo.status === 'ready' ? 'ready' : 'error',
        lastError: helperInfo.error || null,
      })
    } catch (error) {
      set({
        helperInfo: null,
        helperStatus: 'error',
        activeJobId: null,
        lastError: getMacUnavailableMessage(error),
      })
    }
  },
  generatePart: async (prompt) => {
    set({ helperStatus: 'busy', lastError: null, generateStatus: 'Sending MAC job…' })
    try {
      const result = await generateMacPart(prompt)
      set({
        helperStatus: 'ready',
        activeJobId: result.jobId,
        lastError: null,
        generateStatus: result.bodyId ? `Created MAC body ${result.bodyId}.` : 'MAC job finished.',
      })
      return result.bodyId
    } catch (error) {
      set({
        helperStatus: 'error',
        activeJobId: null,
        lastError: getMacUnavailableMessage(error),
        generateStatus: getMacUnavailableMessage(error),
      })
      return null
    }
  },
}))

export default useMac
