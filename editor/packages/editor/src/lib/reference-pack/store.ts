import { create } from 'zustand'
import type { ReferencePack } from './reference-pack'

/**
 * Deliberately in-memory: image pixels live in the host's asset system, while
 * the editor retains only the validated, portable reference metadata.
 */
type ReferencePackState = {
  pack: ReferencePack | null
  setPack: (pack: ReferencePack) => void
  clearPack: () => void
}

export const useReferencePackStore = create<ReferencePackState>((set) => ({
  pack: null,
  setPack: (pack) => set({ pack }),
  clearPack: () => set({ pack: null }),
}))
