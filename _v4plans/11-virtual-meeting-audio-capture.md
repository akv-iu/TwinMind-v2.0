# Plan 11 — Virtual Meeting Audio Capture (System Audio Mix)

## Summary

Add an optional "Virtual meeting mode" so the app captures both microphone and remote-participant audio during same-device meetings (Teams, Zoom, Google Meet). Today the recorder uses `getUserMedia` (mic-only), which misses everything coming through speakers or headphones. The fix mixes a `getDisplayMedia` system-audio stream with the mic stream via the Web Audio API and feeds the combined result into the existing recorder cycle — no changes to the transcription pipeline, API routes, or store.

Target behaviour:
- Default mode stays mic-only (in-person meetings, separate-device setup).
- User enables "Virtual meeting" toggle before starting recording.
- On Windows/Chrome (primary target): full system audio + mic captured.
- On Mac/Chrome: browser tab audio + mic captured (native app audio blocked by macOS).
- On unsupported browsers (Safari, Firefox): toggle hidden or disabled with a clear message.
- All three acquisition failure cases handled explicitly (see Edge Cases below).

---

## Key Implementation Changes

### 1. `useAudioRecorder.ts` — new refs

Add two refs alongside the existing ones:

- `systemStreamRef: MediaStreamRef` — holds the `getDisplayMedia` stream so it can be stopped cleanly on session end.
- `audioContextRef: AudioContextRef` — holds the mixing `AudioContext` so it can be closed on stop (prevents accumulation across sessions).

### 2. `useAudioRecorder.ts` — modify `stopStreamTracks`

Currently stops only the mic stream. After the change it also:
- Stops all tracks on `systemStreamRef.current`.
- Calls `audioContextRef.current?.close()` and nulls the ref.

### 3. `useAudioRecorder.ts` — new function `startRecordingWithSystemAudio`

Acquisition sequence (strict order — display stream first to keep cleanup simple):

**Step 1 — Browser support check**
If `navigator.mediaDevices.getDisplayMedia` is absent or audio capture is unsupported, call `setError` with a user-facing message and return. No streams opened.

**Step 2 — Acquire display stream**
Call `getDisplayMedia({ audio: true, video: false })`.

- **Edge Case 1 — User dismisses the share dialog:**
  `getDisplayMedia` throws `NotAllowedError`. Catch it specifically, call `setError("Sharing cancelled — switch to Mic Only or try again.")`, return. Nothing else was opened so no cleanup is needed.

- **Edge Case 2 — User shares without enabling audio:**
  `getDisplayMedia` resolves but `displayStream.getAudioTracks().length === 0`. Stop the display stream immediately (it may still hold a video track on some browsers). Call `setError("No audio was shared. Try again and check 'Also share system audio' in the dialog.")`, return.

**Step 3 — Acquire mic stream**
Call `getUserMedia({ audio: true })`. If this fails, stop the display stream first, then surface the mic error via `setError`.

**Step 4 — Mix streams**
Create `AudioContext` inside this function (not at hook-init time — avoids autoplay-policy suspension).
Connect mic source and display audio source to a `MediaStreamDestinationNode`.
Store the context in `audioContextRef`. Store the display stream in `systemStreamRef`.

**Step 5 — Attach Edge Case 3 handler**
Get `displayStream.getAudioTracks()[0]`. On its `ended` event (user clicks "Stop sharing" in the browser toolbar mid-session):
- Call `setError("System audio sharing was stopped — recording ended.")`.
- Set `shouldRecordRef.current = false`.
- Stop the active `MediaRecorder` → `onstop` fires → `stopStreamTracks` cleans mic + display stream + AudioContext.
- Set `isRecording(false)`.

**Step 6 — Start recorder cycle**
Feed the `AudioContext` destination's `MediaStream` into the existing `startRecorderCycle()`. No changes to that function.

**Step 7 — Attach existing mic track listeners**
Re-use the existing `attachMicTrackListeners` call from `startRecording` for mute/unmute/disconnect handling on the mic track.

### 4. `useAudioRecorder.ts` — hook return value

Add one export alongside the existing ones:
```
startRecordingWithSystemAudio: () => Promise<void>
```
`startRecording` (mic-only) is untouched.

### 5. `TranscriptColumn.tsx` — mode toggle state

Add local state:
```
audioMode: 'mic' | 'virtual'   default: 'mic'
```
Toggle is **disabled while `isRecording` is true** — mode cannot be switched mid-session.

### 6. `TranscriptColumn.tsx` — toggle UI

