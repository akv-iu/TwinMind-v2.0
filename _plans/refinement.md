## Context-Aware Suggestions + Mic-Synced Timer + 5-Section Prompt Settings

### Summary
- Sync suggestion auto-refresh strictly to mic recording state: countdown pauses immediately when mic stops and resumes from remaining seconds when mic restarts.
- Shift suggestion generation from "fixed forced type mix" to "model decides best 3 based on context," while still using 5 intent categories as guidance.
- Replace single suggestion prompt editing with 5 editable prompt sections in Settings (Question, Talking Point, Answer, Fact Check, Clarifying Info), each prefilled with defaults.

### Implementation Changes
- Recording state plumbing:
  - Add `isRecording` to shared store and update it from the recorder hook.
  - Read that shared `isRecording` in suggestions UI so the interval logic is gated by mic state.
  - Countdown behavior:
    - When `isRecording=false`: freeze countdown (no decrements, no auto-fire).
    - When `isRecording=true`: continue ticking from last value.
    - Manual reload remains available, but auto-refresh remains mic-gated.
- Suggestion engine behavior:
  - Keep exactly 3 cards returned to UI.
  - Accept 5 valid intent labels: `QUESTION_TO_ASK`, `TALKING_POINT`, `ANSWER`, `FACT_CHECK`, `CLARIFYING_INFO`.
  - Preserve model order and take first 3 valid cards.
  - If fewer than 3 valid cards parse, fill remaining slots with neutral fallback cards without forcing diversity rules.
- Prompt composition model:
  - Store 5 separate prompt sections in settings state.
  - Build one runtime system prompt from those 5 sections + global formatting/grounding instructions.
  - Include explicit instruction that model should choose whichever intents are most useful now (any mix), return exactly 3 items, and prioritize recency/context relevance.

### Public Interfaces / Types
- `CardType` expands to include `CLARIFYING_INFO`.
- Settings state changes from single `suggestPrompt` to structured `suggestIntentPrompts` (5 keys).
- `/api/suggest` request body remains compatible (`transcript`, `apiKey`, `prompt`), but `prompt` content is now composed from section prompts.
- UI label formatting and badge styling adds `CLARIFYING_INFO`.

### Settings Panel (5 Sections)
- Replace the single Suggest Prompt textarea with 5 section editors:
  - Question to Ask prompt
  - Talking Point prompt
  - Answer prompt
  - Fact Check prompt
  - Clarifying Info prompt
- Prefill each with practical defaults.
- Layout as 5 clear columns/sections in the panel (responsive: horizontal scroll on narrow widths; full 5-section row/grid on wide widths).
- Reset action restores all 5 section defaults (plus existing chat prompt reset behavior).

### Test Plan
- Unit tests for suggestion normalization:
  - Accepts 5th type.
  - Preserves model order.
  - Allows repeated types.
  - Still guarantees exactly 3 cards via fallback fill.
- Store tests:
  - New settings shape defaults and reset behavior for 5 section prompts.
  - `isRecording` state updates correctly.
- UI behavior tests (or focused logic tests with fake timers):
  - Countdown decrements only while `isRecording=true`.
  - Countdown pauses when recording stops and resumes correctly.
  - Auto-fire does not run while mic is off.
- Existing export/chat tests updated for expanded `CardType` union compatibility.

### Assumptions
- "Model decides important 3" means no hard-coded diversity constraints; model can return any mix of intent types.
- "5 columns" means 5 editable suggestion-intent prompt sections in Settings (with defaults), not 5 separate suggestion pipelines.
- No persistence migration is required because settings are session-local.
