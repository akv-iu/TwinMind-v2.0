# Audio Pipeline — Implementation Plan

Spec: `_specs/audio-pipeline.md`
Branch: `claude/feature/audio-pipeline`

---

## Context

Column 1 of the TwinMind app. This feature adds mic start/stop recording, chunked audio capture with a 5-second rolling overlap buffer to prevent word-slicing at chunk boundaries, POST of each chunk to `/api/transcribe` (Groq whisper-large-v3), word-level deduplication of the returned transcript, and display of timestamped transcript lines with auto-scroll.

**This spec depends on App Foundation being complete first.** The following must exist before this step begins:
- `lib/types.ts` — `TranscriptLine` type
- `store/transcriptSlice.ts` — `addTranscriptLine` action + `transcriptLines` state
- `store/settingsSlice.ts` — `groqApiKey` and `suggestContextChars`
- `store/index.ts` — `useStore` and selector hooks
- `components/layout/ColumnHeader.tsx` + `ThreeColumnLayout.tsx`
- `app/page.tsx` wired to the 3-column layout

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `twinmind-app/lib/dedup.ts` | Create |
| `twinmind-app/lib/hooks/useAutoScroll.ts` | Create |
| `twinmind-app/lib/hooks/useAudioRecorder.ts` | Create |
| `twinmind-app/app/api/transcribe/route.ts` | Replace stub with real implementation |
| `twinmind-app/components/transcript/MicButton.tsx` | Create |
| `twinmind-app/components/transcript/TranscriptPanel.tsx` | Create |
| `twinmind-app/components/transcript/TranscriptColumn.tsx` | Create |
| `twinmind-app/tests/audio-pipeline.test.ts` | Create |

---

## 1 — `lib/dedup.ts`

**Purpose:** Remove the leading words from a new transcript segment that duplicate the tail of the previous segment (caused by the 5s overlap buffer).

**Algorithm:**
- Split both strings into word arrays
- Try decreasing prefix lengths from `min(prevTailWords, newWords, 20)` down to 1
- Compare the last N words of `prevTail` with the first N words of `newText` (case-insensitive)
- On match, return `newWords.slice(N).join(' ')`
- If no match found, return `newText` unchanged
- Guard: if either string is empty, return `newText` unchanged

**Function signature:**
```
deduplicateTail(prevTail: string, newText: string): string
```

**Why 20 word cap:** The rolling tail is ~5s of audio. At average speaking pace (~130 wpm), that is ~10 words. Capping at 20 gives headroom for faster speakers without scanning the entire previous segment.

---

## 2 — `lib/hooks/useAutoScroll.ts`

**Purpose:** Shared hook used by both TranscriptPanel (column 1) and ChatColumn (column 3). Manages auto-scroll with manual-scroll detection.

**Returns:** `{ containerRef, onScroll, scrollToBottom }`

**Internal state:** `isUserScrolledUp` — a `useRef<boolean>` (not useState, to avoid re-renders)

**Threshold:** If `scrollTop + clientHeight < scrollHeight - 50`, the user has scrolled up → set flag true

**`scrollToBottom()`:** Sets `containerRef.current.scrollTop = containerRef.current.scrollHeight`; only effective when `!isUserScrolledUp.current`

**Usage pattern:**
```tsx
const { containerRef, onScroll, scrollToBottom } = useAutoScroll()
// attach to the scrollable div:
<div ref={containerRef} onScroll={onScroll} className="overflow-y-auto flex-1">
// call scrollToBottom() after appending a new item
```

---

## 3 — `lib/hooks/useAudioRecorder.ts`

This is the most critical piece of the audio pipeline. All constraints below are hard requirements from the spec.

### Refs (never useState for recording state)
```
mediaRecorderRef:      useRef<MediaRecorder | null>(null)
rollingTailRef:        useRef<Blob | null>(null)      — last ~5s of previous chunk
lastTranscriptTailRef: useRef<string>('')              — last 20 words, for dedup input
```

### Returned interface
```typescript
{
  isRecording: boolean           // useState — drives UI only
  error: string | null           // useState — inline error display
  startRecording(): Promise<void>
  stopRecording(): void
}
```

### `startRecording()` flow
1. Guard API key: if `groqApiKey` is empty, set inline error (`Add your Groq API key in Settings to start.`) and return
2. Call `navigator.mediaDevices.getUserMedia({ audio: true })`
   - On failure: set `error` message, return early (do not crash)
