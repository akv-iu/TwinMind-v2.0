# TwinMind v2 — Live Suggestions Assignment: Requirements

> Source of truth distilled from the assignment PDF + reference mockup screenshot. Read this before touching any code.

---

## What We're Building

A **single-page web app** that acts as a live AI meeting copilot. It listens to the microphone, continuously transcribes speech, and surfaces 3 AI-generated suggestions every ~30 seconds based on what is being said — mimicking the core feature of TwinMind.

**Before writing any code:** Use the actual TwinMind app yourself. Submissions that clearly haven't used the product are an immediate disqualifying flag.

---

## UI Layout — 3 Columns (Non-Negotiable)

```
┌─────────────────────┬──────────────────────┬──────────────────────┐
│  1. MIC & TRANSCRIPT│  2. LIVE SUGGESTIONS │  3. CHAT             │
│  [status: IDLE]     │  [status: N BATCH]   │  [status: SESSION-   │
│                     │                      │   ONLY]              │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

Each column header shows its section number, title, and a right-aligned live status badge.

---

## Column 1 — Mic & Transcript

### Header
- Title: `1. MIC & TRANSCRIPT`
- Status badge (right-aligned): `IDLE` when not recording, `RECORDING` when active

### Mic Button
- Large circular mic button — click to start, click again to stop
- Label beneath: `Stopped. Click to resume.` when idle

### Transcript Panel
- Transcript lines appear as audio chunks are processed (~every 30s)
- Each line is prefixed with a **timestamp** (`04:52:07 PM  So we're talking about...`)
- Auto-scrolls to the latest line
- Transcript area is scrollable for full session history

### Export Button
- An Export button (can be below the transcript or in a toolbar) downloads the **full session** as JSON or plain text
- Export includes: full timestamped transcript + every suggestion batch + full chat history

---

## Column 2 — Live Suggestions

### Header
- Title: `2. LIVE SUGGESTIONS`
- Status badge (right-aligned): `N BATCH` — shows the current count of batches generated (e.g., `1 BATCH`, `3 BATCHES`)

### Controls Bar
- `↺ Reload suggestions` button (left side) — manually triggers a new suggestion batch immediately
- `auto-refresh in Xs` countdown (right side) — counts down to next auto-refresh (~30s cycle)

### Suggestion Batches
- On every refresh (auto or manual), generate **exactly 3 fresh suggestions** from recent transcript context
- New batch appears **at the top**; older batches push down and become **visually faded**
- Each batch has a **footer label**: `— BATCH N · HH:MM:SS AM/PM —`

### Suggestion Card Types
Each of the 3 cards per batch is typed. The AI must assign one of these 4 types per suggestion:

| Type | Label Color | Description |
|------|-------------|-------------|
| **QUESTION TO ASK** | Blue / Cyan | A probing or clarifying question the user could ask right now |
| **TALKING POINT** | Purple / Violet | A relevant fact, stat, or reference the user could raise |
| **ANSWER** | Green | A direct answer to something that was asked or implied |
| **FACT-CHECK** | Orange / Amber | A factual correction or verification of something said |

### Card Anatomy
- **Type label** displayed as a small colored badge at the top-left of each card (e.g., `QUESTION TO ASK`)
- **Preview text** below the label — short, self-contained, already useful without clicking
- Card is **tappable** — clicking sends it to the chat as a question

### Suggestion Quality Rules (Prompt Engineering)
- Each batch should vary types — don't generate 3 questions or 3 fact-checks
- Preview text must stand alone as useful without clicking (the user reads it at a glance)
- Suggestions must be grounded in the **most recent transcript context**, not generic
- The AI decides which type fits best for each suggestion moment

---

## Column 3 — Chat (Detailed Answers)

### Header
- Title: `3. CHAT (DETAILED ANSWERS)`
- Status badge (right-aligned): `SESSION-ONLY`

### Initial State
- Placeholder message shown at top: *"Clicking a suggestion adds it to this chat and streams a detailed answer (separate prompt, more context). User can also type questions directly. One continuous chat per session — no login, no persistence."*

### Conversation Flow
- Clicking a suggestion card:
  - Adds a **user bubble** labeled `YOU · <TYPE>` (e.g., `YOU · FACT-CHECK`) with the suggestion preview text
  - Triggers a **separate, longer-form prompt** that includes full transcript context
  - Streams back a detailed assistant response labeled `ASSISTANT`
- User can also type freely in the `Ask anything...` input and hit **Send**
- Response ideally **streams** token by token (streaming response preferred)
- **One continuous chat thread per session** — no separate threads, no login, no persistence across reloads

