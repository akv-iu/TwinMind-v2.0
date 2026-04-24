# Building TwinMind: Getting the Context Window Wrong (Three Times)

---

## The problem looked simple

A meeting copilot. Mic → transcript → AI suggestions, live. Three columns. How hard could it be?

The first version was embarrassingly simple: grab the last 3000 characters of transcript, paste it into a prompt, ask the model for three suggestion cards. It worked. In a 3-minute demo it worked great. Suggestions were relevant, latency was fine, the UI felt snappy.

Then I ran it for 15 minutes.

---

## When the meeting keeps going

By minute 10, something went soft. The suggestions started sounding like advice from a corporate wellness seminar. "You might want to clarify that point." "Consider asking a follow-up question." Technically suggestions. Completely useless.

The diagnosis was obvious: the model was losing context. Fifteen minutes of speech doesn't fit in 3000 characters. The tail window was sliding forward and dropping everything that happened before minute 8. By batch 10 the model was working blind on recent fragments with no memory of what came before.

The obvious fix: add a rolling summary. Before each suggestion call, summarize everything that happened so far, then send `summary + recent tail`. Model gets the history of the full meeting plus the freshness of what just happened. Standard stuff.

Added it. Suggestions got specific again. Moved on.

---

## The window that didn't move

Here's the thing I didn't think about: once you have a summary, you need the tail window to start *after* where the summary ends. Otherwise you're sending summary-of-everything plus tail-of-everything and the model is reading the whole meeting twice.

That's exactly what happened. The summary covered minutes 1–12. The tail window still started from the beginning, still sent minutes 1–12 in raw form. The prompt doubled in size and had the same content in two different representations — once as compressed bullets, once as verbatim transcript. The suggestions got confused and repetitive. The model was cross-referencing itself.

So the fix seemed straightforward: once the summary is done, advance the tail window to start from where the summary left off. Harden the tail window size so it only ever covers a bounded recent slice.

Implemented it. Tested it. Looked right.

---

## The window that jumped too far

New problem. After the first summary committed, every subsequent suggestion batch only had about 30 seconds of transcript in its tail. Not the last 3 minutes — literally the last 30 seconds.

What was happening: the window wasn't advancing to the summary boundary once. It was recalculating its start position relative to the current moment on every single suggestion call. So batch 5 got delta from the checkpoint to now (30 seconds). Batch 6 recalculated again from the same checkpoint, got a slightly bigger window, but it wasn't accumulating correctly. Under certain timing conditions the window would shrink, jump, or start from the wrong place entirely.

The state tracking was inconsistent. The window position was derived on the fly from values that could drift between calls instead of being committed once at the checkpoint boundary and held there.

Suggestions became nearly useless again, but for a completely different reason. Too little context now instead of too much. 30 seconds of speech is not enough to generate anything meaningful. The model would produce generic filler because there genuinely was nothing specific to work with.

---

## Rewiring, going back, finding the sweet spot

This took a while. Tried a few different approaches — calculating deltas differently, tracking window positions as absolute line counts, trying to make the summary trigger smarter. Some worked better, some introduced new edge cases. At some point went back close to the original structure and rethought it from scratch.

