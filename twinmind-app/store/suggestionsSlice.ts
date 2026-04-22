import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { SuggestionBatch, SuggestionCard } from '@/lib/types'

export interface SuggestionsSlice {
  batches: SuggestionBatch[]
  addBatch: (payload: { timestamp: string; cards: SuggestionCard[] }) => void
  clearBatches: () => void
}

export const createSuggestionsSlice: StateCreator<AllSlices, [], [], SuggestionsSlice> = (set) => ({
  batches: [],
  addBatch: ({ timestamp, cards }) =>
    set((s) => {
      const batchNumber = s.batches.length + 1
      const newBatch: SuggestionBatch = { batchNumber, timestamp, cards }
      return { batches: [newBatch, ...s.batches] }
    }),
  clearBatches: () => set({ batches: [] }),
})
