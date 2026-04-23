# Plan 05 — Audio & Stream Resilience

## Summary
Three independent reliability fixes:
1. **SSE keepalive on `/api/chat`** — long Groq stalls (>30s) can get dropped by Vercel / CloudFront proxies. Client sees a silent truncation, not a retriable error.
2. **Audio track-event listeners** — headphone unplug / device switch mid-session leaves the `MediaStream` "active" but audio silent. Whisper then returns empty text or hallucinations. User gets no signal.
3. **Upload queue inner try/catch** — if `sendChunk` ever throws (unlikely — it catches internally — but defense in depth), the promise chain stays rejected and may surface as an unhandled rejection in dev.

## Dependencies
**None.** Fully independent of all other plans.

## Files touched
1. [twinmind-app/app/api/chat/route.ts](twinmind-app/app/api/chat/route.ts) — SSE keepalive ping
2. [twinmind-app/lib/hooks/useAudioRecorder.ts](twinmind-app/lib/hooks/useAudioRecorder.ts) — track listeners, queue try/catch
3. [twinmind-app/components/transcript/TranscriptColumn.tsx](twinmind-app/components/transcript/TranscriptColumn.tsx) — render "mic muted" banner
4. [twinmind-app/tests/audio-pipeline.test.ts](twinmind-app/tests/audio-pipeline.test.ts) — new case for track listener

## Step 1 — SSE keepalive
In `app/api/chat/route.ts`, inside the `ReadableStream.start`, add a 15s heartbeat:

```ts
const readable = new ReadableStream({
  async start(controller) {
    const KEEPALIVE_MS = 15_000
    const keepaliveTimer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(': keep-alive\n\n'))
      } catch {
        // controller already closed; ignore
      }
    }, KEEPALIVE_MS)

    try {
      for await (const chunk of stream) {
        if (request.signal.aborted) break
        const delta = chunk.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
          )
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    } catch {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ delta: '\n\n⚠ Response interrupted.' })}\n\n`,
        ),
      )
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    } finally {
      clearInterval(keepaliveTimer)
      request.signal.removeEventListener('abort', onAbort)
      controller.close()
    }
  },
})
```

**Client-side note:** `: keep-alive` is an SSE comment line — the current client parser at [ChatColumn.tsx:143-161](twinmind-app/components/chat/ChatColumn.tsx#L143-L161) splits by `\n` and skips anything that doesn't start with `data:`. So comment lines are already harmless. Verify this path.

### Edge cases
- Stream completes before 15s: `finally` clears the timer; no spurious ping after `[DONE]`.
- Client disconnects mid-stream: `request.signal.aborted` breaks the loop; finally clears timer.
- Groq errors on the first chunk: the catch-block enqueue + finally still clear the timer.
- Controller enqueue after close throws: wrapped in its own try/catch to keep the timer tick idempotent.

## Step 2 — Track-event listeners
In `useAudioRecorder.ts`, wire `mute` / `unmute` / `ended` on the audio track captured in `startRecording`:

```ts
const [isMicMuted, setIsMicMuted] = useState(false)

// Inside startRecording, after successfully getting the stream:
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  streamRef.current = stream
  shouldRecordRef.current = true
  setHasMicPermission(true)
  lastTranscriptTailRef.current = ''
  setIsRecording(true)

  // NEW: watch the audio track
  const track = stream.getAudioTracks()[0]
  if (track) {
    setIsMicMuted(track.muted)
    track.addEventListener('mute', () => setIsMicMuted(true))
    track.addEventListener('unmute', () => setIsMicMuted(false))
    track.addEventListener('ended', () => {
      setError('Microphone disconnected. Restart recording.')
      shouldRecordRef.current = false
      setIsRecording(false)
      stopStreamTracks()
    })
  }

  startRecorderCycle(stream)
} catch (err) { /* existing */ }
```

Reset on `stopRecording`:
```ts
const stopRecording = useCallback(() => {
  // ... existing
  setIsMicMuted(false)
}, [...])
```

Expose `isMicMuted` in the hook return:
```ts
export interface UseAudioRecorderResult {
  isRecording: boolean
  isProcessing: boolean
  isMicMuted: boolean           // NEW
  hasMicPermission: boolean | null
  error: string | null
  // ...
}

