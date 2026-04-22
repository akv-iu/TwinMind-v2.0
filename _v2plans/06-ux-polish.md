# Plan 06 — UX Polish

## Summary
Fix the settings modal silent-commit bug. Persist the API key across tab reloads. Clean up dead code. Small fixes only — nothing that risks regressions.

## Dependencies
- **None.** Independent of all other plans. Can run any time.

## Files touched
1. [twinmind-app/components/settings/SettingsModal.tsx](twinmind-app/components/settings/SettingsModal.tsx)
2. [twinmind-app/store/index.ts](twinmind-app/store/index.ts) — add `persist` middleware
3. [twinmind-app/store/settingsSlice.ts](twinmind-app/store/settingsSlice.ts) — partialize hook
4. [twinmind-app/lib/hooks/useAudioRecorder.ts](twinmind-app/lib/hooks/useAudioRecorder.ts) — remove dead `inFlightCountRef`
5. [twinmind-app/components/transcript/TranscriptColumn.tsx](twinmind-app/components/transcript/TranscriptColumn.tsx) — sanity-check for dead imports
6. [twinmind-app/components/chat/ChatBubble.tsx](twinmind-app/components/chat/ChatBubble.tsx) — already simplified in Plan 04

## 6.1 Settings modal: cancel on dismiss (15 min)
In `components/settings/SettingsModal.tsx`:
- Change the backdrop `<button aria-label="Close settings" onClick={handleSave} ...>` to `onClick={onClose}`.
- Change the `<X>` button handler from `handleSave` to `onClose`.
- Add a "dirty" indicator:
  ```ts
  const hasChanges =
    draft.groqApiKey !== groqApiKey ||
    draft.chatPrompt !== chatPrompt ||
    draft.suggestContextChars !== suggestContextChars ||
    draft.chatContextChars !== chatContextChars ||
    JSON.stringify(draft.suggestIntentPrompts) !== JSON.stringify(suggestIntentPrompts)
  ```
  Render a zinc-500 `•` next to the `Settings` header text when `hasChanges` is true.
- Update the footer caption from *"Changes are saved when you press Save, close with X, or click outside."* to *"Unsaved changes are discarded on Cancel, X, or click outside. Press Save to apply."*.

## 6.2 API key persistence — sessionStorage (30 min)
In `store/index.ts`, wrap the store creator with `persist`:
```ts
import { persist, createJSONStorage } from 'zustand/middleware'

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
      partialize: (state) => ({
        groqApiKey: state.groqApiKey,
        suggestIntentPrompts: state.suggestIntentPrompts,
        chatPrompt: state.chatPrompt,
        suggestContextChars: state.suggestContextChars,
        chatContextChars: state.chatContextChars,
      }),
    },
  ),
)
```
- `sessionStorage` → survives reload within the same tab, cleared on tab close. Aligns with the spec's "session-only" phrasing without forcing re-paste on every reload during testing.
- `partialize` keeps ephemeral state (transcript, batches, chat) out of storage.

Handle SSR safely: `createJSONStorage(() => sessionStorage)` returns `undefined` on the server (Zustand handles this gracefully, no-op persistence during SSR).

## 6.3 Remove client merged-prompt console.log (already in Plan 03)
Cross-reference: the `console.log('[suggest] merged prompt...')` block in `SuggestionsColumn.tsx` lines 55–68 is deleted by Plan 03. Re-verify it's gone here.

## 6.4 Dead code cleanup (30 min)
- **`inFlightCountRef` in `useAudioRecorder.ts`**: the serial upload queue guarantees ≤1 in-flight. Remove the ref, replace its usages with direct `setIsProcessing(true)` at the start of `sendChunk` and `setIsProcessing(false)` in `finally`.
- **Unused `useAutoScroll` in `TranscriptColumn.tsx`**: verify — the hook is imported in `TranscriptPanel.tsx`, not in `TranscriptColumn.tsx`. If there's no import there, skip this step.
- **`finaliseLastMessage` as no-op**: already promoted to real in Plan 04. Re-verify.
- **`maskApiKey` helper in `suggest/route.ts`**: Plan 05 removes its caller. Delete the function.

## 6.5 Error message consistency (15 min)
Standardize user-facing error copy:
- Transcribe retries exhausted: *"Transcription failed — check your network or Groq status."*
- Suggest route failure: *"Couldn't load suggestions. Next auto-refresh in 30s."*
- Chat stream interrupted: handled in Plan 04 (inline `⚠ Response interrupted.`).
- Rate limited: *"Too many requests — wait a minute."*
- Invalid key: *"Invalid Groq key format."*

## 6.6 Chat streaming scroll (already in Plan 04)
Cross-reference: rAF-throttled scroll landed in Plan 04.

## Acceptance criteria
- [ ] Click outside settings modal with unsaved changes → changes are discarded, not committed.
- [ ] X button behaves the same as Cancel.
- [ ] Dirty indicator appears when any field differs from committed state; disappears after Save.
- [ ] Paste key, reload tab → key persists, mic works without re-paste.
- [ ] Close tab, reopen app → key is gone, modal shows empty key field.
- [ ] `grep "inFlightCountRef" twinmind-app/` returns zero matches.
- [ ] No `console.log` with `transcript`, `prompt`, `apiKey`, or `messages` in any client file.

## Time estimate
**2 hours**.

## Risk
Very low. Only concrete risk: the zustand persist middleware can throw during SSR hydration if not guarded. The `createJSONStorage(() => sessionStorage)` pattern is Zustand's recommended SSR-safe form, so this is handled.
