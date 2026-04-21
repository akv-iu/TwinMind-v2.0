# Spec for Audio Capture Pipeline with Overlap Strategy

branch: claude/feature/audio-pipeline

## Summary

Implements the mic start/stop flow using the browser `MediaRecorder` API held in a `useRef` (never in React state), captures audio in ~30-second chunks with a 5-second rolling overlap buffer to prevent word slicing at boundaries, POSTs each chunk to `/api/transcribe`, and appends the deduplicated transcript text as a timestamped line into `transcriptSlice`. Covers the IDLE/RECORDING status badge and auto-scroll. No suggestions are triggered from this layer.

## Functional Requirements

### Mic Button & Recording State
- Large circular mic button in column 1; label below reads `Stopped. Click to resume.` when idle, `Recording...` when active
- Column 1 status badge updates: `IDLE` → `RECORDING` on start, back to `IDLE` on stop
- The `MediaRecorder` instance is stored in a `useRef<MediaRecorder | null>` — never in `useState` — so React re-renders caused by Zustand `transcriptSlice` updates do not recreate or interrupt it

### Audio Chunking with Overlap Buffer
- On mic start, request `audio/webm;codecs=opus` from `getUserMedia` and create a `MediaRecorder`
- Use `MediaRecorder.start(25000)` — fires `ondataavailable` every 25 seconds with a 25s blob
- Maintain a `rollingTailRef: useRef<Blob | null>` that stores the **last 5 seconds** of the previous chunk:
  - On each `ondataavailable` event, the chunk sent to `/api/transcribe` is assembled as: `[rollingTailRef.current, currentBlob]` concatenated into a single `Blob`
  - After sending, extract the final 5 seconds of `currentBlob` and store it in `rollingTailRef` for the next cycle
  - On the very first chunk, there is no tail — send `currentBlob` alone
- On mic stop, flush any buffered audio with `MediaRecorder.stop()` and send the final chunk

### `/api/transcribe` Route
- Accepts `multipart/form-data` with field `audio` (Blob) and `apiKey` (string)
- Constructs a `File` from the blob and calls `groq.audio.transcriptions.create({ file, model: "whisper-large-v3", response_format: "json" })`
- Returns `{ text: string }`
- Returns `400` if `apiKey` or `audio` is missing

### Deduplication & Transcript Append
- The client keeps a `lastTranscriptTail: string` ref — the final 20 words of the previous confirmed transcript segment
- When a new transcription response arrives, strip any leading text that duplicates `lastTranscriptTail` (fuzzy prefix match, word-level)
- Append the cleaned text to `transcriptSlice` as `{ id: uuid, timestamp: "HH:MM:SS AM/PM", text: cleanedText }`
- Update `lastTranscriptTail` to the final 20 words of `cleanedText`

### Transcript Display
- Column 1 scrollable panel renders each transcript line as: `<timestamp>  <text>`
- Auto-scrolls to the bottom on each new line append
- Auto-scroll pauses when the user manually scrolls up; resumes when scrolled back to bottom

## Possible Edge Cases

- User denies microphone permission — show a clear inline error message in column 1; do not crash
- `getUserMedia` is unavailable (non-HTTPS or unsupported browser) — same inline error
- `/api/transcribe` returns an error (invalid key, Groq rate limit) — display the error inline below the last transcript line; do not lose accumulated transcript
- Very short chunks (user stops mic immediately) — still send; Whisper handles short audio fine
- Overlap tail may be an empty Blob on the first chunk — guard with a null check before concatenation
- The deduplicated text may occasionally be empty (the chunk was entirely overlap) — skip appending

## Acceptance Criteria

- [ ] Clicking the mic button starts recording; status badge changes to `RECORDING`
- [ ] Every ~25 seconds a new timestamped line appears in the transcript panel while speaking
- [ ] Stopping and restarting the mic does not duplicate words at the boundary in the transcript
- [ ] MediaRecorder instance survives a Zustand state update without being recreated (verify with a console log on instantiation — it should log only once per start)
- [ ] Transcript auto-scrolls to the latest line; pauses when user scrolls up
- [ ] Microphone permission denial shows a user-facing error in column 1
- [ ] `/api/transcribe` without `apiKey` returns `400`

## Open Questions

- None — overlap strategy and deduplication approach are fully specified above.

## Testing Guidelines

Create `tests/audio-pipeline.test.ts`. Cover:
- Deduplication logic: given a previous tail of "handling state in memory" and new transcript "state in memory the main bottleneck", the cleaned result is "the main bottleneck" (unit test, no browser required)
- Chunk assembly: given a previous tail Blob and a current Blob, the assembled Blob size equals the sum of both (mock Blob)
- `/api/transcribe` route: returns `400` when `apiKey` is missing; returns `400` when `audio` field is missing
- Transcript slice: appending a line increments the array length and the new line has a non-empty timestamp
