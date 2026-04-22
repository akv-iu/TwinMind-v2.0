# Export & Session Polish - Implementation Plan

Spec: `_specs/export-session.md`
Branch: `claude/feature/export-session`

---

## Context

Final feature step. No new model integrations. This step adds export, final visual fidelity checks, empty/loading states, and scroll behavior confirmation.

Key alignment points:
- Export includes transcript + suggestion batches + full chat
- Older suggestion batches remain visible while loading new ones
- Streaming indicator is anchored in chat panel bottom-right
- Mockup details are exact (headers, badges, spacing, opacity tiers)

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `twinmind-app/lib/export.ts` | Create |
| `twinmind-app/components/transcript/TranscriptColumn.tsx` | Add Export button + disabled behavior |
| `twinmind-app/components/suggestions/SuggestionBatch.tsx` | Apply index-based opacity tiers |
| `twinmind-app/components/suggestions/SuggestionsColumn.tsx` | Add non-destructive loading overlay |
| `twinmind-app/components/chat/ChatColumn.tsx` | Confirm indicator position + scroll behavior |
| `twinmind-app/tests/export-session.test.ts` | Create |

---

## 1 - Export Utility

### Function
```typescript
export function exportSession(
  transcriptLines: TranscriptLine[],
  suggestionBatches: SuggestionBatch[],
  chatMessages: ChatMessage[]
): void
```

### Behavior
- Early return when all three arrays are empty
- Build JSON:
  - `exportedAt`
  - `transcript`: `{ timestamp, text }[]`
  - `suggestionBatches`: `{ batchNumber, timestamp, cards[] }[]`
  - `chat`: full message history with conditional `suggestionType`
- Trigger download as `twinmind-session-<ISO-timestamp>.json`

---

## 2 - Export Button in Transcript Column

### Placement
- Near transcript controls in column 1, always visible

### Disabled state
```typescript
const isExportDisabled =
  transcriptLines.length === 0 &&
  suggestionBatches.length === 0 &&
  chatMessages.length === 0
```

### Action
```typescript
exportSession(transcriptLines, suggestionBatches, chatMessages)
```

---

## 3 - Suggestion Batch Fading

```typescript
export function getBatchOpacity(index: number): string {
  if (index === 0) return 'opacity-100'
  if (index === 1) return 'opacity-60'
  return 'opacity-35'
}
```

- Newest batch: `opacity-100`
- Second newest: `opacity-60`
- Older: `opacity-35`
- Keep pointer events enabled (older batches still clickable)

---

## 4 - Loading State Without Hiding History

Requirement alignment: older batches must remain visible while new fetch is in-flight.

Use overlay skeletons (not list replacement):
```tsx
<div className="relative flex-1 overflow-y-auto">
  {batches.length === 0 ? <EmptyState /> : <BatchList />}

  {isLoading && (
    <div className="pointer-events-none absolute inset-0 p-4">
      {[0, 1, 2].map(i => (
        <div key={i} className="animate-pulse rounded-lg bg-zinc-800/70 h-24 w-full" />
      ))}
    </div>
  )}
</div>
```

---

## 5 - Auto-Scroll Finalization

### Transcript
- `useAutoScroll` with `isUserScrolledUp` ref
- 50px threshold
- Auto-scroll only when user is near bottom

### Chat
- Same pattern
- Auto-scroll on user message append and token deltas

### Suggestions
- No auto-scroll behavior needed

---

## 6 - Mockup Fidelity Pass

Verify all of the following:
- `1. MIC & TRANSCRIPT`
- `2. LIVE SUGGESTIONS`
- `3. CHAT (DETAILED ANSWERS)`
- Header badge style: `text-xs font-semibold uppercase tracking-widest`
- Column dividers and spacing
- Batch footer style and format
- Suggestion card radii/padding
- Interaction focus styles
- Chat streaming indicator visibly anchored to panel bottom-right

---

## 7 - Tests

### `tests/export-session.test.ts`
- Export JSON shape matches schema
- Export returns early when all slices are empty
- `getBatchOpacity` returns expected class by index
- `useAutoScroll` suppresses and resumes correctly
- Loading overlay coexists with existing suggestion batches

---

## Edge Cases Addressed

| Case | Handling |
|------|----------|
| Export during in-flight transcription | Export current committed state |
| Only transcript exists | Export still works with empty suggestion/chat arrays |
| Large sessions | Full JSON export, no truncation |
| Export then continue session | Stateless; each export reflects current store state |
| Loading suggestions with history | Overlay preserves visible history |

---

## Verification

After implementation:
1. Empty states render correctly in all columns
2. Export button disabled when session is empty, enabled when any data exists
3. Export file contains transcript, batches, and chat entries
4. Suggestions loading uses overlay and keeps older batches visible
5. Three opacity tiers are visible after multiple batches
6. Chat indicator appears in bottom-right while streaming
7. `npx tsc --noEmit` passes
8. `npm run build` passes
9. `npx vitest run tests/export-session.test.ts` passes
