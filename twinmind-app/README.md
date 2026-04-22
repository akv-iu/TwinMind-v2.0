# TwinMind v2 - Live Suggestions Assignment

Single-page meeting copilot built with Next.js + TypeScript.

## Status

- Step 1 to Step 5 implemented and verified
- Tests passing, TypeScript clean, production build passing
- Deployment URL: TODO

## Core Features

- 3-column layout:
  - `1. MIC & TRANSCRIPT`
  - `2. LIVE SUGGESTIONS`
  - `3. CHAT (DETAILED ANSWERS)`
- Microphone recording with chunked transcription via Groq Whisper
- Live suggestion batches every 30 seconds (manual reload supported)
- Click-through chat with streamed assistant responses via SSE
- Session export as JSON
- In-memory session only (no persistence)

## Tech Stack

- Frontend: Next.js App Router, React 19, TypeScript
- State: Zustand (slice-based)
- Styling: Tailwind CSS v4 (dark-mode class variant)
- AI provider: Groq only
  - Transcription: `whisper-large-v3`
  - Suggestions: `gpt-OSS-120B`
  - Chat: `gpt-OSS-120B`
- Tests: Vitest + jsdom

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000`

4. Open Settings and paste your Groq API key.

Note: the app intentionally stays non-functional until a key is provided.

## Commands

```bash
npm run test
npx tsc --noEmit
npm run build
```

## Architecture

- `app/api/transcribe/route.ts`: multipart transcription proxy
- `app/api/suggest/route.ts`: live suggestion generation + normalization to 3 cards
- `app/api/chat/route.ts`: streamed SSE responses for chat
- `store/*Slice.ts`: isolated state slices for transcript, suggestions, chat, settings
- `components/*`: per-column UI and shared layout primitives
- `lib/export.ts`: session export shaping and download
- `lib/hooks/useAudioRecorder.ts`: audio capture and overlap strategy

## Prompt Strategy

- Suggest prompt is constrained to typed, actionable outputs and JSON formatting.
- Suggestion context uses a sliding character window (`suggestContextChars`) from recent transcript text.
- Chat prompt is separate and uses a larger transcript window (`chatContextChars`) plus conversation history.
- Both prompt strings and context windows are editable from Settings with tuned defaults.

## Tradeoffs

- Character-based context windows are simple and fast but less token-precise.
- In-memory state avoids persistence complexity and matches assignment constraints.
- Suggestion normalization pads/trims to guarantee exactly 3 cards, trading strictness for resilience.
- API key is stored in client state for this session only; no backend key storage.

## Reference App Notes

Capture your own notes after using the real TwinMind app:
- Timing feel compared to this build
- Suggestion quality and type balance
- Chat response style and latency expectations

## Deployment Checklist

- Deploy to Vercel or Netlify
- Confirm public URL works
- Confirm only Groq key paste is required
- Add deployed URL in this README

## Safety / Constraints

- No OpenAI SDK usage
- No hardcoded API keys
- Groq imports are limited to `app/api/*` routes
