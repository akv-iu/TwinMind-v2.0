# TwinMind v2

## What this is
TwinMind v2 is a live meeting copilot with a fixed 3-column UI: mic/transcript, live suggestions, and detailed chat. It runs session-only in the browser, uses Groq only for inference, and starts working after the user pastes their Groq key in Settings.

## Quick start
```bash
pnpm install
pnpm dev
```

If you use npm:
```bash
npm install
npm run dev
```

Then open `http://localhost:3000`, open Settings, and paste your Groq API key.

## Stack
- Next.js App Router with Node runtime API routes
- React + TypeScript + Tailwind CSS
- Zustand slices with `persist` for settings only (`sessionStorage`)
- Groq SDK models: `whisper-large-v3` for transcription and `openai/gpt-oss-120b` for suggestions, chat, and rolling summaries

## Prompt strategy
- Suggestion batches produce exactly 3 cards when substantive context exists, with 4 possible types: `QUESTION_TO_ASK`, `TALKING_POINT`, `ANSWER`, `FACT_CHECK`
- Prior-batch memory is passed each suggestion cycle to reduce duplicate previews.
- Rolling summary is refreshed roughly every 5 batches to keep long meetings coherent.
- No-op escape is supported: model can return `{"cards":[]}` during silence/filler.
- Suggest endpoint enforces strict JSON schema (`json_schema`) with fallback to `json_object` if schema validation fails upstream.
- Chat prompt is transcript-grounded, asks for explicit general-knowledge tagging, and includes prompt-injection guardrails.

## Audio pipeline
- Recorder runs 6-second record-stop-restart cycles.
- Chunks are uploaded in a serial queue (single in-flight by design).
- Retries/backoff on 5xx/429/network: `250ms -> 1s -> 3s`.
- Known limitation: small boundary loss can happen at cycle transitions (acceptable tradeoff for assignment scope).

## API hardening
- Origin allow-list via `ALLOWED_ORIGINS`.
- In-memory per-IP token buckets: suggest `10/min`, chat `30/min`, transcribe `60/min`, summarize `5/min`
- Upstream timeouts: suggest `12s`, chat `12s`, transcribe `25s`, summarize `15s`
- Server logs are metric-only; transcript/prompt/key payloads are not logged.

## Tradeoffs taken
- In-memory rate limits are per-instance deterrents, not distributed enforcement.
- No dual-recorder crossfade pipeline; simpler implementation with minor chunk-boundary loss.
- Chat context uses transcript tail + rolling summary, not full retrieval indexing.
- Groq key is in `sessionStorage`: survives reload in same tab, cleared on tab close.

## Deploy notes (Vercel)
- Set `ALLOWED_ORIGINS` in Vercel for Production and Preview.
- Value format example: `https://your-app.vercel.app` (or comma-separated with preview domains).

No backend secret key is needed for model calls because users provide their own Groq key in Settings.
