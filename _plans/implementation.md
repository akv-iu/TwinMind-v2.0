# TwinMind v2 — Implementation Plan

---

## Context

TwinMind is a live AI meeting copilot SPA built as a take-home interview assignment. The spec-driven roadmap covers 5 features across 5 specs in `_specs/`. Implementation lives inside `twinmind-app/` (Next.js subdirectory, due to npm naming restriction on capital letters).

**Why this plan exists:** The scaffold created by `create-next-app` is Next.js 16.2.4 + Tailwind CSS v4 + React 19 — a meaningfully newer stack than what the specs assumed (Next.js 14, Tailwind v3). Several spec instructions (e.g. `tailwind.config.ts darkMode: 'class'`, `create-next-app@14`) must be adapted. This plan documents the correct approach for the actual installed versions.

---

## Stack Reality vs Spec Assumptions

| Concern | Spec Assumption | Reality (installed) | Adaptation |
|---|---|---|---|
| Next.js version | 14 (App Router) | 16.2.4 | App Router still used; route.ts API files unchanged |
| Tailwind version | v3 (tailwind.config.ts) | v4 (no config file) | Dark mode via `@custom-variant dark` in globals.css |
| Dark mode strategy | `darkMode: 'class'` in config | CSS custom variant | Add `@custom-variant dark (&.dark, .dark &);` to globals.css + `dark` class on `<html>` |
| React version | 18 | 19 | No change needed; hooks work identically |
| Test runner | "Jest" implied | Vitest (specified in testing guidelines) | Use vitest + @vitejs/plugin-react |

---

## Complete File Tree (to create)

```
twinmind-app/
├── app/
│   ├── api/
│   │   ├── transcribe/route.ts       # spec: audio-pipeline
│   │   ├── suggest/route.ts          # spec: live-suggestions-engine
│   │   └── chat/route.ts             # spec: chat-streaming
│   ├── globals.css                   # update: dark mode custom variant + zinc palette
│   ├── layout.tsx                    # update: title, dark class on <html>
│   └── page.tsx                      # update: wire ThreeColumnLayout
├── components/
│   ├── layout/
│   │   ├── ThreeColumnLayout.tsx     # 3-col full-viewport grid
│   │   └── ColumnHeader.tsx          # shared header with badge slot
│   ├── transcript/
│   │   ├── TranscriptColumn.tsx      # column 1: mic + transcript
│   │   ├── TranscriptPanel.tsx       # scrollable transcript lines
│   │   └── MicButton.tsx             # large circle mic button
│   ├── suggestions/
│   │   ├── SuggestionsColumn.tsx     # column 2: timer, reload, batches
│   │   ├── SuggestionBatch.tsx       # batch group with footer timestamp
│   │   └── SuggestionCard.tsx        # typed card with colour badge
│   ├── chat/
│   │   ├── ChatColumn.tsx            # column 3: messages + input
│   │   ├── ChatBubble.tsx            # user/assistant bubble
│   │   └── ChatInput.tsx             # "Ask anything..." + Send
│   └── settings/
│       └── SettingsModal.tsx         # slide-over panel with all fields
├── store/
│   ├── transcriptSlice.ts
│   ├── suggestionsSlice.ts
│   ├── chatSlice.ts
│   ├── settingsSlice.ts
│   └── index.ts                      # combine with create() from zustand
├── lib/
│   ├── types.ts                      # CardType, TranscriptLine, SuggestionBatch, ChatMessage
│   ├── dedup.ts                      # deduplicateTail(prevTail, newText): string
│   ├── export.ts                     # exportSession(): triggers file download
│   └── hooks/
│       ├── useAudioRecorder.ts       # MediaRecorder in useRef, chunking, overlap
│       └── useAutoScroll.ts          # isUserScrolledUp ref + scroll logic
├── tests/
│   ├── app-foundation.test.ts
│   ├── audio-pipeline.test.ts
│   ├── live-suggestions-engine.test.ts
│   ├── chat-streaming.test.ts
│   └── export-session.test.ts
└── vitest.config.ts
```

