import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { SuggestionBatch, SuggestionCard } from '@/lib/types'

export interface SuggestionsSlice {
  batches: SuggestionBatch[]
  summary: string
  addBatch: (payload: { timestamp: string; cards: SuggestionCard[]; degraded?: boolean }) => void
  getRecentBatches: (count: number) => SuggestionBatch[]
  setSummary: (summary: string) => void
  clearBatches: () => void
}

export const createSuggestionsSlice: StateCreator<AllSlices, [], [], SuggestionsSlice> = (set, get) => ({
  batches: [],
  summary: '',
  addBatch: ({ timestamp, cards, degraded }) =>
    set((s) => {
      const batchNumber = s.batches.length + 1
      const newBatch: SuggestionBatch = { batchNumber, timestamp, cards, degraded }
      return { batches: [newBatch, ...s.batches] }
    }),
  getRecentBatches: (count) => get().batches.slice(0, Math.max(0, count)),
  setSummary: (summary) => set({ summary }),
  clearBatches: () => set({ batches: [], summary: '' }),
})
