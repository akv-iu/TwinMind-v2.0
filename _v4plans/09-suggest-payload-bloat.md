# Plan 09 — Suggest Payload Bloat Fix

## Context

### Reported symptom
User observed that the `/api/suggest` payload grows over time: by batch 6–7 of a session, the request includes "the conversation from the beginning." Summary appears in the middle of the prompt; transcript content appears repeated. User believed the model was receiving the same data twice, producing broken responses.

### Root-cause diagnosis (three interacting problems)
1. **Wire-level transcript duplication.** `components/suggestions/SuggestionsColumn.tsx` sends `{transcript, prompt, apiKey}`. The `transcript` field is unused by `app/api/suggest/route.ts` — server reads only `prompt`, which *already contains* the transcript inside its `RECENT_TRANSCRIPT:` section. Pure bandwidth waste; doesn't affect Groq input.
2. **Summary drift — the real bug.** `app/api/summarize/route.ts` sets `max_tokens: 300` (~225 words) while the system prompt only *politely requests* "max 120 words." The summary-of-summaries recursion (`buildSummaryInput` in `lib/summary.ts` passes `priorSummary` + new tail back into the model) lets the model echo transcript content verbatim. Across 5–7 refreshes the summary balloons into a partial transcript. By batch 7 the prompt has: drifted summary holding early-meeting content + recent-transcript tail — same material appears twice.
3. **Client owns prompt assembly.** `buildSuggestPrompt` runs on the client and ships one opaque merged string. Server can't inspect, cap, or log individual fields — so the drift was invisible until manual DevTools inspection.

### Intended outcome
- Suggest and chat payloads stay bounded (sub-linear growth over session duration).
- Summary field has hard ceiling (~800 chars) even if the model ignores the prompt.
- Server has per-field observability via structured metric logs.
- Drift self-heals if it happens.
- No user-visible UX regressions.

### Scope
- **In scope:** suggest pipeline, summarize pipeline, chat pipeline (parity/observability).
- **Out of scope:** audio, classify-meeting, transcribe, UI changes beyond optional dev metrics surfacing, persistence, distributed state.
- **No new Vercel infrastructure** needed (KV, DB, cron all unused).

---

## Phase 1 — Ship-today minimum fix (~1 hour)

### 1.1 Remove duplicate transcript field on the wire
**File:** [twinmind-app/components/suggestions/SuggestionsColumn.tsx](twinmind-app/components/suggestions/SuggestionsColumn.tsx) (line ~121)

Current payload: `{ transcript: recentTranscript, prompt: mergedPrompt, apiKey }`.
Change to: `{ prompt: mergedPrompt, apiKey }`.

Server-side: no change needed (already ignores `body.transcript`).

### 1.2 Tighten summary generation
**File:** [twinmind-app/app/api/summarize/route.ts](twinmind-app/app/api/summarize/route.ts)

- `max_tokens: 300` → `max_tokens: 160` (physically caps output at ~120 words).
- Add to `SUMMARY_SYSTEM_PROMPT` under SAFETY:
  - `- Do NOT quote or echo transcript content verbatim.`
  - `- If PRIOR_SUMMARY contains verbatim quotes, collapse them into topic bullets.`
- After the model response, hard-truncate `summary` to **800 chars**. Prefer cutting at last newline or space ≤ 800; fall back to hard byte cut.
- When truncation fires, add `summaryTruncatedFrom`, `summaryTruncatedTo` to the metric log line.

### 1.3 Drift rejection invariant
**File:** [twinmind-app/app/api/summarize/route.ts](twinmind-app/app/api/summarize/route.ts)

After producing the post-truncated summary, compare to `priorSummary`:
- If `priorSummary.trim().length > 0` AND `newSummary.length > priorSummary.length * 1.5` AND `newSummary.length > 400`:
  - Discard the new summary.
  - Return `{ summary: priorSummary, rejected: 'drift' }`.
  - Log `{status: 'ok', rejected: 'drift', newChars, priorChars}`.
- Client-side behavior: `refreshSummary` already returns the returned `summary`; the rejection case returns `priorSummary` unchanged, so `setSummary(...)` is a no-op. No client change required.
- The `rejected` field is additive metadata — ignore at call site for now.

