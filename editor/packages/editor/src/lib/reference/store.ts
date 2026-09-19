import { create } from 'zustand'
import type { ReferenceRecord } from './types'

type ReferenceState = {
  active: ReferenceRecord | null
  setActive: (record: ReferenceRecord) => void
  clear: () => void
}

export const useReferenceStore = create<ReferenceState>((set) => ({
  active: null,
  setActive: (record) => set({ active: record }),
  clear: () => set({ active: null }),
}))
