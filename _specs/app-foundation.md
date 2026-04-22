# Spec for App Foundation, API Layer & State Architecture

branch: claude/feature/app-foundation

## Summary

Bootstraps the Next.js 14 + React + TypeScript project and establishes the two foundational systems that all subsequent specs depend on: a Zustand store with isolated column slices (so a transcript update never re-renders the suggestions or chat columns), and Next.js serverless API route stubs with request-shape validation (the browser never imports the Groq SDK or holds the API key). Also delivers the Settings screen and the static 3-column dark-mode layout shell. No AI calls are made in this spec.

## Functional Requirements

- Initialise a Next.js 14 (App Router) project with TypeScript and Tailwind CSS in dark mode
- Render a full-viewport 3-column layout that matches the reference mockup exactly:
  - Column 1 header: `1. MIC & TRANSCRIPT` + right-aligned `IDLE` status badge
  - Column 2 header: `2. LIVE SUGGESTIONS` + right-aligned `0 BATCHES` status badge
  - Column 3 header: `3. CHAT (DETAILED ANSWERS)` + right-aligned `SESSION-ONLY` status badge
  - All columns fill the viewport height; each is independently scrollable
- Install `zustand` and define four isolated slices in a single store:
  - `transcriptSlice` — array of `{ id, timestamp, text }` lines
  - `suggestionsSlice` — array of batches, each `{ batchNumber, timestamp, cards: [{ type, preview }] }`
  - `chatSlice` — array of `{ role, suggestionType?, text }` messages
  - `settingsSlice` — `{ groqApiKey, suggestPrompt, chatPrompt, suggestContextChars, chatContextChars }`
  - Each slice exposes only its own state and actions; no cross-slice imports in components
- Create three Next.js API route stubs (validation-only; no Groq calls yet):
  - `POST /api/transcribe` accepts `multipart/form-data` with `audio` and `apiKey`; returns `400` when either is missing, otherwise `200 { ok: true }`
  - `POST /api/suggest` accepts `{ transcript, prompt, contextChars, apiKey }`; returns `400` when `transcript` or `apiKey` is missing, otherwise `200 { ok: true }`
  - `POST /api/chat` accepts `{ transcript, messages, prompt, contextChars, apiKey }`; returns `400` when `messages` or `apiKey` is missing, otherwise `200 { ok: true }`
- Install `groq-sdk`; import it only inside the `/api/*` route files, never in any `app/` or `components/` file
- Build the Settings screen (modal or slide-over panel):
  - Groq API key input (password field, stored in `settingsSlice` only — never sent to the server except per-request)
  - Textarea for live suggestions system prompt (default: see hardcoded defaults below)
  - Textarea for chat system prompt (default: see hardcoded defaults below)
  - Number input for suggestions context window in characters (default: 3000)
  - Number input for chat context window in characters (default: 8000)
  - Save button writes values to `settingsSlice`
- Hardcoded default for suggestions prompt:
  > "You are a real-time meeting assistant. Based on the transcript below, generate exactly 3 suggestions. Return a JSON array where each item has: type (one of: QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK) and preview (one punchy sentence, self-contained and useful without clicking). Vary the types — do not repeat the same type twice. Ground every suggestion in the most recent content."
- Hardcoded default for chat prompt:
  > "You are a meeting assistant with access to a full conversation transcript. The user has selected a suggestion or asked a question. Provide a detailed, specific, and helpful response using the transcript as primary context. Be direct and concise."
- App must remain non-functional until an API key is pasted:
  - Disable mic start, suggestion reload, and chat send when `groqApiKey` is empty
  - Show a clear inline hint: `Add your Groq API key in Settings to start.`

## Possible Edge Cases

- Settings panel opens before an API key is entered — all three API routes must return a clear `400 { error: "No API key provided" }` rather than crashing
- Zustand store must be initialised with the hardcoded defaults so the settings form is never empty on first load
- Tailwind dark mode must be set to `class` strategy so it applies unconditionally (not based on OS preference)

## Acceptance Criteria

- [ ] `npm run dev` starts without errors
- [ ] 3-column layout renders full-viewport in a browser with the correct headers and status badges
- [ ] Zustand store is importable; each slice's state and actions are accessible independently
- [ ] All three `/api/*` routes return `400` with clear errors when required fields are missing
- [ ] All three `/api/*` routes return `200 { ok: true }` for minimal valid payloads
- [ ] `groq-sdk` appears in `package.json` but is imported only in `/api/*` files (grep confirms zero client-side imports)
- [ ] Settings modal opens, all fields are pre-filled with defaults, Save updates `settingsSlice`
- [ ] Without an API key, mic/reload/send controls are disabled and an inline key-required hint is visible
- [ ] No TypeScript errors (`tsc --noEmit` passes)

## Open Questions

- Should Settings be a modal overlay or a dedicated `/settings` page? Modal preferred for single-page feel, but confirm with reference mockup if a settings icon is visible.

## Testing Guidelines

Create `tests/app-foundation.test.ts`. Cover:
- Zustand store: adding a transcript line to `transcriptSlice` does not cause `suggestionsSlice` or `chatSlice` state references to change (referential stability check)
- Settings defaults: fresh store initialisation contains the correct default prompt strings and context window values
- API routes: `POST /api/transcribe` without a body returns `400`; `POST /api/suggest` without `apiKey` returns `400`; minimal valid payload returns `200`
- UI gating: when `groqApiKey` is empty, mic/reload/send are disabled
