# Plan 01 — Type Compliance: Drop CLARIFYING_INFO

## Summary
Restore the spec's 4-type non-negotiable. Remove `CLARIFYING_INFO` from types, defaults, settings UI, server validation, and badge styles.

## Dependencies
**None.** This is foundational. Plans 03 (suggestion) and 04 (chat) assume the 4-type universe.

## Files touched
1. [twinmind-app/lib/types.ts](twinmind-app/lib/types.ts)
2. [twinmind-app/store/settingsSlice.ts](twinmind-app/store/settingsSlice.ts)
3. [twinmind-app/components/settings/SettingsModal.tsx](twinmind-app/components/settings/SettingsModal.tsx)
4. [twinmind-app/app/api/suggest/route.ts](twinmind-app/app/api/suggest/route.ts)
5. [twinmind-app/components/suggestions/SuggestionCard.tsx](twinmind-app/components/suggestions/SuggestionCard.tsx)
6. [twinmind-app/tests/live-suggestions-engine.test.ts](twinmind-app/tests/live-suggestions-engine.test.ts)

## Steps

### 1. `lib/types.ts`
- `CardType = 'QUESTION_TO_ASK' | 'TALKING_POINT' | 'ANSWER' | 'FACT_CHECK'` (remove the 5th).
- Drop `CLARIFYING_INFO` key from `SuggestIntentPrompts`.

### 2. `store/settingsSlice.ts`
- Remove the `CLARIFYING_INFO` key from `SUGGEST_INTENT_PROMPTS_DEFAULT`.
- Remove the matching line from the intent-guidance block in `buildSuggestPrompt`.
- Update the JSON example in the prompt to use only the 4 valid types.
- Update the bullet listing valid types: remove `CLARIFYING_INFO`.

### 3. `components/settings/SettingsModal.tsx`
- Remove the `CLARIFYING_INFO` entry from `SUGGEST_INTENT_FIELDS`.
- Remove the `CLARIFYING_INFO` branch from `normalizeDraft()`.
- Change the header label from `"Suggestion Intent Prompts (5 Sections)"` to `"Suggestion Intent Prompts (4 Sections)"`.

### 4. `app/api/suggest/route.ts`
- Remove `CLARIFYING_INFO` from `VALID_TYPES`.
- Remove `CLARIFYING_INFO` from `FALLBACK_TYPE_ORDER`.
- Remove `CLARIFYING_INFO` key from `FALLBACK_PREVIEWS`.
- (Plan 03 deletes these fallback arrays entirely — if doing 01 and 03 in the same session, skip this step and handle in 03.)

### 5. `components/suggestions/SuggestionCard.tsx`
- Remove `CLARIFYING_INFO` from `BADGE_STYLES`.

### 6. Test sweep
- Run `grep -ri "CLARIFYING_INFO" twinmind-app/` — should return zero matches.
- Update any test case that references the 5th type.

## Acceptance criteria
- [ ] `tsc --noEmit` clean.
- [ ] All tests pass.
- [ ] `grep -r CLARIFYING_INFO twinmind-app/` returns zero hits (excluding `node_modules` and `.next`).
- [ ] Settings modal renders 4 intent prompt fields plus the chat prompt and context-size inputs.
- [ ] A live suggestion cycle sends only the 4 valid types to the model.

## Time estimate
**30 minutes.**

## Risk
Low — purely removing one enum member. Main risk is a stray string literal somewhere; the `grep` sweep catches it.