return { isRecording, isProcessing, isMicMuted, hasMicPermission, error, requestMicrophoneAccess, startRecording, stopRecording }
```

### Edge cases
- Browser doesn't fire `mute` / `unmute` for all devices (Firefox has limited support): fail-open — no banner is shown, same as today. Don't try to synthesize mute detection via audio analysis (adds complexity, not worth it).
- Track fires multiple `mute` events: `setIsMicMuted(true)` is idempotent.
- `getAudioTracks()[0]` is undefined (no audio capture device): upstream `getUserMedia` would have rejected; safety `if (track)` guard suffices.
- Listener leak: streams are stopped on unmount and on `stopRecording`; tracks are GC'd after `track.stop()` — no explicit `removeEventListener` needed. If paranoid, cache refs and remove on unmount.

## Step 3 — "Mic muted" banner
In `components/transcript/TranscriptColumn.tsx`, pull the new flag and render:

```ts
const {
  isRecording,
  isProcessing,
  isMicMuted,                    // NEW
  hasMicPermission,
  error,
  // ...
} = useAudioRecorder()
```

Render a subtle banner under the mic button when `isMicMuted && isRecording`:
```tsx
{isMicMuted && isRecording && (
  <p className="px-2 text-center text-xs text-amber-400">
    Mic appears muted. Check your device or unmute.
  </p>
)}
```

## Step 4 — Upload queue try/catch
Current:
```ts
const enqueueChunkUpload = useCallback(
  (blob: Blob) => {
    uploadQueueRef.current = uploadQueueRef.current.finally(async () => {
      await sendChunk(blob)
    })
  },
  [sendChunk],
)
```

Harden so a throw inside `sendChunk` never leaves the chain in a rejected state:
```ts
const enqueueChunkUpload = useCallback(
  (blob: Blob) => {
    uploadQueueRef.current = uploadQueueRef.current
      .catch(() => { /* swallow prior rejection */ })
      .then(async () => {
        try {
          await sendChunk(blob)
        } catch {
          // sendChunk should catch internally; this is a final safety net.
        }
      })
  },
  [sendChunk],
)
```

### Edge cases
- `sendChunk` is async and already wraps its body in try/catch-finally; the extra layer is insurance for future refactors.
- Rejected-chain-then-new-enqueue: the leading `.catch(() => {})` flushes stale rejections.
- Order preservation: `.then` preserves serial execution.

## Step 5 — Test the SSE keepalive manually
Hard to unit-test a long-running stream. Manual verification:
- In Groq's dashboard or by adding `await new Promise(r => setTimeout(r, 45000))` temporarily in the server loop, simulate a 45s stall.
- Watch DevTools Network tab for `/api/chat` event stream. You should see `: keep-alive` lines every 15s.
- Client should NOT show `⚠ Response interrupted.` during the stall; normal `[DONE]` on resume.

## Acceptance criteria
- [ ] `: keep-alive` line present every 15s in the `/api/chat` response when a slow stream is simulated.
- [ ] `grep "keep-alive" twinmind-app/app/api/chat/route.ts` matches.
- [ ] Manual: unplug headphones during recording → amber "Mic appears muted" banner shows within 1 second.
- [ ] Plug back in → banner disappears.
- [ ] Manual: pull the USB audio device during recording → "Microphone disconnected" error + mic stops.
- [ ] `uploadQueueRef.current` never surfaces as an unhandled promise rejection in DevTools console across a 10-minute session.
- [ ] `isMicMuted` exposed from `useAudioRecorder` hook; `TranscriptColumn` consumes it.

## Time estimate
**2 hours.**
- SSE keepalive + manual verification: 30min
- Track listeners + UI banner: 45min
- Queue hardening: 15min
- Tests + session run: 30min

## Risk
Very low. Keepalive is additive and comment-line SSE is universally ignored by non-aware parsers. Track listeners fail open on unsupported browsers. Queue hardening is pure defense in depth.
