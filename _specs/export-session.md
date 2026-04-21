# Spec for Export & Session Polish

branch: claude/feature/export-session

## Summary

Adds the Export button that serialises the full in-memory session (timestamped transcript + all suggestion batches with timestamps + full chat history) from Zustand into a downloadable JSON file. Then closes out all remaining visual and UX requirements: visual batch fading, empty and loading states for all three columns, auto-scroll edge case handling, and any remaining gap between the reference mockup and the built UI. No new AI features.

## Functional Requirements

### Export Button
- Positioned in column 1, below the transcript panel (or in a fixed toolbar above it)
- Label: `Export Session`
- On click: reads the current state of `transcriptSlice`, `suggestionsSlice`, and `chatSlice` from Zustand and triggers a browser file download
- The exported file is named `twinmind-session-<ISO-timestamp>.json`
- File structure:
```json
{
  "exportedAt": "2024-01-15T16:52:13Z",
  "transcript": [
    { "timestamp": "04:52:07 PM", "text": "So we're talking about how to scale..." }
  ],
  "suggestionBatches": [
    {
      "batchNumber": 1,
      "timestamp": "04:52:13 PM",
      "cards": [
        { "type": "QUESTION_TO_ASK", "preview": "What's your current p99 latency..." },
        { "type": "TALKING_POINT", "preview": "Discord's sharding model..." },
        { "type": "FACT_CHECK", "preview": "Fact-check: Slack's 2024 outage..." }
      ]
    }
  ],
  "chat": [
    { "role": "user", "suggestionType": "FACT_CHECK", "text": "Fact-check: Slack's 2024 outage..." },
    { "role": "assistant", "text": "Detailed answer..." }
  ]
}
```
- Export is disabled (greyed out) if all three slices are empty (nothing to export)
- Export works at any point in the session — does not require stopping the mic first

### Visual Batch Fading
- Newest batch: `opacity-100`
- Second-most-recent batch: `opacity-60`
- All batches older than the second: `opacity-35`
- Fading is applied via a Tailwind class computed from the batch's index in the `suggestionsSlice` array
- The fade does not affect the clickability of older cards

### Empty & Loading States

| Column | Empty state | Loading state |
|--------|-------------|---------------|
| 1 — Transcript | `Start recording to see your transcript here.` centred in the panel | Spinner visible next to the last transcript line while `/api/transcribe` is in-flight |
| 2 — Suggestions | `Start recording to generate suggestions.` centred in the panel | Three skeleton card placeholders (grey pulsing rectangles) while `/api/suggest` is in-flight |
| 3 — Chat | Initial placeholder text per the chat spec | Pulsing amber dot (already covered in chat spec, confirm it is present) |

### Auto-Scroll Finalisation
- Transcript column: tracks whether the user has scrolled up; a `isUserScrolledUp` flag (local `useRef`, not Zustand) suppresses auto-scroll when true; scrolling back to within 50px of the bottom resets the flag
- Chat column: same `isUserScrolledUp` pattern; already partially covered in the chat spec — confirm it is wired identically here
- Suggestions column: does **not** auto-scroll — new batches prepend at the top and push existing content down naturally; no scroll management needed

### Mockup Fidelity Pass
- Verify and match the following details from the reference mockup that may have been approximated during earlier specs:
  - Column divider lines (subtle border between columns)
  - Font sizing and weight on all badge labels (`text-xs font-semibold uppercase tracking-widest`)
  - Batch footer text style: small, centred, muted (`text-xs text-zinc-500`)
  - Suggestion card border radius and padding consistent with mockup
  - `↺` reload icon is a Unicode symbol or `lucide-react` `RefreshCw` icon
  - Mic button: large filled circle, centred in its section, with mic icon inside
  - All interactive elements have visible `:hover` and `:focus-visible` states

## Possible Edge Cases

- Export triggered while `/api/transcribe` is in-flight (mid-chunk) — export whatever is currently committed to `transcriptSlice`; do not wait for the pending chunk
- Export triggered when only the transcript has content but suggestions and chat are empty — still export; those arrays will simply be empty in the JSON
- `JSON.stringify` on very long sessions — no truncation; export the full session regardless of size
- Browser download blocked by a pop-up blocker — this is a programmatic anchor-click download and should not be blocked; no special handling needed
- User exports then continues recording — subsequent exports reflect the new accumulated state (stateless operation, always reads from Zustand at click time)

## Acceptance Criteria

- [ ] Export button produces a valid `.json` file download with the correct structure
- [ ] Exported JSON contains all transcript lines, all suggestion batches, and full chat history present at the time of export
- [ ] Export button is disabled when all slices are empty
- [ ] Second-oldest batch visually fades to ~60% opacity; batches beyond that fade to ~35%
- [ ] All three columns show correct empty states before any session data exists
- [ ] Transcript column shows a spinner while transcription is in-flight
- [ ] Suggestions column shows skeleton cards while a suggestions request is in-flight
- [ ] Auto-scroll in both transcript and chat columns pauses on manual scroll-up and resumes at bottom
- [ ] No TypeScript errors (`tsc --noEmit` passes on the full project)
- [ ] Visual mockup fidelity: badge fonts, card borders, column dividers, batch footer style all match the reference screenshot

## Open Questions

- None.

## Testing Guidelines

Create `tests/export-session.test.ts`. Cover:
- Export shape: given a mock Zustand store with 2 transcript lines, 1 suggestion batch (3 cards), and 2 chat messages, the exported JSON matches the specified schema exactly
- Export disabled: `exportSession()` returns early (or throws) when all three slices are empty arrays
- Batch fading: the opacity class applied to batch index 0 is `opacity-100`, index 1 is `opacity-60`, and index 2+ is `opacity-35`
- Auto-scroll flag: appending a transcript line when `isUserScrolledUp` is true does not trigger a scroll; setting the flag to false and appending does trigger a scroll