The core insight that eventually clicked: stop trying to derive the window position at call time. Commit it. When a summary checkpoint is confirmed (not when it's requested — when it comes back successfully), record exactly how many transcript lines that summary covered. That number doesn't change. Every suggestion call after that just asks: give me transcript starting from line `N` to now, where `N` is the committed checkpoint boundary.

Here's the full flow that ended up working:

**Suggestions fire on a timer** — roughly every 30 seconds if there's enough new content. Each call builds context from two sources: the committed rolling summary (everything before the last checkpoint) and the delta tail (only transcript lines since the checkpoint boundary). These two halves are always disjoint by definition because the boundary is a fixed line number, not a sliding calculation.

**Checkpoint triggers at every 4 batches.** At batch 4, fire a summarize call. The call receives the current summary plus the delta since the last checkpoint. While the summarize call is in flight, suggestions keep running in fail-open mode — they just accumulate a slightly larger delta until the summary comes back. This matters because summarize calls can fail or be slow, and stopping suggestions to wait would be a bad user experience.

**When the summary commits**, record `committedCheckpointLineCount` — the exact line in the transcript where this summary ends. On the very next suggestion call, the delta window starts from that line. The old delta disappears. The prompt is now: `summary₂ + 30 seconds of new speech`. Back to a tight, bounded context.

**The second summary** follows the same pattern: `summarize(summary₁ + delta since checkpoint 1)` → produces `summary₂` → commits a new boundary → delta resets again. Each summary stands on the shoulders of the last one without re-reading what came before.

The prompt size stabilizes by batch 5 — roughly 4–7KB — and stays there whether the meeting is 15 minutes or 2 hours. And because the boundary is committed rather than calculated, the window no longer drifts, jumps, or shrinks between calls.

It also meant the quality cap stopped being a constraint. The summary only needs to cover what happened before the checkpoint — 800 characters for 4–8 batches of speech is genuinely enough. Bumped `max_tokens` back up to 220 and the summaries became substantive again.

The thing that made this feel right: it doesn't make overlap unlikely. It makes overlap structurally impossible. The summary covers lines 0 to N. The delta covers lines N to now. There is no scenario where they intersect.

---

## Meeting kind changes tone completely

Once the context window was stable, a different problem showed up. A standup and a sales call feel completely different even at the same length, but the prompt didn't know that. A standup needs suggestions about blockers and owners and next actions. A sales call needs buyer intent, objections, stakeholder mapping. A generic prompt tries to do both and ends up doing neither well — it produces the vague middle ground that sounds like it fits every situation but actually fits none.

Added a classifier that fires at batch 3. One fast call with temperature 0.1, classifies as standup / sales / interview / general. From that point forward, both the suggest and chat prompts receive a kind-specific role hint and an example block. The model shifts tone immediately. Small change, large behavioral delta.

---

## Intent decomposition

The last quality problem was subtler. The four card types — `QUESTION_TO_ASK`, `TALKING_POINT`, `ANSWER`, `FACT_CHECK` — were just labels. The model would produce technically schema-compliant cards that were completely hollow.

`QUESTION_TO_ASK: "Can you elaborate on that?"`  
`FACT_CHECK: "Verify the claims made in this meeting."`

Correct type. Zero value.

The fix was to give the model a calibrated description of what *good* looks like for each type — not a label, an intent. `QUESTION_TO_ASK` should produce a pointed question that moves a specific decision forward, not an open-ended probe. `FACT_CHECK` should name the exact claim and what you'd need to verify it. These descriptions live in Settings so users can tune them, but the defaults were specifically engineered to kill the vague output, because that was the failure mode every time.

---

## Engineering decisions

**Why checkpoints every 4 batches?**  
Too frequent and the summary never accumulates enough content to be meaningful — you'd be summarizing 30 seconds of speech. Every 4 batches is roughly 2 minutes, enough for the model to identify actual themes and decisions rather than just paraphrasing recent sentences.

**Why 800 chars for the summary cap?**  
Empirically: 800 chars fits 5–6 substantive bullets about a real meeting. Below ~600 the model starts losing distinct points. Above ~1000 you get verbatim echo even with guardrails. 800 is the sweet spot for meetings up to 45 minutes.

**Why keep the drift rejection even after checkpoints?**  
The checkpointed architecture prevents structural overlap, but the model can still produce a drift-heavy summary given bad input. The rejection gate is cheap insurance — fires rarely on well-behaved runs, but catches the edge case where the summarize call returns something malformed. Defense in depth has low cost and nonzero value.

**Why move prompt assembly server-side?**  
Before this, the client built the entire system prompt and shipped it as an opaque string. The server had no visibility into what was actually going to Groq. Per-field metric logs (`transcriptChars`, `summaryChars`, `promptBytes`) became possible only after moving assembly to the server. The drift problem had been running in production silently — structured logs would have caught it in the first 10 requests.

**Why in-memory rate limits instead of something distributed?**  
This runs on Vercel serverless. Distributed rate limiting adds a Redis/Upstash dependency, cost, and a network hop on every request, for a single-user tool where the user provides their own API key. In-memory per-Lambda buckets are sufficient deterrents against accidental hammering. Known tradeoff, explicitly taken.

**Why sessionStorage for everything except settings?**  
Eliminates the entire persistence surface. No database, no auth, no cross-session state to reason about. The Groq key lives in sessionStorage — survives a page reload within the same tab, disappears on close. Transcripts and chat history are session-only by design: you don't want a previous meeting's context bleeding into a new one.
