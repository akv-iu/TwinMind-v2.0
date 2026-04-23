import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createTranscriptSlice, type TranscriptSlice } from './transcriptSlice'
import { createSuggestionsSlice, type SuggestionsSlice } from './suggestionsSlice'
import { createChatSlice, type ChatSlice } from './chatSlice'
import {
  createSettingsSlice,
  partializeSettingsState,
  type SettingsSlice,
} from './settingsSlice'

export type AllSlices = TranscriptSlice & SuggestionsSlice & ChatSlice & SettingsSlice

export const useStore = create<AllSlices>()(
  persist(
    (...a) => ({
      ...createTranscriptSlice(...a),
      ...createSuggestionsSlice(...a),
      ...createChatSlice(...a),
      ...createSettingsSlice(...a),
    }),
    {
      name: 'twinmind-settings',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => partializeSettingsState(state),
    },
  ),
)