Placed between the mic button and the export button. Two-segment control:
```
[ Mic Only ]   [ Virtual Meeting (Teams / Zoom / Meet) ]
```

**Platform warnings** shown below the toggle (not blocking errors):

- On Mac (`navigator.platform.startsWith('Mac')`):
  > "On Mac, this captures browser tab audio only. For Teams or Zoom, use the browser version."

- On unsupported browser (no `getDisplayMedia` or audio support):
  > Toggle is hidden entirely, or shown as disabled with a tooltip: "Not supported in this browser."

### 7. `TranscriptColumn.tsx` — click handler

```
if audioMode === 'mic'     → startRecording()
if audioMode === 'virtual' → startRecordingWithSystemAudio()
```

---

## Edge Cases

| Case | What happens |
|---|---|
| User dismisses share dialog | `NotAllowedError` caught; error shown; app returns to idle; nothing leaked |
| User shares without checking audio | `getAudioTracks().length === 0` detected; display stream stopped; error shown; recording never starts |
| User clicks "Stop sharing" mid-session | Display track `ended` fires; recording stops; error shown; mic + display + AudioContext all cleaned up |
| Mac + native Teams/Zoom app | Warning shown before dialog; user informed tab audio only; if they proceed, only browser-tab audio is captured |
| Unsupported browser (Safari, Firefox) | Toggle hidden or disabled; no broken state possible |
| Mic fails after display stream acquired | Display stream stopped first; mic error surfaced |
| User stops recording normally while in virtual mode | `stopRecording()` → `stopStreamTracks()` stops mic + display + closes AudioContext as one operation |

---

## Public Interfaces / Type Semantics

- No changes to any API routes (`/api/transcribe`, `/api/suggest`, `/api/chat`, `/api/summarize`).
- No changes to the Zustand store.
- No changes to `startRecorderCycle`, `sendChunk`, `enqueueChunkUpload`, or any transcription logic.
- `useAudioRecorder` return type gains one field: `startRecordingWithSystemAudio: () => Promise<void>`.

---

## What Cannot Regress

- Mic-only recording is an entirely separate code branch — no shared logic is modified.
- `startRecorderCycle` receives a `MediaStream` as today — it cannot tell the difference between a mic stream and a mixed stream.
- All downstream API routes, the transcription pipeline, suggestions, and chat are unaffected.

---

## Files to Modify

- `twinmind-app/lib/hooks/useAudioRecorder.ts` — new refs, new function, modified `stopStreamTracks`, one new hook export.
- `twinmind-app/components/transcript/TranscriptColumn.tsx` — `audioMode` state, toggle UI, platform/browser warnings, branched click handler.

---

## Test Plan

**1. Happy path (Windows Chrome)**
- Enable virtual meeting mode, accept share dialog with audio checked.
- Verify both mic and remote audio appear in the transcript.
- Stop recording normally; verify no console errors and no leaked AudioContext.

**2. Edge Case 1 — Dialog dismissed**
- Enable virtual meeting mode, open share dialog, click Cancel.
- Verify error message shown; mic button returns to idle; no streams opened.

**3. Edge Case 2 — No audio checkbox**
- Enable virtual meeting mode, share a window/screen but leave "Share system audio" unchecked.
- Verify `getAudioTracks().length === 0` path triggers; error message shown; recording never starts.

**4. Edge Case 3 — Stop sharing mid-session**
- Start virtual meeting recording; while recording, click the browser's "Stop sharing" button.
- Verify recording stops cleanly; error message shown; app returns to idle; no leaked streams.

**5. Mic-only regression**
- With virtual meeting mode off, record as normal; verify mic-only behaviour is identical to pre-change.

**6. Unsupported browser**
- Load in Safari or Firefox; verify toggle is hidden or disabled; verify no JS errors.

**7. Cleanup verification**
- Start and stop virtual meeting recording three times in a row; verify no AudioContext accumulation (browser DevTools → Application → Audio Contexts should show closed contexts).

---

## Assumptions / Defaults Chosen

- Display stream acquired first (before mic) to keep failure cleanup simpler — if display fails, nothing else was opened.
- `AudioContext` created inside the start function, not at hook init — avoids autoplay-policy suspension on browsers that require a user gesture.
- Mode toggle resets to `'mic'` on page reload (session-only state, not persisted).
- Mac detection via `navigator.platform.startsWith('Mac')` — warning is informational only, does not block the flow.
- No video is requested (`video: false`) to avoid triggering a screen-capture indicator on platforms that support audio-only `getDisplayMedia`.