---

## Step 0 - Assignment Preflight

- Use the actual TwinMind product before writing implementation code.
- Capture brief product notes in `README.md` under `Reference App Notes` (what behavior you mirrored and why).
- Keep this evidence lightweight but explicit; this is a stated disqualifier in requirements.

---
## Step 1 — App Foundation (`_specs/app-foundation.md`)

### 1.1 Install packages
```
cd twinmind-app
npm install zustand groq-sdk lucide-react uuid
npm install -D @types/uuid vitest @vitejs/plugin-react
```

### 1.2 Update globals.css (Tailwind v4 dark mode)
Replace content with:
- `@import "tailwindcss";`
- `@custom-variant dark (&.dark, .dark &);` — enables `.dark` class strategy
- `@theme inline { ... }` block with zinc-950 background, zinc-100 foreground, zinc-800 borders
- Remove the `@media (prefers-color-scheme: dark)` block

### 1.3 Update layout.tsx
- Add `dark` className to `<html>` (unconditional dark mode)
- Update `metadata.title` to `"TwinMind"`
- Keep Geist fonts; add `h-full` to `<html>` and `<body>`

### 1.4 lib/types.ts
```typescript
export type CardType = 'QUESTION_TO_ASK' | 'TALKING_POINT' | 'ANSWER' | 'FACT_CHECK'
export interface TranscriptLine { id: string; timestamp: string; text: string }
export interface SuggestionCard { type: CardType; preview: string }
export interface SuggestionBatch { batchNumber: number; timestamp: string; cards: SuggestionCard[] }
export interface ChatMessage { role: 'user' | 'assistant'; suggestionType?: CardType | null; text: string }
export interface SettingsState {
  groqApiKey: string; suggestPrompt: string; chatPrompt: string;
  suggestContextChars: number; chatContextChars: number;
}
```

### 1.5 Zustand slices
**Pattern for each slice** — use the immer-free slice pattern with `StateCreator`:
```typescript
// store/transcriptSlice.ts
import { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { TranscriptLine } from '@/lib/types'

export interface TranscriptSlice {
  transcriptLines: TranscriptLine[]
  addTranscriptLine: (line: Omit<TranscriptLine, 'id'>) => void
  clearTranscript: () => void
}
export const createTranscriptSlice: StateCreator<AllSlices, [], [], TranscriptSlice> = (set) => ({
  transcriptLines: [],
  addTranscriptLine: (line) => set((s) => ({
    transcriptLines: [...s.transcriptLines, { ...line, id: crypto.randomUUID() }]
  })),
  clearTranscript: () => set({ transcriptLines: [] }),
})
```

**settingsSlice** must hold hardcoded prompt defaults:
- `SUGGEST_PROMPT_DEFAULT`: "You are a real-time meeting assistant. Based on the transcript below, generate exactly 3 suggestions. Return a JSON array where each item has: type (one of: QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK) and preview (one punchy sentence, self-contained and useful without clicking). Vary the types — do not repeat the same type twice. Ground every suggestion in the most recent content."
- `CHAT_PROMPT_DEFAULT`: "You are a meeting assistant with access to a full conversation transcript. The user has selected a suggestion or asked a question. Provide a detailed, specific, and helpful response using the transcript as primary context. Be direct and concise."
- `suggestContextChars: 3000`, `chatContextChars: 8000`

**chatSlice** extra actions: `beginAssistantMessage()`, `appendToLastMessage(delta: string)`, `finaliseLastMessage()`

**suggestionsSlice** action: `addBatch(batch)` **prepends** (not appends): `batches: [newBatch, ...s.batches]`