### 1.4 Raise refresh cadence threshold
**File:** [twinmind-app/lib/summary.ts](twinmind-app/lib/summary.ts)

- `MIN_TRANSCRIPT_CHAR_GROWTH: 1500` → `4000`.
- `MIN_BATCH_GROWTH: 5` unchanged.
- Halves refresh frequency over a 30-min session (~8 refreshes instead of ~15), halving drift opportunities.

### 1.5 Auto-heal on detected drift
**File:** [twinmind-app/components/suggestions/SuggestionsColumn.tsx](twinmind-app/components/suggestions/SuggestionsColumn.tsx)

Inside `fireSuggestions`, before calling `refreshSummary`:
- Read `priorSummary = useStore.getState().summary`.
- If `priorSummary.length > 1500`, pass an empty `priorSummary` to `refreshSummary` — forces a full re-summarize from transcript tail only.
- Log a dev-console warning so this path is visible in testing.
- Self-correcting: if the next refresh also yields > 1500, it re-heals again.

### Phase 1 acceptance
- [ ] Network tab: `/api/suggest` payload never contains a top-level `transcript` field.
- [ ] Over a 15-min manual session, summary never exceeds ~850 chars (check Vercel logs or DevTools on the summarize response).
- [ ] Force drift by artificially lowering the drift threshold or seeding a large prior summary — rejection triggers and metric log shows `rejected: 'drift'`.
- [ ] Summary refresh frequency visibly lower (verify by counting `/api/summarize` calls in Network tab over 10 min; should be ≤ 3).
- [ ] `tsc --noEmit` clean; existing tests pass.
- [ ] New unit tests: truncation at 800 chars, drift rejection invariant, `refreshSummary` with `priorSummary=''` forces full re-summarize.

---

## Phase 2 — Server-side prompt assembly (~3 hours)

### 2.1 New wire contract for `/api/suggest`
Replace current request body `{ transcript, prompt, apiKey }` with structured:
```
{
  transcriptTail: string,          // client pre-trimmed to suggestContextChars
  rollingSummary: string,
  priorBatchesText: string,         // pre-serialized "TYPE: preview" lines, as today
  meetingKind?: MeetingKind,
  intentPrompts: SuggestIntentPrompts,
  apiKey: string,
}
```
Atomic cutover — no dual-shape support. Client and server change together.

### 2.2 Extract prompt builders into a server-safe module
**New file:** `twinmind-app/lib/promptBuilders.ts`

Move from `twinmind-app/store/settingsSlice.ts`:
- `buildSuggestPrompt` + `BuildSuggestPromptContext` interface
- `buildChatPrompt` + `BuildChatPromptContext` interface
- `KIND_CHAT_STYLE_HINTS`

Keep `CHAT_PROMPT_DEFAULT` and `SUGGEST_INTENT_PROMPTS_DEFAULT` in `settingsSlice.ts` (consumed by Settings UI).

Re-export builders from `settingsSlice.ts` for backward compat during the refactor window, then remove.

**Motivation:** `settingsSlice.ts` is a client zustand slice; importing it from `/api/chat/route.ts` today pulls zustand runtime into the server bundle. New file is pure helpers, no zustand import.

### 2.3 Move prompt assembly to `/api/suggest/route.ts`
- Parse new structured fields from body.
- Apply per-field hard caps **on the server** (defense in depth vs client misconfiguration):
  - `transcriptTail` → truncated to 8000 chars.
  - `rollingSummary` → truncated to 1200 chars.
  - `priorBatchesText` → truncated to 1000 chars.
  - Each `intentPrompts[key]` → truncated to 500 chars.
- Call `buildSuggestPrompt(intentPrompts, {recentTranscript, rollingSummary, priorBatches, meetingKind, kindRoleHint, kindExampleBlock})` on the server.
- Use the returned string as the `system` message; `user` message stays `'Generate the suggestion batch JSON now.'` as today.

### 2.4 Structured per-field metric logs
Augment the suggest metric log line:
```
{
  route: 'suggest',
  status,
  latencyMs,
  transcriptChars,
  summaryChars,
  priorBatchesChars,
  promptBytes,          // length of the final system string sent to Groq
  cardsOut,
  degraded,
  meetingKind,
  ...anyTruncationEvents,
}
```
Same pattern added to `/api/chat`, `/api/summarize`, `/api/classify-meeting` (where applicable).

