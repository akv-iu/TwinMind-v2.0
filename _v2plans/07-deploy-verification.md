# Plan 07 — Deploy + Verification

## Summary
Land all earlier plans. Run a real 30-minute meeting end-to-end. Update the README. Deploy to Vercel under the user's account.

## Dependencies
- **All of 01–06 must be landed** before starting this plan.

## Files touched
1. [twinmind-app/README.md](twinmind-app/README.md) — rewrite sections
2. Vercel dashboard — env var config
3. No code changes

## Step 1 — Pre-deploy checklist
Run from `twinmind-app/`:
- [ ] `pnpm install` (or `npm install`) clean.
- [ ] `pnpm tsc --noEmit` → zero errors.
- [ ] `pnpm test` → all green.
- [ ] `pnpm build` → clean build.
- [ ] `grep -r "gsk_" --exclude-dir=node_modules --exclude-dir=.next .` → only matches are in user-facing placeholder text (`gsk_...` in settings modal).
- [ ] `grep -rn "console.log" twinmind-app/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.next'` → only structured metric logs remain.
- [ ] `grep -r "CLARIFYING_INFO" twinmind-app/ --exclude-dir=node_modules` → zero matches (Plan 01 verification).

## Step 2 — Environment variables
In Vercel project settings (Settings → Environment Variables), for Production and Preview:
- `ALLOWED_ORIGINS` = `https://<your-prod-domain>.vercel.app` (add preview URLs comma-separated if you want previews to work)

No other env vars. The app is key-less server-side.

## Step 3 — Deploy
- `git push origin main` (or run `vercel --prod` locally).
- Wait for build to complete.
- Open the production URL in a fresh incognito window.
- Open Settings, paste a valid Groq key.
- Start recording. Talk for 60 seconds. Verify:
  - Transcript lines appear every ~6s.
  - Suggestion badge shows `1 BATCH` after ~30s.
  - Click a suggestion → chat bubble appears, streaming response begins.

## Step 4 — 30-minute verification session
Use a 30-minute audio source (podcast, recorded meeting, or live conversation). This is the real test — aim for one uninterrupted run from start to finish.

**Setup:**
- Fresh incognito tab on prod URL.
- Open browser DevTools → Network tab → preserve log.
- Start recording. Play the 30-min audio into the mic (or speak continuously).

**Checklist during/after:**
- [ ] Transcript accumulates continuously with no multi-minute stalls.
- [ ] Suggestion batches refresh every 30s ±3s.
- [ ] Each batch has **exactly 3 cards OR 0 cards** (with "waiting for substance" strip).
- [ ] Across the session, each of the 4 types appears at least once.
- [ ] At least 2 distinct types within every non-empty batch.
- [ ] Duplicate previews between consecutive batches are rare (eyeball — should be <1 in 5 batches).
- [ ] Rolling summary payload appears in `/api/suggest` request body from ~batch #5 onward (verify in Network tab).
- [ ] Click at least 3 suggestions → responses reference transcript moments ("around HH:MM"), stream arrives within 3s to first token.
- [ ] Type a free-form question unrelated to the meeting → response clearly tags *"(general knowledge, not from this meeting)"*.
- [ ] Export the session at the end → JSON opens, contains full transcript + all batches + full chat history.
- [ ] No `console.error` or red flags in browser DevTools during the entire session.
- [ ] Mid-session, simulate a dropped chunk by temporarily blocking `/api/transcribe` in DevTools for ~5s → retries recover; transcript may skip a chunk but session continues without user-visible error (or shows a transient retry toast that clears).

## Step 5 — README rewrite
`twinmind-app/README.md` should cover:

### Sections
1. **What this is** — one paragraph: live meeting copilot, 3 columns, session-only, Groq-only.
2. **Quick start**:
   - `pnpm install`
   - `pnpm dev`
   - Open http://localhost:3000
   - Paste Groq API key in Settings
3. **Stack**:
   - Next.js App Router (Node runtime for API routes)
   - React + TypeScript + Tailwind
   - Zustand (with `persist` on settings → sessionStorage)
   - Groq SDK: `whisper-large-v3` (transcription), `openai/gpt-oss-120b` (suggestions + chat + summaries)
4. **Prompt strategy**:
   - 4 typed suggestion cards per batch (QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK)
   - Prior-batch memory sent to model each cycle to prevent duplicates
   - Rolling summary refreshed every ~5 batches for 30-min+ meetings
   - No-op escape: model legitimately returns 0 cards during silence/filler
   - Strict JSON schema output (`json_schema` with fallback to `json_object`)
   - Chat prompt: grounded in transcript, tags general knowledge explicitly, injection guard
5. **Audio pipeline**:
   - 6-second record-stop-restart cycles
   - Serial upload queue with retry/backoff (250ms/1s/3s) on 5xx/429/network
   - Known limitation: ~1% audio loss at cycle boundaries (acceptable for this assignment)
6. **API hardening**:
   - Origin allow-list via `ALLOWED_ORIGINS` env var
   - In-memory per-IP rate limits (suggest 10/min, chat 30/min, transcribe 60/min, summarize 5/min)
   - Per-call Groq timeouts (suggest/chat 12s, transcribe 25s, summarize 15s)
   - No transcript/prompt/key ever written to server logs
7. **Tradeoffs taken**:
   - In-memory rate limit is per-instance — deterrent, not fortress.
   - No dual-recorder crossfade — simpler code, tiny audio gaps accepted.
   - Chat uses last 8000 chars + rolling summary — not full retrieval; adequate for 30–60 min sessions.
   - Key in sessionStorage — survives reload, wiped on tab close.

## Acceptance criteria
- [ ] Public Vercel URL loads in incognito.
- [ ] Only action required to reach full functionality is pasting a Groq key.
- [ ] 30-minute verification checklist (Step 4) all boxes ticked.
- [ ] README covers the 7 sections above.
- [ ] Final `grep` sweep for `CLARIFYING_INFO`, hardcoded keys, and PII logging returns clean.
- [ ] All REQUIREMENTS.md non-negotiables (see `00-overview.md`) pass.

## Time estimate
**2 hours** (mostly verification, not coding).

## Risk
Low if 01–06 landed cleanly. The one real risk is Groq rate limits / transient outages during the 30-min session — the retry logic + API hardening should absorb this. If the session hits a hard wall, document it as a known limitation in the README.