**store/index.ts**:
```typescript
import { create } from 'zustand'
export type AllSlices = TranscriptSlice & SuggestionsSlice & ChatSlice & SettingsSlice
export const useStore = create<AllSlices>()((...a) => ({
  ...createTranscriptSlice(...a),
  ...createSuggestionsSlice(...a),
  ...createChatSlice(...a),
  ...createSettingsSlice(...a),
}))
// Selector hooks — components import only these, never useStore directly
export const useTranscript = () => useStore((s) => ({ lines: s.transcriptLines, add: s.addTranscriptLine }))
// (similarly for the other slices)
```

### 1.6 API route stubs
Each file at `app/api/<name>/route.ts` is a validation-only stub:
- `/api/transcribe`: return `400` if `apiKey` or `audio` is missing; otherwise `200 { ok: true }`
- `/api/suggest`: return `400` if `apiKey` or `transcript` is missing; otherwise `200 { ok: true }`
- `/api/chat`: return `400` if `apiKey` or `messages` is missing; otherwise `200 { ok: true }`
Full Groq implementations land in Steps 2–4.

### 1.7 Layout components

**ThreeColumnLayout.tsx** — `grid grid-cols-3 h-screen` with `divide-x divide-zinc-800`. Each column is `flex flex-col overflow-hidden`.

**ColumnHeader.tsx** — props: `number`, `title`, `badge: ReactNode`. Badge style: `text-xs font-semibold uppercase tracking-widest`.

### 1.8 SettingsModal.tsx
- Slide-over panel from the right (`fixed inset-y-0 right-0 w-96 bg-zinc-900`)
- Toggle via `<Settings />` icon from lucide-react in the page header
- Fields: API key (password), suggestPrompt textarea, chatPrompt textarea, suggestContextChars number, chatContextChars number
- Save writes to `settingsSlice`; pre-filled from store on every open
- Until an API key is present, disable mic/reload/send controls and show `Add your Groq API key in Settings to start.`

### 1.9 vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

---

## Step 2 — Audio Pipeline (`_specs/audio-pipeline.md`)

### 2.1 lib/dedup.ts
```typescript
export function deduplicateTail(prevTail: string, newText: string): string {
  const prevWords = prevTail.trim().split(/\s+/).filter(Boolean)
  const newWords = newText.trim().split(/\s+/).filter(Boolean)
  for (let len = Math.min(prevWords.length, newWords.length, 20); len > 0; len--) {
    const suffix = prevWords.slice(-len).join(' ').toLowerCase()
    const prefix = newWords.slice(0, len).join(' ').toLowerCase()
    if (suffix === prefix) return newWords.slice(len).join(' ')
  }
  return newText
}
```

### 2.2 lib/hooks/useAudioRecorder.ts
Critical constraints:
- `mediaRecorderRef: useRef<MediaRecorder | null>(null)` — never useState
- `rollingTailRef: useRef<Blob | null>(null)` — stores last ~5s of previous chunk
- `lastTranscriptTailRef: useRef<string>('')` — last 20 words for dedup
- `MediaRecorder.start(25000)` — fires ondataavailable every 25s
- `25000ms` is intentional: with ~5s overlap, each effective cycle still approximates the requirement's ~30s cadence while reducing tail latency.
- On each ondataavailable:
  1. Assemble chunk: if rollingTail exists → `new Blob([rollingTail, event.data], {type})`, else `event.data`
  2. POST assembled blob to `/api/transcribe` with apiKey
  3. On success: deduplicateTail, dispatch to transcriptSlice if non-empty, update lastTranscriptTailRef
  4. Store last 1/5 of `event.data` bytes as new rollingTail (approximate 5s from 25s chunk)
- Catch getUserMedia failures; surface inline error

