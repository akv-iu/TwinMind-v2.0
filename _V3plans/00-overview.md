# TwinMind v3 — Finishing Plan (Overview)

## Goal
Close every open item from the v2 code review. All fixes are additive or surgical; no architectural shifts. Deployment and manual verification are **explicitly out of scope** — they'll happen after all 01–08 land.

## Prerequisite: commit the working tree
Before starting any plan below, commit the current `git status` dirty state:

```
README.md
app/api/chat/route.ts
app/api/suggest/route.ts
app/api/summarize/route.ts
app/api/transcribe/route.ts
components/chat/ChatColumn.tsx
components/settings/SettingsModal.tsx
components/suggestions/SuggestionsColumn.tsx
lib/hooks/useAudioRecorder.ts
lib/clientErrorCopy.ts  (untracked)
store/index.ts
store/settingsSlice.ts
```

These are Plan 05/06 items from v2 that haven't landed in a commit yet. Losing them = losing real work. Commit as `"v2 plans 05/06 completion: client error copy, settings dismiss, sessionStorage persist"`.

## Plan files
| # | File | Headline | Priority |
|---|------|----------|----------|
| 00 | `00-overview.md` | This file | — |
| 01 | `01-chat-history-integrity.md` | Stop failed assistant bubbles from polluting future turns; fix empty-bubble flash; collapse competing scroll effects | **Critical** |
| 02 | `02-suggestion-correctness.md` | Enforce type variety in validator; fix frozen countdown; AbortController; input-hash skip; surface `degraded` flag | **Critical** |
| 03 | `03-prompt-safety-empty-state.md` | Injection guard on summary prompt; chat branch for "no transcript yet"; lift chat prompt into a builder | **Critical (security)** |
| 04 | `04-meeting-kind-adaptation.md` | One-shot classifier + kind-aware prompt branching — the biggest spec-criterion-3 gain | **Must-have** |
| 05 | `05-audio-stream-resilience.md` | SSE keepalive on chat; track-mute/ended listeners; upload queue try/catch | **Must-have** |
| 06 | `06-long-session-scaling.md` | Summary-of-summaries for >24K char transcripts; server-side chat history cap | Important |
| 07 | `07-infra-hygiene.md` | Rate-limit LRU eviction; explicit middleware matcher; dev-IP uniqueness; error-code schema fallback; richer export | Important |
| 08 | `08-readme-tradeoffs.md` | Tradeoffs + known limitations + updated stack/prompt strategy sections | Nice-to-have |

## Dependency graph
```
PREREQ: commit working tree
                    │
        ┌───────────┼──────────────┬──────────────┐
        ▼           ▼              ▼              ▼
    Plan 01     Plan 02        Plan 03        Plan 05
 (chat history) (suggest ux)  (prompt safety) (streams/audio)
        │           │              │              │
        └─────┬─────┴──────────────┘              │
              ▼                                   │
           Plan 04                                │
      (meeting-kind)                              │
              │                                   │
              └────────┬──────────────────────────┘
                       ▼
                    Plan 06
               (long sessions)
                       │
                       ▼
                    Plan 07
                 (infra hygiene)
                       │
                       ▼
                    Plan 08
                   (README)
```
- **01, 02, 03, 05** are fully independent — parallelizable.
- **04** depends on 03 (uses the new chat-prompt builder and summary injection guard).
- **06** touches chat + summarize routes, so easier after 01, 03 stabilize.
- **07, 08** are last — batched tidy-up.

## Ordering rationale
1. **01 & 02 first** — pure correctness, each bug hits one of the top three eval criteria.
2. **03 next** — security guard + empty-state UX, quick but must-have.
3. **04 as the headline feature** — meeting-kind adaptation directly answers eval criterion #3 ("different types of meetings"). Biggest single quality lift.
4. **05 in parallel with 01–04** — stream/audio resilience, independent, done alone.
5. **06** — optimizes the 30-min+ case once prompts and flows are right.
6. **07 & 08** — infra polish and documentation, cheap close-out.

## Suggested schedule (if 2 days)
- **Day 1 AM:** Prerequisite commit → Plans 01 + 02 (both small, can land same morning).
- **Day 1 PM:** Plans 03 + 05 (both independent, parallelize).
- **Day 2 AM:** Plan 04 (biggest workstream).
- **Day 2 PM:** Plans 06 + 07 + 08, final `tsc --noEmit` + test sweep.

## Final acceptance checklist
After all 8 plans land, confirm:
- [ ] `tsc --noEmit` clean; tests green.
- [ ] `git grep CLARIFYING_INFO` → 0 matches.
- [ ] `git grep "console.log" app lib store components` → only structured metric logs.
- [ ] Suggest batch always contains ≥2 distinct types OR is empty (`waiting for substance`).
- [ ] Failed assistant bubbles never flow into future chat turns.
- [ ] Mic unplug mid-session shows a UI indicator (`mic muted`).
- [ ] Chat stream kept alive across 60s+ Groq stalls (no silent cutoff).
- [ ] A 45-min simulated session produces coherent final-state suggestions (summary-of-summaries path exercised).
- [ ] Injection like *"ignore previous instructions"* in transcript does not alter model output.
- [ ] Meeting-kind classifier has fired once per session and kind is visible in store devtools.
- [ ] README has "Tradeoffs" and "Known limitations" sections.