### 2.5 Client update: `SuggestionsColumn.tsx`
- Remove `buildSuggestPrompt` call from the client `fireSuggestions` path.
- Send the structured payload from 2.1. `recentTranscript`, `summary`, `priorBatches`, `meetingKind`, `suggestIntentPrompts` all read from store as today; just send them instead of pre-merging.
- Hash-skip logic (`lastFireHashRef`) keeps using the transcript tail as before.

### 2.6 Chat route parity
**File:** [twinmind-app/app/api/chat/route.ts](twinmind-app/app/api/chat/route.ts)

- Update import path for `buildChatPrompt` to `@/lib/promptBuilders`.
- Apply same per-field caps: `transcript` ≤ 8000, `rollingSummary` ≤ 1200.
- Add structured per-field metric logs matching suggest's shape.

Client (`ChatColumn.tsx`) already sends structured fields (`{transcript, rollingSummary, messages, prompt, meetingKind, apiKey}`) — no client-side change beyond removing any now-dead assembly helpers.

### Phase 2 acceptance
- [ ] `grep "buildSuggestPrompt" twinmind-app/components` returns zero matches (client no longer builds).
- [ ] `lib/promptBuilders.ts` exists; `settingsSlice.ts` no longer contains the builders.
- [ ] Server bundle no longer includes zustand via chat route (optional verify via `pnpm build` output size dip).
- [ ] Metric logs for 20 suggest calls across a 10-min session show `promptBytes` stabilizing under ~11K and not growing linearly.
- [ ] All existing tests pass; new tests cover the new wire shape and per-field caps.

---

## Edge cases (explicit handling)

### Phase 1
| Case | Handling |
|---|---|
| First summary of session (no prior) | Drift rejection skipped; truncation still applies. |
| Model returns empty summary | Existing path: `refreshSummary` returns `''`; `setSummary` no-ops. |
| Summarize route 502 | Existing path: caught by `.catch(...)` in SuggestionsColumn; prior summary retained. |
| Truncation cuts mid-word | Acceptable. Implementation: prefer cutting at last `\n` or ` ` ≤ 800, else hard cut at 800. |
| Auto-heal fires repeatedly | Log every event; if 3+ consecutive heals, something broken — surface via log pattern, no UI alarm. |
| Prior summary is whitespace only | Treated as empty by `.trim().length > 0` guard; rejection skipped. |
| `rejected: 'drift'` returned | Client receives `summary` equal to prior; `setSummary(prior)` is idempotent; no UI change. |

### Phase 2
| Case | Handling |
|---|---|
| Client sends old `prompt` field | Not supported after cutover — server returns 400 `'invalid request shape'`. No dual-mode window. |
| `priorBatchesText` exceeds cap | Truncated; logged via `priorBatchesChars` field. Model may see fewer prior suggestions; acceptable. |
| `intentPrompts` missing entirely | Server falls back to `SUGGEST_INTENT_PROMPTS_DEFAULT` — import into route. |
| `meetingKind` not in valid set | Ignored via existing `VALID_MEETING_KINDS` check (pattern used in chat route today). |
| Zero-char transcript | Server returns `{cards: []}` via existing no-op path. |
| Field value is not a string | 400 `'invalid field type'`. |

---

## Files to modify

### Phase 1
- `twinmind-app/app/api/summarize/route.ts` — prompt strengthening, `max_tokens: 160`, post-truncation at 800, drift rejection, enhanced metric log.
- `twinmind-app/components/suggestions/SuggestionsColumn.tsx` — drop duplicate `transcript` field; add auto-heal branch before `refreshSummary`.
- `twinmind-app/lib/summary.ts` — `MIN_TRANSCRIPT_CHAR_GROWTH: 4000`.
- `twinmind-app/tests/` — new cases for truncation, drift rejection, auto-heal.