### Streaming Indicator
- While the assistant is generating, a **live animated indicator** is shown (e.g., pulsing yellow dot in bottom-right of chat panel)

### Chat Input
- `Ask anything...` placeholder text
- `Send` button (right side)

---

## Technical Requirements

### Models

All inference runs through **Groq** exclusively. Do not use OpenAI. The evaluators use a fixed model stack so suggestion quality comparisons are apples-to-apples across all submissions.

| Task | Model (Groq) |
|------|--------------|
| Audio transcription | `whisper-large-v3` |
| Live suggestions generation | `gpt-OSS-120B` |
| Chat / detailed answers | `gpt-OSS-120B` |

### API Key
- A **Settings screen** where the user pastes their own **Groq API key**
- **Never hard-code or ship an API key.** No key in source, no key in `.env` committed to git
- App is fully non-functional until a key is pasted
- **No OpenAI key, no OpenAI SDK** — Groq only

### Settings — Editable Fields (with Hardcoded Defaults)
The settings panel must expose the following as editable fields:

- Live suggestions system prompt
- Chat / detailed answer system prompt
- Context window size for live suggestions (how many recent transcript chars/tokens to include)
- Context window size for chat

**Hardcode well-tuned defaults** for all fields — choosing these defaults is a core part of the evaluation.

### Tech Stack (Decided)

| Layer | Choice |
|-------|--------|
| Frontend | React + TypeScript |
| Backend / API routes | Node.js (e.g., Next.js API routes or Express) |
| Styling | Dark mode UI (matches mockup) |
| Hosting | Vercel or Netlify |
| Groq SDK | `groq-sdk` (official Node.js client) |

The UI is treated as a **solved problem** — scaffold it quickly with code generation so all engineering focus goes to:
1. The prompt engineering (context window composition, suggestion typing, latency)
2. The audio chunking architecture (30s chunks → Whisper → GPT-OSS-120B pipeline)

Do not spend time on UI exploration or custom design systems.

### Hosting
- **Deploy publicly** — Vercel or Netlify
- Must be fully functional at a public URL with only a Groq API key paste required

---

## Non-Negotiables

1. **3-column layout** exactly as in the reference mockup. No layout deviations.
2. **Exactly 3 suggestion cards per batch.** Not 2, not 4.
3. **4 suggestion types** — QUESTION TO ASK, TALKING POINT, ANSWER, FACT-CHECK — with colored labels.
4. **Type shown in chat** when a suggestion is clicked (`YOU · FACT-CHECK` style).
5. **Older batches stay visible** below new ones, visually faded.
6. **Batch footer** with batch number and timestamp under each batch.
7. **Auto-refresh countdown** visible in the suggestions column.
8. **Groq only** — `whisper-large-v3` for transcription, `gpt-OSS-120B` for suggestions and chat. Using GPT-4o or any OpenAI model is disqualifying.
9. **No hardcoded API key** anywhere in the codebase.
10. **Deployed and publicly accessible** before submission.
11. **Public GitHub repo** — README covering setup, stack choices, prompt strategy, and tradeoffs.
12. **Export functionality** must work end-to-end.
13. Do **not** over-engineer.

---

## Evaluation Criteria (Priority Order)

1. **Quality of live suggestions** — Useful, well-timed, varied in type and content. This is #1.
2. **Quality of click-through detail answers** — Depth, relevance, use of full transcript context.
3. **Prompt engineering** — What context you pass, how much, how structured, which types you assign and when.
4. **Full-stack integration** — Frontend polish, backend structure, audio capture & chunking, API integration, error handling.
5. **Code quality** — Clean structure, readable, sensible abstractions, no dead code, no stray `console.log`s.
6. **Latency** — Suggestions render fast; first token of chat response arrives quickly.
7. **Overall feel** — Does the app feel responsive and trustworthy during a real conversation?

---

## Deliverables

| Deliverable | Details |
|-------------|---------|
| Deployed web app URL | Public, openable in browser, works once API key is entered |
| GitHub repository | Public or shared; README with setup + stack + prompt strategy + tradeoffs |

---


## Key Notes & Constraints

- **Prompt engineering decisions are the assignment.** When uncertain about a prompt decision, make the call and be ready to defend it.
- **UX uncertainty → follow the reference mockup.** Don't invent UX; replicate it.
- The evaluators will read the code. Write it as if it belongs in a real codebase.
- Evaluating real-time AI usefulness, not production-readiness at scale.