3. Create `new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })`
   - Fallback: if `audio/webm;codecs=opus` is not supported, use `''` (browser default)
4. Assign `ondataavailable` handler (see below)
5. Call `mediaRecorderRef.current.start(25000)` — 25s timeslice
   - Rationale: 25s chunk + ~5s overlap yields an effective ~30s cadence while reducing clipping at boundaries
6. Set `isRecording = true`

### `ondataavailable` handler (fires every ~25s)
```
event.data = current 25s blob
```
1. **Assemble chunk:**
   - If `rollingTailRef.current` is not null: `assembled = new Blob([rollingTailRef.current, event.data], { type: event.data.type })`
   - Else (first chunk): `assembled = event.data`
2. **POST to `/api/transcribe`:**
   - `FormData` with fields `audio` (assembled Blob as File) and `apiKey` (from `settingsSlice`)
   - `const file = new File([assembled], 'chunk.webm', { type: assembled.type })`
3. **On success `{ text }`:**
   - `cleaned = deduplicateTail(lastTranscriptTailRef.current, text)`
   - If `cleaned.trim()` is non-empty: dispatch `addTranscriptLine({ timestamp, text: cleaned })`
   - Update `lastTranscriptTailRef.current` = last 20 words of `cleaned`
4. **Update rolling tail:**
   - Take the last 1/5 of `event.data` by byte size (approximates 5s from 25s chunk)
   - `rollingTailRef.current = event.data.slice(event.data.size * 0.8)`
5. **On fetch error:** set `error` state with message; do not clear existing transcript lines

### `stopRecording()` flow
1. `mediaRecorderRef.current?.stop()` — fires one final `ondataavailable` with remaining audio
2. Stop all tracks: `stream.getTracks().forEach(t => t.stop())`
3. Reset `rollingTailRef.current = null`
4. Set `isRecording = false`

### Timestamp format
`new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })`
→ produces `"04:52:07 PM"`

---

## 4 — `app/api/transcribe/route.ts`

Replaces the `{ ok: true }` stub.

**Method:** `POST`
**Body:** `multipart/form-data`
**Fields:** `audio` (File/Blob), `apiKey` (string)

**Implementation:**
1. `const form = await req.formData()`
2. Extract `apiKey` and `audio`
3. `if (!apiKey)` → `400 { error: 'No API key provided' }`
4. `if (!audio)` → `400 { error: 'No audio provided' }`
5. `const groq = new Groq({ apiKey })`
6. `const result = await groq.audio.transcriptions.create({ file: audio, model: 'whisper-large-v3', response_format: 'json' })`
7. Return `200 { text: result.text }`

**Groq import:** `import Groq from 'groq-sdk'` — only in this file (never in app/ or components/)

**Error propagation:** Let unhandled Groq errors surface as 500 — Next.js will catch and log them; the client displays the inline error from the non-200 status.

---

## 5 — `components/transcript/MicButton.tsx`

**Props:** `isRecording: boolean`, `onClick: () => void`, `disabled?: boolean`

**Appearance:**
- Container: `flex flex-col items-center gap-2`
- Button: `w-20 h-20 rounded-full flex items-center justify-center transition-colors`
  - Idle: `bg-zinc-800 hover:bg-zinc-700`
  - Recording: `bg-red-600 hover:bg-red-700` + pulsing ring `ring-2 ring-red-500 ring-offset-2 ring-offset-zinc-950 animate-pulse`
- Icon: `<Mic size={28} />` from lucide-react (white)
- Label below: `text-xs text-zinc-400`
  - Idle: `"Stopped. Click to resume."`
  - Recording: `"Recording..."`

---

## 6 — `components/transcript/TranscriptPanel.tsx`

**Props:** `lines: TranscriptLine[]`, `isLoading: boolean`

**Layout:** `flex-1 overflow-y-auto p-4 space-y-1` (attaches `containerRef` and `onScroll` from `useAutoScroll`)

**Empty state** (when `lines.length === 0` and not loading):
```
<p className="text-zinc-500 text-sm text-center mt-8">
  Start recording to see your transcript here.
</p>
```

