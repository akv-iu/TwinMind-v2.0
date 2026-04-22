# TwinMind v2 — 3-Day Implementation Plan (Overview)

## Goal
Ship a spec-compliant, 30-minute-ready meeting copilot by end of Day 3. Prioritize prompt quality (evaluation criteria #1–3) over everything else. Audio pipeline gets only minimum-viable hardening.

## Plan files
| # | File | Headline |
|---|------|----------|
| 00 | `00-overview.md` | This file: dependency graph, day-by-day, non-negotiables checklist |
| 01 | `01-type-compliance.md` | Drop `CLARIFYING_INFO`, restore 4-type contract |
| 02 | `02-audio-retry.md` | Retry/backoff inside `sendChunk` (1h insurance fix) |
| 03 | `03-suggestion-pipeline.md` | Prompt rewrite + prior-batch memory + rolling summary + no-op escape + strict JSON schema + kill silent padding |
| 04 | `04-chat-pipeline.md` | Chat prompt rewrite + abort forwarding + single-flight + delete JSON-rescue renderer |
| 05 | `05-api-hardening.md` | Origin check + per-IP rate limit + request timeouts + remove transcript logging |
| 06 | `06-ux-polish.md` | Settings modal dismiss bug + API key persistence + scroll throttle + dead code |
| 07 | `07-deploy-verification.md` | 30-min end-to-end test + README + deploy |

## Dependency graph
```
01 Type Compliance  ─┬──► 03 Suggestion Pipeline ─┬──► 07 Deploy + Verify
                     │                            │
02 Audio Retry (independent) ──────────────────────┤
                     │                            │
                     ├──► 04 Chat Pipeline ───────┤
                     │                            │
                          05 API Hardening ───────┤
                                                  │
                          06 UX Polish ───────────┘
```
- **01 blocks 03 and 04** (they operate on the 4-type universe).
- **03 introduces `lib/summary.ts` and `/api/summarize`** which 04 may optionally consume.
- **02, 05, 06 are independent** and can land in any order.
- **07 requires 01–06 all landed**.

## Day-by-day
- **Day 1:** 01 (Type Compliance, 30min) → 02 (Audio Retry, 1h) → 03 start (Suggestion prompt rewrite + strict JSON schema + kill silent padding)
- **Day 2:** 03 finish (rolling summary + `/api/summarize` + prior-batch memory + no-op UI) → 04 (Chat Pipeline) → 05 (API Hardening)
- **Day 3:** 06 (UX Polish) → 07 (manual 30-min verification + README update + production deploy)

## Non-negotiables checklist (from REQUIREMENTS.md)
To verify at the end of plan 07:
- [ ] Three-column layout preserved
- [ ] Exactly 3 cards per batch (or 0 for no-op escape)
- [ ] Exactly **4** suggestion types — QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK (no 5th)
- [ ] Type shown on chat user bubble (`YOU · FACT-CHECK`)
- [ ] Older batches visibly faded
- [ ] Batch footer with `— BATCH N · HH:MM:SS —`
- [ ] Auto-refresh countdown visible
- [ ] Groq only: `whisper-large-v3` + `openai/gpt-oss-120b`
- [ ] No hardcoded API key anywhere in source
- [ ] Deployed publicly + functional with only a Groq key paste
- [ ] Public GitHub repo with README (setup, stack, prompt strategy, tradeoffs)
- [ ] Export (JSON) works end-to-end
- [ ] No `console.log` of transcript/prompt/key content in server or client

## Key design decisions locked in
- **CLARIFYING_INFO dropped** — per spec's 4-type non-negotiable.
- **Audio pipeline unchanged structurally** — record-stop-restart stays, only retry added.
- **Rolling summary + prior-batch memory** — enables 30-min meetings and kills duplicate batches. Adds 1 Groq call per ~5 batches.
- **API key persistence** — sessionStorage, not localStorage.
- **Rate limit** — in-memory token bucket (per-instance); documented tradeoff.
- **No-op escape** — model may return 0 cards when nothing substantive is happening; UI shows "waiting for substance…" strip, does not fabricate.
