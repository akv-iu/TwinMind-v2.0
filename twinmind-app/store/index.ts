import { create } from 'zustand'
import { createTranscriptSlice, type TranscriptSlice } from './transcriptSlice'
import { createSuggestionsSlice, type SuggestionsSlice } from './suggestionsSlice'
import { createChatSlice, type ChatSlice } from './chatSlice'
import { createSettingsSlice, type SettingsSlice } from './settingsSlice'

export type AllSlices = TranscriptSlice & SuggestionsSlice & ChatSlice & SettingsSlice

export const useStore = create<AllSlices>()((...a) => ({
  ...createTranscriptSlice(...a),
  ...createSuggestionsSlice(...a),
  ...createChatSlice(...a),
  ...createSettingsSlice(...a),
}))