**Each line:**
```tsx
<div className="flex gap-3 text-sm">
  <span className="text-zinc-500 shrink-0 font-mono text-xs pt-0.5">{line.timestamp}</span>
  <span className="text-zinc-100 leading-relaxed">{line.text}</span>
</div>
```

**Loading indicator** (when `isLoading === true` and lines exist):
```tsx
<div className="flex items-center gap-2 text-zinc-500 text-xs mt-1">
  <Loader2 size={12} className="animate-spin" />
  <span>Transcribing...</span>
</div>
```

**Auto-scroll:** call `scrollToBottom()` inside a `useEffect` that depends on `lines.length` (not the array reference, to avoid firing on unrelated re-renders).

---

## 7 — `components/transcript/TranscriptColumn.tsx`

Composes all transcript column pieces into the full column 1 view.

**Structure:**
```
<div className="flex flex-col h-full bg-zinc-950">
  <ColumnHeader number={1} title="MIC & TRANSCRIPT" badge={<StatusBadge />} />
  <div className="flex flex-col items-center py-6 border-b border-zinc-800">
    <MicButton ... />
    {error && <p className="text-red-400 text-xs mt-2 px-4 text-center">{error}</p>}
  </div>
  <TranscriptPanel lines={transcriptLines} isLoading={isLoading} />
</div>
```

**StatusBadge:**
- Idle: `"IDLE"` — `bg-zinc-800 text-zinc-400`
- Recording: `"RECORDING"` — `bg-red-500/20 text-red-400 border border-red-500/30` + pulsing dot

**State wired from:**
- `useAudioRecorder()` → `{ isRecording, error, startRecording, stopRecording }`
- `useStore` transcript selector → `transcriptLines`
- Local `isLoading: boolean` — set true on fetch start, false on fetch end (managed inside `useAudioRecorder`)

---

## 8 — `tests/audio-pipeline.test.ts`

Four test cases per spec:

### 8a — Deduplication logic (pure unit test, no browser)
```
prevTail = "handling state in memory"
newText  = "state in memory the main bottleneck"
expected = "the main bottleneck"
```
Also test: no overlap case → returns `newText` unchanged. Empty prevTail → returns `newText`.

### 8b — Chunk assembly (Blob mock)
```
prevTail = new Blob(['aaaa'], { type: 'audio/webm' })  // 4 bytes
current  = new Blob(['bbbb'], { type: 'audio/webm' })  // 4 bytes
assembled = new Blob([prevTail, current], ...)
expect(assembled.size).toBe(8)
```

### 8c — `/api/transcribe` route: missing `apiKey` returns 400
Direct call to the route handler with a mocked `FormData` that omits `apiKey`. Expect `response.status === 400`.

### 8d — Transcript slice: appending increments length and line has non-empty timestamp
Create a fresh store state, call `addTranscriptLine({ timestamp: '04:52:07 PM', text: 'hello' })`, assert `transcriptLines.length === 1` and `transcriptLines[0].timestamp !== ''`.

---

## Edge Cases Addressed

| Case | Handling |
|------|----------|
| User denies mic permission | `catch` on `getUserMedia`, set `error` state, show inline in TranscriptColumn |
| `getUserMedia` unavailable (non-HTTPS) | Same catch path; browser throws `NotAllowedError` or `NotFoundError` |
| `/api/transcribe` returns non-200 | `useAudioRecorder` sets `error` state; existing transcript lines preserved |
| Overlap tail is null (first chunk) | Guard: `if (rollingTailRef.current)` — sends `event.data` alone |
| Cleaned dedup text is empty string | Skip `addTranscriptLine`; do not append empty line |
| User stops mic immediately (short chunk) | `MediaRecorder.stop()` fires final `ondataavailable`; Whisper handles short audio |
| MediaRecorder recreated on re-render | All recorder state in `useRef` — never in `useState` — so Zustand transcript updates do not recreate it |

---

## Verification

After implementation:
1. `npm run dev` — page renders, mic button visible in column 1
2. Click mic → status badge changes to `RECORDING`, button turns red
3. Speak for ~30 seconds → timestamped transcript line appears
4. Stop and restart → no duplicate words at chunk boundary
5. Deny mic permission → inline error appears in column 1
6. `npx tsc --noEmit` — zero errors
7. `npx vitest run tests/audio-pipeline.test.ts` — all 4 tests pass
8. `grep -r "groq-sdk" components/ lib/ store/` → zero matches
