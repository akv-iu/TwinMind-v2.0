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

### Suggestion context: checkpointed delta architecture
The core challenge with live suggestions is keeping the model's context window bounded and non-redundant as a meeting grows. A naive approach — sending a full sliding transcript tail every 30 seconds — means by batch 7 the model sees the same content twice: once in a drifted rolling summary and again in the transcript tail.

The solution is a checkpointed delta model:

```
Batches 1–4   transcript tail only (no summary yet)
Checkpoint 1  summary₁ = summarize(transcript 1–4)

Batch 5       context: summary₁  +  delta(batch 5 only, ~30s)
Batch 6       context: summary₁  +  delta(batches 5–6, ~60s)
...
Checkpoint 2  summary₂ = summarize(summary₁ + delta(5–8))

Batch 9       context: summary₂  +  delta(batch 9 only, ~30s)
```

The delta resets after each checkpoint. The suggest prompt always receives a committed summary (covering everything before the checkpoint) plus a short delta (30s–2 min of fresh transcript). These two fields never overlap. Prompt size is bounded regardless of meeting length.

### Suggestion card types and intent decomposition
Each suggestion batch produces exactly 3 cards typed as `QUESTION_TO_ASK`, `TALKING_POINT`, `ANSWER`, or `FACT_CHECK`. Rather than one monolithic system prompt for all types, the settings expose per-type intent descriptions that are injected directly into the prompt alongside each type label. This gives the model a calibrated target for each category rather than applying a single generic instruction to all four.

Default intent descriptions were tuned to push for specificity: QUESTION_TO_ASK requests a pointed clarifying question that moves a decision forward (not open-ended filler); TALKING_POINT asks for a specific fact or metric from the conversation (not a generic topic to raise); ANSWER requests a direct response to something just asked (not "here are some considerations"); FACT_CHECK asks the model to name the specific claim and what to verify (not a vague flag).

### Three-attempt repair pipeline
JSON output from LLMs is unreliable under high concurrency. The suggest route uses three progressive attempts:
1. **Primary**: full system prompt with type + preview schema; parse result
2. **Repair**: if < 3 cards parsed, send a minimal repair prompt with the malformed output + transcript tail, lower temperature
3. **Force-nonempty**: if still 0 cards but transcript has substantive content (≥18 words after stripping timestamps), force a final attempt with an explicit non-empty instruction

This avoids showing "waiting for substance" when the model produced something parseable but malformed.

### Prompt-size math
- Suggest delta: ~500–2000 chars (30s–2 min of speech at ~150 chars/30s)
- Rolling summary: capped at 800 chars on the server after each checkpoint
- Prior batch previews: capped at 1000 chars (2 recent batches)
- Intent prompts: capped at 500 chars each
- Total suggest prompt: ~4–7 KB, stable from batch 5 onward regardless of session length

Chat uses an 8000-char transcript tail + rolling summary for richer context, since chat responses are on-demand and longer latency is acceptable.

### Chat prompt design
The chat system prompt instructs the model to anchor claims to the transcript with timestamps, explicitly tag anything not supported by the transcript as `(general knowledge, not from this meeting)`, and respond in 80–200 words by default. The "general knowledge tagging" rule is the most important: it prevents the model from confidently hallucinating things it can't actually know from the transcript.

Meeting-kind classification fires at batch 3 (`gpt-oss-120b` with temperature 0.1). Once classified, both the suggest and chat prompts receive a kind-specific role hint and example block, shifting tone appropriately (standup → blockers/owners/next actions; sales → buyer intent/objections/stakeholders; etc.).

## Audio pipeline
- Recorder runs 6-second record-stop-restart cycles (vs MediaRecorder timeslice mode which caused transcript gaps under load).
- Chunks are uploaded in a serial queue (single in-flight by design) to avoid out-of-order Whisper responses.
- Retries/backoff on 5xx/429/network: `250ms → 1s → 3s`.
- Whisper output is deduplicated across chunk boundaries using suffix/prefix word matching to catch repeated phrases at cycle transitions.
- Known limitation: small boundary loss can happen at cycle transitions (acceptable tradeoff for assignment scope).

## API hardening
- Origin allow-list via `ALLOWED_ORIGINS` env var.
- In-memory per-IP token buckets: suggest `10/min`, chat `30/min`, transcribe `60/min`, summarize `5/min`.
- Upstream timeouts: suggest `12s`, chat `12s`, transcribe `25s`, summarize `15s`.
- Server-side field caps on every route (transcript, summary, prior batches, intent prompts) as defense-in-depth against client misconfiguration.
- Structured metric logs on every route (`promptBytes`, `transcriptChars`, `summaryChars`, `latencyMs`) — searchable in Vercel Logs.
- Prompt/transcript/key payloads are never logged.

## Tradeoffs taken
- **In-memory rate limits** are per-Lambda-instance deterrents, not distributed enforcement. Acceptable at assignment scale.
- **No crossfade dual-recorder**: simpler record-stop-restart cycle with a small boundary gap is better than the added complexity of overlapping MediaRecorder instances.
- **Chat context uses tail + summary, not retrieval indexing**: good enough for a single session where the full meeting fits in ~8000 chars.
- **Session-only state** (`sessionStorage`): no database, no login, no cross-session history. Intentional — eliminates the entire persistence surface.
- **Groq key in sessionStorage**: survives page reload within the same tab, cleared on tab close. The key never leaves the browser except in API request bodies over HTTPS.
- **Summary token cap (220 tokens / ~160 words)**: tight enough to prevent verbatim transcript echoing in the summary, large enough for 5–6 substantive bullets covering a whole meeting.

## Deploy notes (Vercel)
- Set `ALLOWED_ORIGINS` in Vercel environment variables for Production and Preview.
- Value format: `https://your-app.vercel.app` (comma-separated to include preview branch URLs).
- No backend secret key needed — users provide their own Groq key in Settings.
