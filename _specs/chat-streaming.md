# Spec for Chat & Streaming Answers

branch: claude/feature/chat-streaming

## Summary

Wires suggestion cards to the chat column: clicking a card dispatches a `YOU · TYPE` bubble to `chatSlice` and POSTs to `/api/chat`, which calls `gpt-OSS-120B` on Groq with streaming enabled and pipes the SSE response back to the client for progressive token-by-token rendering into an ASSISTANT bubble. Also handles direct user text input via the `Ask anything...` field. Covers the animated streaming indicator, the `SESSION-ONLY` status badge, and the one-continuous-thread-per-session constraint.

## Functional Requirements

### Suggestion Card Click → Chat
- Each suggestion card (from the previous spec) now has an `onClick` handler
- On click:
  1. Dispatch to `chatSlice.addUserMessage({ suggestionType: card.type, text: card.preview })`
  2. Scroll the chat panel to the bottom
  3. Fire the chat request (see below)
- The user bubble is rendered as:
  - Label: `YOU · <TYPE>` (e.g., `YOU · FACT-CHECK`) in small caps above the bubble
  - Bubble body: the suggestion preview text

### Direct Text Input → Chat
- `Ask anything...` text input at the bottom of column 3, with a `Send` button on the right
- On Send (button click or Enter key):
  1. Dispatch `chatSlice.addUserMessage({ suggestionType: null, text: inputValue })`
  2. Clear the input field
  3. Fire the chat request
- Label above direct-input bubbles: `YOU` (no type suffix)

### Chat Request Flow
- Assemble the request payload:
  - `transcript`: the most recent `chatContextChars` characters from `transcriptSlice` (from `settingsSlice`)
  - `messages`: full `chatSlice` message array (excluding the currently streaming ASSISTANT message)
  - `prompt`: `settingsSlice.chatPrompt`
  - `apiKey`: `settingsSlice.groqApiKey`
- POST to `/api/chat`
- While the request is pending and streaming: input field and Send button are disabled

### `/api/chat` Route (Streaming)
- Accepts `{ transcript, messages, prompt, apiKey }`
- Calls `groq.chat.completions.create` with:
  - `model: "gpt-OSS-120B"`
  - `stream: true`
  - System message: the `prompt` value, with the full transcript appended
  - User/assistant turns: the `messages` array mapped to Groq message format
- Pipes the Groq stream as a **Server-Sent Events (SSE)** response:
  - Each token chunk: `data: {"delta": "token text"}\n\n`
  - On stream end: `data: [DONE]\n\n`
- Returns `400` if `apiKey` or `messages` is missing

### Client-Side Stream Reading
- On receiving the `/api/chat` response, immediately dispatch `chatSlice.beginAssistantMessage()` which appends an empty `{ role: "assistant", text: "" }` message
- Read the SSE stream using `ReadableStream` / `TextDecoder`; on each `delta` event, dispatch `chatSlice.appendToLastMessage(delta)` which concatenates the token to the last message's `text`
- On `[DONE]`, dispatch `chatSlice.finaliseLastMessage()` and re-enable the input field
- Auto-scroll the chat panel on each token append (unless the user has manually scrolled up)

### Streaming Indicator
- While streaming is active, render a pulsing yellow/amber dot (CSS `animate-pulse`) in the bottom-right corner of the chat panel
- Remove it once `[DONE]` is received

### Chat Display Rules
- Initial state placeholder text (shown when `chatSlice.messages` is empty): *"Clicking a suggestion adds it to this chat and streams a detailed answer (separate prompt, more context). User can also type questions directly. One continuous chat per session — no login, no persistence."*
- ASSISTANT bubbles are labelled `ASSISTANT` above them
- Chat panel is independently scrollable; auto-scroll pauses when user scrolls up, resumes on new content

### Session Constraint
- `chatSlice` is in-memory only — no `localStorage`, no `sessionStorage`
- Refreshing the page clears chat history (this is correct and expected behaviour per requirements)

## Possible Edge Cases

- User sends a second message while the first response is still streaming — Send button is disabled while streaming; this cannot occur
- Groq returns a streaming error mid-stream (e.g., rate limit hit after partial response) — append `[Response interrupted]` to the current assistant message and re-enable input
- Empty transcript when a suggestion is clicked (user somehow clicked a cached card after clearing) — still send the request; `/api/chat` handles an empty transcript gracefully
- Very long chat history exceeds `chatContextChars` — only the transcript is truncated to `chatContextChars`; full message history is always sent (Groq context window is large enough for a session)
- User presses Enter on an empty input — no-op; do not dispatch or fire a request

## Acceptance Criteria

- [ ] Clicking a suggestion card appends a `YOU · TYPE` bubble and begins streaming
- [ ] ASSISTANT response streams token by token into the bubble — visible progressive rendering
- [ ] Pulsing yellow indicator appears during streaming and disappears on completion
- [ ] Sending a direct typed message appends a `YOU` bubble (no type suffix) and streams a response
- [ ] Input field and Send button are disabled during streaming
- [ ] Auto-scroll tracks new tokens; pauses when user scrolls up
- [ ] Refreshing the page shows the initial placeholder (no chat persistence)
- [ ] Mid-stream error shows `[Response interrupted]` and re-enables input

## Open Questions

- None — streaming approach (SSE via Next.js route handler) and state model are fully specified.

## Testing Guidelines

Create `tests/chat-streaming.test.ts`. Cover:
- `chatSlice`: `addUserMessage` appends correct role/type; `appendToLastMessage` concatenates correctly; `finaliseLastMessage` does not create a new message
- `/api/chat` route: returns `400` when `apiKey` is missing; returns `400` when `messages` is missing
- SSE parsing: given a mock stream emitting three delta events then `[DONE]`, the assembled text equals the concatenation of the three deltas
- Empty input guard: dispatching with empty text string does not add a message to `chatSlice`
