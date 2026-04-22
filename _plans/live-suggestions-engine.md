# Live Suggestions Engine - Implementation Plan

Spec: `_specs/live-suggestions-engine.md`
Branch: `claude/feature/live-suggestions-engine`

---

## Context

Column 2 of the TwinMind app. This step implements the 30-second suggestions loop: auto-refresh timer, manual reload, `/api/suggest` integration with Groq `gpt-OSS-120B`, strict normalization to exactly 3 cards, batch prepend behavior, typed card rendering, and visual fading for older batches.

This plan is aligned to non-negotiables:
- Header title must be `2. LIVE SUGGESTIONS`
- Exactly 3 cards per batch
- Older batches stay visible while new requests are loading
- App remains non-functional until a Groq API key is provided

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `twinmind-app/app/api/suggest/route.ts` | Replace validation stub with real implementation |
| `twinmind-app/store/suggestionsSlice.ts` | Create / finalize prepend behavior |
| `twinmind-app/components/suggestions/SuggestionCard.tsx` | Create |
| `twinmind-app/components/suggestions/SuggestionBatch.tsx` | Create |
| `twinmind-app/components/suggestions/SuggestionsColumn.tsx` | Create |
| `twinmind-app/tests/live-suggestions-engine.test.ts` | Create |

---

## 1 - suggestionsSlice

### Types
```typescript
export type CardType = 'QUESTION_TO_ASK' | 'TALKING_POINT' | 'ANSWER' | 'FACT_CHECK'

export interface SuggestionCard {
  type: CardType
  preview: string
}

export interface SuggestionBatch {
  batchNumber: number
  timestamp: string
  cards: SuggestionCard[]
}
```

### Action
```typescript
addBatch: (payload: { timestamp: string; cards: SuggestionCard[] }) => void
```

Behavior:
- Prepend newest batch
- Derive `batchNumber` as `state.batches.length + 1`

---

## 2 - `/api/suggest` Route

### Validation
```typescript
if (!apiKey) return 400
if (!transcript) return 400
```

### Groq call
```typescript
const completion = await groq.chat.completions.create({
  model: 'gpt-OSS-120B',
  messages: [
    { role: 'system', content: prompt },
    { role: 'user', content: `Transcript:\n${transcript}` },
  ],
})
```

### Normalization
- Parse JSON
- Trim to first 3 cards when model returns more
- Pad with fallback cards when model returns fewer
- Return `502` on malformed JSON from model

Fallback card:
```typescript
{ type: 'QUESTION_TO_ASK', preview: 'Could not generate suggestion.' }
```

---

## 3 - SuggestionCard

### Badge colors
```typescript
const BADGE_STYLES: Record<CardType, string> = {
  QUESTION_TO_ASK: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  TALKING_POINT:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
  ANSWER:          'bg-green-500/20 text-green-300 border-green-500/30',
  FACT_CHECK:      'bg-orange-500/20 text-orange-300 border-orange-500/30',
}
```

### Format
- `FACT_CHECK` displays as `FACT-CHECK`
- Other types replace `_` with space

---

## 4 - SuggestionBatch

### Opacity logic
```typescript
export function getBatchOpacity(index: number): string {
  if (index === 0) return 'opacity-100'
  if (index === 1) return 'opacity-60'
  return 'opacity-35'
}
```

Apply opacity to wrapper with `transition-opacity`.

Footer format:
- `- BATCH N · HH:MM:SS AM/PM -`

---

## 5 - SuggestionsColumn

### State
```typescript
const batches             = useStore(s => s.batches)
const transcriptLines     = useStore(s => s.transcriptLines)
const groqApiKey          = useStore(s => s.groqApiKey)
const suggestContextChars = useStore(s => s.suggestContextChars)
const suggestPrompt       = useStore(s => s.suggestPrompt)

const [countdown, setCountdown] = useState(30)
const [isLoading, setIsLoading] = useState(false)
const [error, setError]         = useState<string | null>(null)
const timerRef = useRef<NodeJS.Timeout | null>(null)
```

### Request function
```typescript
async function fireSuggestions() {
  if (!groqApiKey.trim()) {
    setError('Add your Groq API key in Settings to start.')
    return
  }
  if (!context.trim()) return

  setIsLoading(true)
  setError(null)
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: context, prompt: suggestPrompt, apiKey: groqApiKey }),
    })
    if (!res.ok) throw new Error('request failed')

    const { cards } = await res.json()
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    dispatch.addBatch({ timestamp, cards })
  } catch {
    setError('Failed to load suggestions. Retrying in 30s.')
  } finally {
    setIsLoading(false)
  }
}
```

### Timer
- `setInterval` every second
- Pause decrement while `isLoading`
- At `0`, call `fireSuggestions()` then reset to `30`

### Reload
```typescript
function handleReload() {
  if (!groqApiKey.trim() || isLoading) return
  setCountdown(30)
  fireSuggestions()
}
```

### Structure
```tsx
<div className="flex flex-col h-full bg-zinc-950">
  <ColumnHeader number={2} title="LIVE SUGGESTIONS" badge={<BatchBadge label={badgeLabel} />} />

  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
    <button onClick={handleReload} disabled={isLoading || !groqApiKey.trim()}>
      <RefreshCw size={12} />
      Reload suggestions
    </button>
    <span>auto-refresh in {countdown}s</span>
  </div>

  <div className="relative flex-1 overflow-y-auto">
    {error && <p>{error}</p>}

    {batches.length === 0 ? (
      <p>Start recording to generate suggestions.</p>
    ) : (
      batches.map((batch, index) => (
        <SuggestionBatch key={batch.batchNumber} batch={batch} index={index} onCardClick={onCardClick} />
      ))
    )}

    {isLoading && (
      <div className="pointer-events-none absolute inset-0 p-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="animate-pulse rounded-lg bg-zinc-800/70 h-24 w-full" />
        ))}
      </div>
    )}
  </div>
</div>
```

Note: loading skeletons are an overlay so older batches remain visible.

---

## 6 - Tests

### `tests/live-suggestions-engine.test.ts`
- Card padding: 2 -> 3
- Card trimming: 5 -> 3
- JSON parse failure -> `502` structured error
- `addBatch` prepends newest to index 0
- Manual reload resets countdown to 30
- Missing key guard blocks request and disables reload
- Header title is `LIVE SUGGESTIONS`

---

## Edge Cases Addressed

| Case | Handling |
|------|----------|
| Empty transcript | Skip request, keep timer running |
| API key missing | Show key-required hint, block request |
| Malformed model JSON | Return 502 and show inline error |
| Fewer than 3 cards | Pad with fallback |
| More than 3 cards | Trim to 3 |
| Reload while in-flight | Disabled button |
| Existing batches during load | Keep visible; render overlay skeletons |

---

## Verification

After implementation:
1. `npm run dev` shows column 2 with `0 BATCHES` and placeholder
2. Header renders exactly `2. LIVE SUGGESTIONS`
3. Speaking creates transcript context; auto-refresh runs every 30s
4. Loading overlay appears without hiding previous batches
5. Each refresh yields exactly 3 cards
6. Badge increments: `1 BATCH`, `2 BATCHES`, ...
7. Missing key disables reload and shows key-required hint
8. `npx tsc --noEmit` passes
9. `npx vitest run tests/live-suggestions-engine.test.ts` passes
