# Plan 10 - Checkpointed Summary With Fail-Open Recovery

## Summary
Implement a checkpointed context lifecycle for suggestions so prompt growth is bounded by summary checkpoints, while staying resilient to summary-request failures/network loss.

Target behavior:
- Checkpoint cadence is fixed at every 4 added suggestion batches.
- Summary reset happens only after summary ACK (never before).
- While summary is pending, suggestions continue in fail-open mode with growing delta transcript.
- Across checkpoints, keep exactly 1 prior batch for anti-repeat continuity.
- Keep existing `suggestContextChars` behavior (default 3000), summary cap 800.
- If 3 distinct cards are not possible, return fewer cards and mark `degraded: true`.

## Key Implementation Changes
1. **Client checkpoint state machine (suggestions pipeline)**
- Add runtime checkpoint refs/state in suggestions flow:
  - `committedCheckpointBatchCount`
  - `committedCheckpointLineCount`
  - `pendingCheckpoint` (request id + snapshot batch/line boundary + started timestamp)
  - retry cooldown timestamp for summarize retries
- Trigger checkpoint summarize when `batchCount - committedCheckpointBatchCount >= 4` and no pending request.
- Build suggestion transcript from `transcriptLines.slice(committedCheckpointLineCount)` and then `takeTailByChars(..., suggestContextChars)`.

2. **Two-phase checkpoint commit (no-loss invariant)**
- On checkpoint trigger, snapshot boundary (`snapshotLineCount`, `snapshotBatchCount`) and fire summarize with transcript delta from committed boundary to snapshot boundary.
- Do **not** move/reset checkpoint cursor on request start.
- On summarize success:
  - accept only latest in-flight request id
  - if non-empty summary returned, set summary and commit cursor to snapshot boundary
  - clear pending checkpoint
- On summarize failure/timeout/empty result:
  - keep old summary and old committed cursor
  - clear pending checkpoint and retry later (after cooldown), while suggestions continue fail-open.

3. **Carryover prior-batch policy**
- Replace generic "last 2 recent batches" selection with checkpoint-aware selection:
  - include batches from current checkpoint window
  - include exactly 1 carryover batch from just before checkpoint boundary
  - cap serialized prior-batch input to existing server cap behavior

4. **Distinct-card strict mode in suggest route**
- Add normalized dedupe pass on parsed cards (case/whitespace/punctuation normalized).
- If distinct cards < 3, return available distinct cards (1-2) instead of padding/forcing.
- Mark response `degraded: true` for strict shortfall cases (in addition to existing degraded causes).

5. **Observability**
- Add structured checkpoint telemetry (client/server logs) for:
  - checkpoint triggered
  - pending age
  - summarize success/failure
  - commit applied (old/new checkpoint boundaries)
  - stale/late summarize response ignored
  - strict-distinct shortfall counts

## Public Interfaces / Type Semantics
- **No request-shape changes** to `/api/suggest` or `/api/summarize`.
- `/api/suggest` response shape unchanged, but `degraded: true` semantics are expanded to also include strict-distinct shortfall outcomes.

## Test Plan
1. **Checkpoint lifecycle**
- Batch 4 triggers summarize request with snapshot boundary.
- Cursor reset occurs only after summarize success.
- Batch 5+ continues using fail-open transcript delta while pending.

2. **Failure recovery**
- Simulate summarize failure at first checkpoint: suggestions continue; summary/cursor unchanged.
- Retry succeeds later: commit applies to snapshot boundary; no transcript loss.

3. **Carryover behavior**
- After checkpoint commit, prior-batches input includes exactly one pre-checkpoint batch plus current-window batches.

4. **Strict distinct mode**
- Suggest parser/dedupe returns 2 distinct cards -> response has 2 cards and `degraded: true`.
- Distinct 3+ cards -> normal non-degraded path (unless other degraded conditions apply).

5. **Regression**
- Existing suggest/chat/summary flows remain functional.
- `suggestContextChars` setting still governs transcript tail cap.
- Reload behavior remains session-only (no new persistence).

## Assumptions / Defaults Chosen
- Fixed checkpoint frequency: every 4 added batches.
- One stale fire is naturally allowed; policy then remains always fail-open until ACK.
- Keep last 1 batch across checkpoints.
- Keep summary cap at 800 chars.
- Keep session-only behavior on reload (no persistence changes in this plan).
