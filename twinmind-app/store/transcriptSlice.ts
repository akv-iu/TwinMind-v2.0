import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { TranscriptLine } from '@/lib/types'

export interface TranscriptSlice {
  transcriptLines: TranscriptLine[]
  isTranscribing: boolean
  addTranscriptLine: (line: Omit<TranscriptLine, 'id'>) => void
  setTranscribing: (value: boolean) => void
  clearTranscript: () => void
}

export const createTranscriptSlice: StateCreator<AllSlices, [], [], TranscriptSlice> = (set) => ({
  transcriptLines: [],
  isTranscribing: false,
  addTranscriptLine: (line) =>
    set((s) => ({
      transcriptLines: [...s.transcriptLines, { ...line, id: crypto.randomUUID() }],
    })),
  setTranscribing: (value) => set({ isTranscribing: value }),
  clearTranscript: () => set({ transcriptLines: [] }),
})
