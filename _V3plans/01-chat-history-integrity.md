# Plan 01 — Chat History Integrity

## Summary
Three linked chat bugs:
1. Failed assistant messages (`⚠ Response interrupted.`) stay in state and get re-sent to Groq as legitimate history in the next user turn — polluting the conversation.
2. New assistant bubble flashes empty for a paint tick before the "Thinking…" spinner appears, because `beginAssistantMessage()` runs before `setIsStreaming(true)` is flushed.
3. Two competing scroll effects (100ms-throttled + rAF-per-frame) both call `scrollToBottom`. One is redundant; the rAF runs 60×/s during streaming.

Also fix the silent drop of in-flight turns when the user sends a second message mid-stream.

## Dependencies
**None.** Independent of all other plans.

## Files touched
1. [twinmind-app/lib/types.ts](twinmind-app/lib/types.ts) — add `isFailed?: boolean` to `ChatMessage`
2. [twinmind-app/store/chatSlice.ts](twinmind-app/store/chatSlice.ts) — add `markLastMessageFailed`, filter helper
3. [twinmind-app/components/chat/ChatColumn.tsx](twinmind-app/components/chat/ChatColumn.tsx) — filter history, move bubble creation, single scroll effect
4. [twinmind-app/components/chat/ChatBubble.tsx](twinmind-app/components/chat/ChatBubble.tsx) — render `isFailed` styling
5. [twinmind-app/app/api/chat/route.ts](twinmind-app/app/api/chat/route.ts) — strip any `isFailed` messages if they arrive (defense in depth)

## Steps

### Step 1 — Type addition
In `lib/types.ts`:
```ts
export interface ChatMessage {
  role: 'user' | 'assistant'
  suggestionType?: CardType | null
  text: string
  isFinalized?: boolean
  isFailed?: boolean   // NEW: assistant turn was interrupted or errored
}
```

### Step 2 — Slice action
In `store/chatSlice.ts`, add:
```ts
markLastMessageFailed: () =>
  set((s) => {
    if (s.chatMessages.length === 0) return s
    const next = s.chatMessages.slice()
    const last = next[next.length - 1]
    if (last.role !== 'assistant') return s
    next[next.length - 1] = { ...last, isFailed: true, isFinalized: true }
    return { chatMessages: next }
  }),
```
Export it from the slice interface.

### Step 3 — Filter failed messages out of outgoing history
In `ChatColumn.tsx`, add a helper near the top of the file:
```ts
function stripFailedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(m => !(m.role === 'assistant' && m.isFailed))
}
```

In `sendUserText`:
```ts
addUserMessage({ suggestionType, text: trimmed })
const snapshot = stripFailedMessages(useStore.getState().chatMessages)
void fireChat(snapshot)
```

### Step 4 — Use `markLastMessageFailed` on interruption
Replace the existing interrupted-append flow in `fireChat`'s catch:
```ts
if (didStreamAnyDelta) {
  appendToLastMessage(RESPONSE_INTERRUPTED_MARKER)
  markLastMessageFailed()   // NEW, replaces finaliseLastMessage
  return
}
```
And update the Retry handler:
```ts
const handleRetryLast = useCallback(() => {
  const messages = useStore.getState().chatMessages
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') { lastUserIndex = i; break }
  }
  if (lastUserIndex === -1) return

  const retryMessages = messages.slice(0, lastUserIndex + 1)
  useStore.setState({ chatMessages: retryMessages })
  setError(null)
  void fireChat(stripFailedMessages(retryMessages))
}, [fireChat])
```

### Step 5 — Move `beginAssistantMessage` after first token
Eliminates the empty-bubble flash. Restructure `fireChat`:
```ts
// BEFORE fetch: DO NOT call beginAssistantMessage()

// After fetch, when processing the FIRST delta:
try {
  const parsed = JSON.parse(payload) as { delta?: string }
  if (parsed.delta) {
    if (!didStreamAnyDelta) {
      beginAssistantMessage()   // create bubble only when content arrives
    }
    didStreamAnyDelta = true
    appendToLastMessage(parsed.delta)
  }
} catch { /* ignore */ }
```
When `[DONE]` arrives but `!didStreamAnyDelta` (model emitted zero content), do nothing — no empty bubble.
Update the pre-stream error handling: if we throw before any delta, nothing to trim — just `setError` and return.

**Edge case:** if user hits Retry on an empty response, there's no user-visible "something happened" signal. Surface `setError('Assistant returned empty response. Retry?')` when `done` arrives with `!didStreamAnyDelta`.

### Step 6 — Collapse the two scroll effects
Delete the rAF loop at [ChatColumn.tsx:62-71](twinmind-app/components/chat/ChatColumn.tsx#L62-L71). Keep only the throttled effect, and change its deps to include a streaming-progress signal (last message length), so it fires as tokens arrive:
```ts
const lastMessageLength = chatMessages[chatMessages.length - 1]?.text.length ?? 0

useEffect(() => {
  const now = Date.now()
  if (now - lastScrollRef.current < 120) return
  lastScrollRef.current = now
  scrollToBottom()
}, [chatMessages.length, lastMessageLength, isStreaming, scrollToBottom])
```
`scrollToBottom` already respects `isUserScrolledUpRef` — don't override when user has scrolled up.

### Step 7 — Server-side defense in depth
In `app/api/chat/route.ts`, immediately after parsing `body.messages`, drop any `isFailed` messages defensively (client should already strip, but never trust the client):
```ts
const cleanMessages = messages.filter(m => !((m as ChatMessage).isFailed))
```
Use `cleanMessages` instead of `messages` in the payload to Groq.

### Step 8 — Visual treatment for failed bubbles
In `ChatBubble.tsx`, when `message.isFailed`, apply a subtle border to the bubble:
```tsx
className={[
  'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
  isUser ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800',
  message.isFailed ? 'opacity-70 ring-amber-500/30' : '',
].filter(Boolean).join(' ')}
```
Retry button behavior unchanged.

## Edge cases to cover
- Empty stream (model returned 0 tokens): don't create an assistant bubble. Show `setError` instead.
- User hits Retry while a NEW fireChat is already in progress: `abortRef.current?.abort()` first (already done in `sendUserText`; replicate in `handleRetryLast`).
- Two back-to-back `sendUserText` calls in <100ms: single-flight requestId already handles this; verify the second abort doesn't leave an orphaned bubble.
- Network dies between `fetch` resolve and first `reader.read()`: `didStreamAnyDelta` is false; no bubble; `setError` fires. Correct.
- User clicks Retry on a success message (shouldn't be possible since `showRetry` requires `isFailed`): defensive guard in handler.

## Acceptance criteria
- [ ] Induce a streaming failure (kill network mid-stream). Type a new question. Inspect the payload sent to `/api/chat`: no message contains `⚠ Response interrupted.`.
- [ ] Send a message → no empty bubble flash before content arrives.
- [ ] Pre-stream error (401, 429, 502): no assistant bubble appears in state at all.
- [ ] Only one scroll effect remains in `ChatColumn.tsx`; rAF loop is deleted.
- [ ] `grep -n "requestAnimationFrame" twinmind-app/components/chat/` returns zero.
- [ ] Failed bubble visually distinct (amber-tinted ring, reduced opacity).
- [ ] `tsc --noEmit` clean.

## Time estimate
**2.5 hours.**

## Risk
Low. All changes are localized to the chat surface. Main risk: breaking the scroll-during-streaming UX. Mitigate with a manual test: stream a long response, scroll up mid-stream, verify auto-follow stays paused.