### 2.3 app/api/transcribe/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const apiKey = form.get('apiKey') as string | null
  const audio = form.get('audio') as File | null
  if (!apiKey) return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  const groq = new Groq({ apiKey })
  const result = await groq.audio.transcriptions.create({ file: audio, model: 'whisper-large-v3', response_format: 'json' })
  return NextResponse.json({ text: result.text })
}
```

### 2.4 Components
- **MicButton.tsx** — `w-20 h-20 rounded-full`, pulsing red ring when recording, label below
- **TranscriptPanel.tsx** — scrollable div, renders `<timestamp>  <text>`, uses useAutoScroll
- **TranscriptColumn.tsx** — composes MicButton + TranscriptPanel + error display

### 2.5 lib/hooks/useAutoScroll.ts
Returns `{ containerRef, onScroll, scrollToBottom }`. `isUserScrolledUp` flag: true when `scrollTop + clientHeight < scrollHeight - 50`. Both columns (transcript + chat) use this hook.

---

## Step 3 — Live Suggestions Engine (`_specs/live-suggestions-engine.md`)

### 3.1 app/api/suggest/route.ts
- Accepts `{ transcript, prompt, apiKey }`
- Calls Groq `gpt-OSS-120B` with `response_format: { type: 'json_object' }`
- Pads response to exactly 3 cards; trims if more than 3
- Returns `400` if `apiKey` or `transcript` missing; `502` on JSON parse failure

### 3.2 SuggestionsColumn.tsx - timer logic
- `countdown` in local useState (not Zustand)
- `isLoadingRef: useRef(false)` prevents concurrent requests
- `setInterval` every 1s; at 0 fires suggestions and resets to 30
- Manual Reload resets countdown and fires immediately
- Column header title is exact: `2. LIVE SUGGESTIONS`

### 3.3 SuggestionCard.tsx — colour badge map
```typescript
const CARD_STYLES: Record<CardType, string> = {
  QUESTION_TO_ASK: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  TALKING_POINT:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
  ANSWER:          'bg-green-500/20 text-green-300 border-green-500/30',
  FACT_CHECK:      'bg-orange-500/20 text-orange-300 border-orange-500/30',
}
```
Label display: replace `_` with space; FACT_CHECK → `FACT-CHECK`.

### 3.4 SuggestionBatch.tsx — opacity by index
```typescript
const opacity = index === 0 ? 'opacity-100' : index === 1 ? 'opacity-60' : 'opacity-35'
```
Footer: `— BATCH N · HH:MM:SS AM/PM —` centred, `text-xs text-zinc-500`.

---

## Step 4 — Chat & Streaming (`_specs/chat-streaming.md`)

### 4.1 app/api/chat/route.ts (SSE streaming)
- Accepts `{ transcript, messages, prompt, apiKey }`
- Calls Groq `gpt-OSS-120B` with `stream: true`
- Pipes response as SSE: `data: {"delta": "token"}\n\n`, ends with `data: [DONE]\n\n`
- Returns `400` if `apiKey` or `messages` missing

### 4.2 Client-side SSE reading (ChatColumn.tsx)
- `beginAssistantMessage()` → empty assistant message
- Loop: `reader.read()` → decode → split by `\n` → parse `data:` lines
- `appendToLastMessage(delta)` on each chunk; `finaliseLastMessage()` on `[DONE]`
- Mid-stream error appends `[Response interrupted]`
- `fireChat(messagesForRequest)` takes an explicit message snapshot to avoid stale closures right after `addUserMessage`.

### 4.3 ChatBubble.tsx
- User label: `YOU · FACT-CHECK` (with type) or `YOU` (direct input)
- Assistant label: `ASSISTANT`
- Both: `text-xs font-semibold uppercase tracking-widest text-zinc-500`

### 4.4 Streaming indicator
`<span className="animate-pulse w-2 h-2 rounded-full bg-amber-400" />` in bottom-right of chat panel, shown when `isStreaming === true`.

### 4.5 Wire SuggestionCard onClick
On card click: append user message, build `messagesForRequest = [...chatMessages, newUserMessage]`, then call `fireChat(messagesForRequest)`.

---

## Step 5 — Export & Session Polish (`_specs/export-session.md`)

### 5.1 lib/export.ts
- Guard: return early if all 3 slices empty
- Build JSON: `{ exportedAt, transcript, suggestionBatches, chat }`
- Trigger download via programmatic anchor click
- Filename: `twinmind-session-<ISO-timestamp>.json`

### 5.2 Empty & Loading states
- Column 1 empty: centred placeholder text; loading: `animate-spin` spinner
- Column 2 empty: centred placeholder; loading: skeleton overlay while keeping existing batches visible
- Column 3 empty: initial placeholder text from spec

### 5.3 Auto-scroll finalisation
Both TranscriptPanel and ChatColumn use `useAutoScroll`. 50px threshold, `isUserScrolledUp` is a ref (not state).

### 5.4 Mockup fidelity pass
- Column dividers: `divide-x divide-zinc-800`
- Badge fonts: `text-xs font-semibold uppercase tracking-widest`
- Batch footer: `text-xs text-zinc-500 text-center`
- Cards: `rounded-lg p-3`
- Reload: `<RefreshCw size={14} />` from lucide-react
- All interactive elements: `hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-600`

---

## Step 6 - Delivery & Submission

### 6.1 Deployment
- Deploy public app to Vercel or Netlify.
- Confirm app is usable by pasting only a Groq API key (no other setup).

### 6.2 Repository packaging
- Ensure repository is public or shareable with evaluators.
- Update `README.md` with:
  - Setup instructions
  - Stack and architecture choices
  - Prompt strategy and context-window choices
  - Tradeoffs / known limitations
  - Link to deployed URL

### 6.3 Final checks
- No hardcoded API keys in source.
- No OpenAI SDK usage anywhere.
- Smoke test all non-negotiables from `REQUIREMENTS.md`.

---

## Key Prompt Engineering Notes

The suggest prompt instructs:
- Return exactly 3 items in a JSON array
- Vary the `type` field — no repeated types
- `response_format: { type: 'json_object' }` reduces parse failures

Route always pads/trims to exactly 3 regardless of model output.

---

## Testing Strategy

All tests live in `twinmind-app/tests/`. Run: `npx vitest run`

| Test file | Coverage |
|---|---|
| `app-foundation.test.ts` | Zustand referential stability, settings defaults, API stub 400s |
| `audio-pipeline.test.ts` | `deduplicateTail()`, Blob assembly, `/api/transcribe` 400s, transcript append |
| `live-suggestions-engine.test.ts` | Card padding (2→3), trimming (5→3), JSON parse failure → 502, `addBatch` prepends, countdown reset |
| `chat-streaming.test.ts` | `addUserMessage`, `appendToLastMessage`, `finaliseLastMessage`, 400s, SSE delta assembly |
| `export-session.test.ts` | Export JSON shape, empty slices guard, opacity class by index |

---

## Verification

After each step:
1. `npm run dev` — no console errors, page renders
2. `npx tsc --noEmit` — zero TypeScript errors
3. `npx vitest run` — all tests pass

After Step 5:
- Import check: `rg -n "from 'groq-sdk'|require\\('groq-sdk'\\)" app components lib store` -> zero matches
- Build check: `npm run build` passes

After Step 6:
- Deliverables check: deployed URL resolves publicly and `README.md` includes required sections.

---

## Implementation Order

1. **Step 0** — assignment preflight with reference-app usage notes
2. **Step 1** — establishes store and layout shell; all subsequent steps depend on it
3. **Step 2** — transcript data source for suggestions
4. **Step 3** — suggestion data source for chat
5. **Step 4** — wires cards to streaming chat
6. **Step 5** — export, empty/loading states, fidelity pass; final `tsc` + `build`
7. **Step 6** — deploy + README + submission packaging

Each step is independently committable after its tests pass and `tsc --noEmit` is clean.

