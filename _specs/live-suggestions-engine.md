# Spec for Live Suggestions Engine

branch: claude/feature/live-suggestions-engine

## Summary

Builds the full suggestions cycle in column 2: a 30-second auto-refresh timer and manual reload button, a POST to `/api/suggest` that calls `gpt-OSS-120B` on Groq with a structured prompt, client-side parsing of exactly 3 typed suggestion cards (QUESTION TO ASK / TALKING POINT / ANSWER / FACT-CHECK), and batch state management in `suggestionsSlice` (new batch at top, older batches visually faded). Covers the batch count badge, countdown timer, and batch footer timestamps. Cards are rendered as tappable stubs — chat wiring is handled in the next spec.

## Functional Requirements

### Auto-Refresh Timer
- On component mount, start a 30-second countdown interval stored in a `useRef<NodeJS.Timeout>`
- The countdown value is local component state (does not go in Zustand — it belongs to this column only)
- Display: `auto-refresh in Xs` on the right side of the controls bar, counting down from 30 to 0
- When the counter reaches 0: fire a suggestions request, then reset to 30
- Timer is paused while a request is in-flight (to prevent stacking concurrent requests)
- Timer resets to 30 when the user clicks Reload manually

### Manual Reload Button
- Label: `↺ Reload suggestions`
- On click: immediately fires a suggestions request and resets the countdown to 30
- Disabled (greyed out) while a request is in-flight

### Suggestions Request Flow
- Read `transcriptSlice` from Zustand; take the most recent `suggestContextChars` characters (from `settingsSlice`) as the context window
- If the transcript context is empty (nothing recorded yet), skip the request and show a placeholder: `Start recording to generate suggestions`
- POST to `/api/suggest` with `{ transcript: contextWindow, prompt, contextChars, apiKey }`

### `/api/suggest` Route
- Accepts `{ transcript, prompt, apiKey }`
- Calls `groq.chat.completions.create` with `model: "gpt-OSS-120B"`, the system prompt from `settingsSlice` defaults, and a user message containing the transcript
- Instructs the model via the prompt to return a JSON array of exactly 3 objects: `[{ type: "QUESTION_TO_ASK" | "TALKING_POINT" | "ANSWER" | "FACT_CHECK", preview: string }]`
- Parses and validates the response — if fewer or more than 3 cards are returned, pad with a fallback or trim to 3
- Returns `{ cards: [{ type, preview }] }`
- Returns `400` if `apiKey` or `transcript` is missing

### Batch State Management
- On a successful response, dispatch to `suggestionsSlice.addBatch({ timestamp, cards })`
- `suggestionsSlice` prepends each new batch to the array; older batches are not removed
- The batch count badge in the column header reads `N BATCH` / `N BATCHES` based on array length

### Rendering
- Each batch is rendered as a group:
  - **Newest batch**: full opacity
  - **Older batches**: reduced opacity (e.g., `opacity-40`) and a subtle visual separator
  - **Batch footer**: `— BATCH N · HH:MM:SS AM/PM —` centred below the 3 cards
- Each suggestion card:
  - Small coloured type badge at top-left:
    - `QUESTION TO ASK` → blue/cyan (`bg-blue-500/20 text-blue-300 border-blue-500/30`)
    - `TALKING POINT` → purple/violet (`bg-purple-500/20 text-purple-300 border-purple-500/30`)
    - `ANSWER` → green (`bg-green-500/20 text-green-300 border-green-500/30`)
    - `FACT-CHECK` → orange/amber (`bg-orange-500/20 text-orange-300 border-orange-500/30`)
  - Preview text below the badge in full body font
  - Entire card is clickable (cursor pointer, hover highlight) — onClick is a no-op stub here, wired in chat spec

## Possible Edge Cases

- Model returns malformed JSON — catch parse errors; show an inline error in column 2 and do not crash or clear existing batches
- Model returns fewer than 3 cards — pad the remaining slots with a `{ type: "QUESTION_TO_ASK", preview: "Could not generate suggestion." }` placeholder
- Model returns more than 3 cards — take only the first 3
- Transcript context is shorter than `suggestContextChars` — send the full transcript; do not error
- User clicks Reload while a request is already in-flight — button is disabled, so this cannot occur
- Groq rate limit or network error — show inline error `Failed to load suggestions. Retrying in 30s.`; do not reset accumulated batches

## Acceptance Criteria

- [ ] Countdown displays correctly and auto-fires a request every 30 seconds
- [ ] Manual Reload fires a request and resets the countdown
- [ ] Reload button is disabled while a request is in-flight
- [ ] Each successful request produces exactly 3 cards rendered in the correct order
- [ ] Each card displays its type badge in the correct colour
- [ ] Older batches are visible below the newest batch at reduced opacity
- [ ] Batch footer shows correct batch number and timestamp
- [ ] Column header badge increments: `1 BATCH`, `2 BATCHES`, etc.
- [ ] Empty transcript state shows placeholder text and does not fire a request
- [ ] Malformed model response shows an inline error without crashing

## Open Questions

- `gpt-OSS-120B` — confirm the exact Groq model ID string before implementing `/api/suggest` (the model name used in the API call must match Groq's published model list exactly). - gpt-OSS-120B

## Testing Guidelines

Create `tests/live-suggestions-engine.test.ts`. Cover:
- Card padding: given a response with 2 cards, the result is padded to 3
- Card trimming: given a response with 5 cards, the result is trimmed to 3
- JSON parse failure: `/api/suggest` route returns a structured error (not a 500 crash) when the model output is not valid JSON
- Batch prepend: `addBatch` action in `suggestionsSlice` results in the new batch being index 0
- Countdown reset: after a successful request, the local countdown resets to 30
