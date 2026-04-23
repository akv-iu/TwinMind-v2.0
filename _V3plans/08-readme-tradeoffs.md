# Plan 08 — README Tradeoffs & Documentation

## Summary
The current `twinmind-app/README.md` was updated in the v2 round but doesn't yet reflect the v3 features (meeting-kind adaptation, summary-of-summaries, SSE keepalive, LRU eviction, export enrichment) and doesn't document the known tradeoffs evaluators should see. This plan rewrites the README sections the evaluator will read.

This is the last plan before deployment. It writes words, not code.

## Dependencies
- **All of Plans 01–07** should be landed. Otherwise you're documenting features that don't exist.

## Files touched
1. [twinmind-app/README.md](twinmind-app/README.md) — rewrite sections 3–7

## Required sections
Keep sections 1 and 2 (What this is / Quick start) roughly as-is if they exist. Rewrite or add the following.

### Section 3 — Stack
```
- Next.js App Router (Node runtime on all API routes; edge runtime on /middleware for origin checks)
- React 19 + TypeScript + Tailwind
- Zustand with `persist` middleware (sessionStorage for API key + settings)
- Groq SDK
  - whisper-large-v3 — audio transcription (6s chunks)
  - openai/gpt-oss-120b — suggestions, chat, summary, meeting-kind classification
```

### Section 4 — Prompt strategy
Write this as a numbered list of decisions, not a wall of text:

1. **Four typed suggestion cards per batch**: QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK. No 5th type, per spec.
2. **Prior-batch memory**: every cycle includes the last 2 batches so the model avoids repeating itself.
3. **Rolling summary**: refreshed every ~5 batches OR every 1500 new transcript chars. Uses **summary-of-summaries** — new summary folds in the previous one — so meetings >30 min don't lose the early context.
4. **Meeting-kind adaptation**: at batch #3 (~90 seconds in), a one-shot classifier tags the meeting as one of 8 kinds (standup, sales, 1:1, design_review, interview, brainstorm, presentation, other). Suggest and chat prompts inject a kind-specific role hint and kind-specific few-shot examples.
5. **No-op escape**: the model may legitimately return `{"cards": []}` when the last ~60s is silence or filler. UI shows a subtle *"waiting for substance…"* strip instead of fabricating.
6. **Type variety enforcement**: server-side validator rejects a batch of 3 identical types. If that happens, the server retries once with a stronger nudge; if still monotype, only the first card is kept and the batch is flagged `degraded` in the UI footer.
7. **Strict JSON schema output** with automatic fallback to `json_object` + client-side schema validation if the model rejects `json_schema` for any reason.
8. **Chat prompt contract**: grounded in transcript, tags general knowledge explicitly *(e.g. "general knowledge, not from this meeting")*, 80–200 word default, injection guard on transcript content.
9. **Summary injection guard**: the summarizer treats transcript content as untrusted data and never follows instructions inside it, so prompt injection in speech can't propagate into downstream prompts.
10. **Empty-state chat**: when a user chats before starting the mic, the prompt switches to a general-assistant branch — the model does NOT pretend to reference a transcript that doesn't exist.

### Section 5 — Audio pipeline
```
- 6-second record-stop-restart cycles. Each cycle produces a self-contained WebM/Opus file for Whisper.
- Serial upload queue with retry/backoff on 5xx/429/network failures: 250ms → 1s → 3s, then fails visibly.
- Client-side tail-dedup across cycle boundaries.
- Live track listeners surface device-level mute/unplug events in the UI.
```

### Section 6 — API & security hardening
```
- Origin allow-list: set ALLOWED_ORIGINS env var for production; localhost allowed automatically in dev.
- In-memory per-IP token bucket: suggest 10/min, chat 30/min, transcribe 60/min, summarize 5/min, classify-meeting 3/min. LRU-evicted after 10 min idle.
- Upstream timeouts: suggest/chat 12s first-byte, transcribe 25s, summarize 15s, classify 10s.
- SSE keepalive: /api/chat emits a keep-alive comment every 15s to prevent proxy cutoff on slow Groq streams.
- Client abort forwarded to Groq on user cancel / new-message / unmount.
- Single-flight chat: stale stream tokens are dropped by requestId.
- No transcript, prompt, message, or API key content is ever written to server logs — only structured metric JSON.
```

### Section 7 — Tradeoffs taken
Be explicit — evaluators like to see you understood your own choices.

```
- In-memory rate limit is per-Vercel-instance. It's a deterrent against casual abuse, not a distributed hard guarantee. A dedicated KV/Redis store would give global limits; out of scope for this assignment.
- Record-stop-restart audio cycles lose ~20–50ms between cycles (~<1% of a 30-min session). A dual-recorder crossfade would close this gap; deferred as not justified for the assignment workload.
- Chat history is capped at the last 20 turns server-side. Older turns are implicitly in the transcript + rolling summary, but verbatim recall past 20 turns is not guaranteed.
- Meeting-kind classification is one-shot (fires once per session around batch #3). If the meeting type shifts mid-session (e.g. standup → deep-dive), the prompt stays on the original kind. Future work: re-classify every N batches if topic drift detected.
- Summary-of-summaries drifts slightly over many generations. We re-summarize from scratch (ignoring prior) on manual session reset; a periodic "full re-summary every 10 cycles" is a future addition.
- API key persistence: sessionStorage (survives tab reload, wipes on tab close). No cross-device or cross-tab sync. Matches the spec's "session-only" framing.
- Middleware origin allow-list is explicit per route. New API routes must be added to the matcher list to receive origin protection.
```

### Section 8 — Known limitations (short)
```
- Rate limit is per-instance, not distributed.
- Meeting-kind is one-shot per session.
- Chat recall degrades gradually past 20 turns.
- Whisper may hallucinate during silent stretches; the "waiting for substance…" strip mitigates cascading hallucinations into suggestions.
- Some browsers (Firefox) have limited MediaStreamTrack mute/unmute event support; the mic-muted banner may not fire there.
```

### Section 9 — Env vars
```
- ALLOWED_ORIGINS=https://<prod>,https://<preview>   (comma-separated; localhost allowed automatically if empty in dev)
```
Nothing else. No Groq key in env — user pastes their own.

### Section 10 — Scripts
Standard Next.js:
```
- pnpm install / npm install
- pnpm dev
- pnpm build
- pnpm start
- pnpm test
```

## Style notes
- Keep it under ~200 lines total. Evaluators skim.
- No emojis.
- Use `code blocks` for env vars, file paths, model IDs.
- Bullet lists, not prose paragraphs.
- One line per decision in the prompt-strategy section — avoid justification text.
- Do NOT duplicate REQUIREMENTS.md content. The README describes what was built; REQUIREMENTS describes what was asked for.

## Acceptance criteria
- [ ] README has all 10 sections above (or merges sensibly where existing sections overlap).
- [ ] Tradeoffs section explicitly names ≥5 tradeoffs with a one-line reason each.
- [ ] Known limitations section has ≥5 items.
- [ ] Prompt strategy section numbers every design decision (1–10 above).
- [ ] Quick start works from a fresh clone (manual verification: `pnpm install && pnpm dev` → open localhost → paste key → record).
- [ ] No accidental mention of features that didn't land. If Plan 04 slipped, remove meeting-kind from sections 4, 5, 6, 7.

## Time estimate
**1 hour.** Writing words, not code.

## Risk
None. Worst case the README has a typo. Fix it in the next commit.