### Phase 2
- `twinmind-app/lib/promptBuilders.ts` — **new**.
- `twinmind-app/store/settingsSlice.ts` — move builders out; keep defaults; optionally re-export from new module during transition.
- `twinmind-app/app/api/suggest/route.ts` — new wire contract, server-side assembly, per-field caps, structured logs.
- `twinmind-app/app/api/chat/route.ts` — update import path, per-field caps, structured logs.
- `twinmind-app/components/suggestions/SuggestionsColumn.tsx` — send structured fields instead of merged prompt.
- `twinmind-app/tests/` — tests for new wire contract, per-field truncation.

---

## Existing utilities to reuse (don't reinvent)
- `lib/context.ts::takeTailByChars` — transcript tail windowing.
- `lib/server/withTimeout.ts` — Groq call wrapping.
- `lib/server/rateLimit.ts` — per-route bucket limits (no change needed).
- `lib/server/extractClientIp.ts` — shared IP extractor.
- `lib/clientErrorCopy.ts::normalizeApiErrorCopy` — user-facing error normalization.

---

## Execution order (recommended)
1. Phase 1.4 (bump threshold) — zero risk, ship first.
2. Phase 1.1 (remove duplicate field) — zero risk.
3. Phase 1.2 (summarize tightening) — low risk; watch summary length on next run.
4. Phase 1.3 (drift rejection) — slightly higher risk; verify prior-tracking works.
5. Phase 1.5 (auto-heal) — final Phase 1 item.
6. Verify Phase 1 end-to-end before touching Phase 2.
7. Phase 2.2 (extract builders to `lib/promptBuilders.ts`) — pure refactor, no functional change.
8. Phase 2.1 + 2.3 + 2.5 (new wire contract + server assembly + client update) — atomic commit across route + component.
9. Phase 2.4 (metric logs) — on all routes.
10. Phase 2.6 (chat parity) — import path + caps + logs.

---

## Verification (end-to-end)

1. **Unit tests** (Phase 1):
   - Summarize: model output 2000 chars → response summary ≤ 800 chars.
   - Summarize: prior 500 chars + new 1000 chars → `rejected: 'drift'`, returned summary = prior.
   - `shouldRefreshSummary`: triggers at 4000 char growth, not 1500.

2. **Unit tests** (Phase 2):
   - Suggest: `transcriptTail` of 12000 chars → server truncates to 8000, logs `transcriptChars: 8000`, `transcriptTruncated: true`.
   - Suggest: `rollingSummary` of 2000 chars → server truncates to 1200.
   - Suggest: missing `intentPrompts` → server falls back to defaults; response is still valid.
   - Chat: new import path works; metric log contains `promptBytes`.

3. **Manual verification**:
   - Run a 15-min session with a real transcript.
   - Open Network tab; inspect each `/api/suggest` request body — confirm structured shape, no merged string (Phase 2 done).
   - Inspect each `/api/summarize` response body — confirm `summary` never exceeds ~850 chars.
   - Inspect Vercel logs (or local terminal) — confirm `promptBytes` metric field present and roughly flat from batch 5 onward.
   - Confirm "conversation from the beginning" artifact no longer present in suggestion prompt (the original symptom).

4. **Regression check**:
   - Full UI flow: mic → transcript → suggestion batches → click card → chat stream → export JSON. All works as today.
   - Meeting-kind classifier still fires at batch 3; kind appears in badge.
   - Summary refresh still fires (lower frequency); summary is visible in both suggest and chat prompts.

---

## Vercel pre-deploy flags (not part of this plan — for separate conversation)
- **Function timeout**: Hobby tier is 10s; our `withTimeout(..., 12000)` for suggest/chat will be killed at 10s. Either raise tier (Pro default 15s, configurable to 300s via `maxDuration` export) or lower timeouts.
- **Rate-limit statelessness**: unchanged — buckets already reset per Lambda instance, acknowledged as deterrent.
- **Structured logs**: Vercel's Logs tab picks up every `console.log` automatically; the new per-field fields are searchable there.

These are pre-existing concerns and independent of Plan 09.

---

## Success criteria summary
- Summary field never exceeds 850 chars over a 30-min session.
- `promptBytes` in suggest metric stabilizes under 11K by batch 5 and stays flat.
- Zero user-visible regressions in suggest, chat, export, mic flow.
- Drift self-heals within 1 refresh cycle after detection.
- Per-field observability present in all API route metric logs.
