# Chat & Streaming - Implementation Plan

Spec: `_specs/chat-streaming.md`
Branch: `claude/feature/chat-streaming`

---

## Context

Column 3 of TwinMind. This step wires suggestion cards to chat, supports direct user input, streams assistant output token-by-token via SSE from `/api/chat`, and keeps one in-memory session thread only.

Critical alignment points:
- Avoid stale-message bugs when firing chat immediately after appending a user message
- Keep input disabled while streaming
- Show streaming indicator anchored at bottom-right of the chat panel
- Honor "non-functional until API key is pasted"

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `twinmind-app/app/api/chat/route.ts` | Replace validation stub with SSE streaming implementation |
| `twinmind-app/components/chat/ChatBubble.tsx` | Create |
| `twinmind-app/components/chat/ChatInput.tsx` | Create |
| `twinmind-app/components/chat/ChatColumn.tsx` | Create |
| `twinmind-app/components/suggestions/SuggestionCard.tsx` | Add `onClick` support |
| `twinmind-app/tests/chat-streaming.test.ts` | Create |

---

## 1 - `/api/chat` Route (SSE)

### Validation
```typescript
if (!apiKey) return 400
if (!messages) return 400
```

### Groq call
```typescript
const stream = await groq.chat.completions.create({
  model: 'gpt-OSS-120B',
  stream: true,
  messages: [
    { role: 'system', content: `${prompt}\n\nTranscript:\n${transcript ?? ''}` },
    ...messages.map((m) => ({ role: m.role, content: m.text })),
  ],
})
```

### SSE response
- Emit token deltas as `data: {"delta":"..."}`
- Emit final `data: [DONE]`
- On stream error, emit ` [Response interrupted]` and then `[DONE]`

---

## 2 - chatSlice Contract

Required actions:
- `addUserMessage({ suggestionType, text })`
- `beginAssistantMessage()`
- `appendToLastMessage(delta)`
- `finaliseLastMessage()`

Input guard:
- `addUserMessage` no-ops on empty trimmed text

---

## 3 - Chat Components

### ChatBubble
- User label: `YOU · TYPE` when message originated from suggestion
- User label: `YOU` for free-typed prompts
- Assistant label: `ASSISTANT`

### ChatInput
- Placeholder: `Ask anything...`
- Send disabled while streaming or when input is empty
- Enter sends, Shift+Enter inserts newline

---

## 4 - ChatColumn Flow

### Streaming indicator placement
Use an absolutely positioned indicator inside the chat panel container:
```tsx
<div className="relative flex-1 overflow-y-auto" ref={containerRef} onScroll={onScroll}>
  {/* messages */}
  {isStreaming && (
    <div className="pointer-events-none absolute bottom-3 right-3">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
    </div>
  )}
</div>
```

### Prevent stale-message payloads
Do not read `chatMessages` from a stale closure right after dispatching a user message. Pass an explicit message snapshot into `fireChat`.

```typescript
async function fireChat(messagesForRequest: ChatMessage[]) {
  setIsStreaming(true)

  const allText = transcriptLines.map((l) => l.text).join(' ')
  const context = allText.slice(-chatContextChars)

  dispatch.beginAssistantMessage()

  const payload = {
    transcript: context,
    messages: messagesForRequest,
    prompt: chatPrompt,
    apiKey: groqApiKey,
  }

  // fetch + SSE parse loop
}
```

### Direct send path
```typescript
function handleSend(text: string) {
  if (!text.trim() || isStreaming || !groqApiKey.trim()) return

  const userMessage = { role: 'user', suggestionType: null, text }
  dispatch.addUserMessage({ suggestionType: null, text })
  scrollToBottom()

  const messagesForRequest = [...chatMessages, userMessage]
  fireChat(messagesForRequest)
}
```

### Suggestion click path
```typescript
function onCardClick(card: { type: CardType; preview: string }) {
  if (isStreaming || !groqApiKey.trim()) return

  const userMessage = { role: 'user', suggestionType: card.type, text: card.preview }
  dispatch.addUserMessage({ suggestionType: card.type, text: card.preview })
  scrollToBottom()

  const messagesForRequest = [...chatMessages, userMessage]
  fireChat(messagesForRequest)
}
```

### API-key gating
- If key is missing: disable input and send button
- Show inline helper: `Add your Groq API key in Settings to start.`

---

## 5 - Tests

### `tests/chat-streaming.test.ts`
- `addUserMessage` appends correct role/type
- `appendToLastMessage` concatenates correctly
- `finaliseLastMessage` does not create extra messages
- `/api/chat` returns 400 without `apiKey`
- `/api/chat` returns 400 without `messages`
- SSE delta parsing assembles final text correctly
- Empty input guard blocks dispatch
- Payload snapshot test: request includes the most recently appended user message

---

## Edge Cases Addressed

| Case | Handling |
|------|----------|
| Send while streaming | Input + send disabled; handler guard |
| API key missing | Input disabled; helper text shown; no request |
| Mid-stream provider error | Append ` [Response interrupted]`, finalize, re-enable input |
| `res.body` is null | Append failure text and finalize |
| Malformed SSE lines | Ignore malformed lines safely |
| Page refresh | In-memory-only chat is reset (expected) |

---

## Verification

After implementation:
1. `npm run dev` shows `3. CHAT (DETAILED ANSWERS)` with `SESSION-ONLY`
2. Clicking a suggestion appends `YOU · TYPE` then streams assistant output
3. Typing directly appends `YOU` then streams output
4. Indicator appears at panel bottom-right while streaming
5. Input is disabled during stream and when API key is missing
6. Stream request includes newly added user message (no stale closure)
7. Refresh clears chat session
8. `npx tsc --noEmit` passes
9. `npx vitest run tests/chat-streaming.test.ts` passes
