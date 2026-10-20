'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/store'
import type { SuggestIntentPrompts } from '@/lib/types'
import {
  CHAT_PROMPT_DEFAULT,
  SUGGEST_INTENT_PROMPTS_DEFAULT,
} from '@/store/settingsSlice'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

const MIN_SUGGEST_CONTEXT = 500
const MAX_SUGGEST_CONTEXT = 20000
const MIN_CHAT_CONTEXT = 500
const MAX_CHAT_CONTEXT = 50000

const SUGGEST_INTENT_FIELDS: Array<{
  key: keyof SuggestIntentPrompts
  label: string
}> = [
  { key: 'QUESTION_TO_ASK', label: 'Question To Ask' },
  { key: 'TALKING_POINT', label: 'Talking Point' },
  { key: 'ANSWER', label: 'Answer' },
  { key: 'FACT_CHECK', label: 'Fact Check' },
]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function cloneSuggestIntentPrompts(
  prompts: SuggestIntentPrompts,
): SuggestIntentPrompts {
  return { ...prompts }
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const groqApiKey = useStore((s) => s.groqApiKey)
  const suggestIntentPrompts = useStore((s) => s.suggestIntentPrompts)
  const chatPrompt = useStore((s) => s.chatPrompt)
  const suggestContextChars = useStore((s) => s.suggestContextChars)
  const chatContextChars = useStore((s) => s.chatContextChars)
  const updateSettings = useStore((s) => s.updateSettings)

  const [draft, setDraft] = useState({
    groqApiKey,
    suggestIntentPrompts: cloneSuggestIntentPrompts(suggestIntentPrompts),
    chatPrompt,
    suggestContextChars,
    chatContextChars,
  })

  const hasChanges =
    draft.groqApiKey !== groqApiKey ||
    draft.chatPrompt !== chatPrompt ||
    draft.suggestContextChars !== suggestContextChars ||
    draft.chatContextChars !== chatContextChars ||
    JSON.stringify(draft.suggestIntentPrompts) !==
      JSON.stringify(suggestIntentPrompts)

  useEffect(() => {
    if (!open) return
    setDraft({
      groqApiKey,
      suggestIntentPrompts: cloneSuggestIntentPrompts(suggestIntentPrompts),
      chatPrompt,
      suggestContextChars,
      chatContextChars,
    })
  }, [
    open,
    groqApiKey,
    suggestIntentPrompts,
    chatPrompt,
    suggestContextChars,
    chatContextChars,
  ])

  if (!open) return null

  function normalizeDraft() {
    const normalizePrompt = (
      value: string,
      fallback: string,
    ): string => {
      const trimmed = value.trim()
      return trimmed || fallback
    }

    return {
      groqApiKey: draft.groqApiKey.trim(),
      suggestIntentPrompts: {
        QUESTION_TO_ASK: normalizePrompt(
          draft.suggestIntentPrompts.QUESTION_TO_ASK,
          SUGGEST_INTENT_PROMPTS_DEFAULT.QUESTION_TO_ASK,
        ),
        TALKING_POINT: normalizePrompt(
          draft.suggestIntentPrompts.TALKING_POINT,
          SUGGEST_INTENT_PROMPTS_DEFAULT.TALKING_POINT,
        ),
        ANSWER: normalizePrompt(
          draft.suggestIntentPrompts.ANSWER,
          SUGGEST_INTENT_PROMPTS_DEFAULT.ANSWER,
        ),
        FACT_CHECK: normalizePrompt(
          draft.suggestIntentPrompts.FACT_CHECK,
          SUGGEST_INTENT_PROMPTS_DEFAULT.FACT_CHECK,
        ),
      },
      chatPrompt: draft.chatPrompt.trim(),
      suggestContextChars: clamp(
        draft.suggestContextChars,
        MIN_SUGGEST_CONTEXT,
        MAX_SUGGEST_CONTEXT,
      ),
      chatContextChars: clamp(
        draft.chatContextChars,
        MIN_CHAT_CONTEXT,
        MAX_CHAT_CONTEXT,
      ),
    }
  }

  function handleSave() {
    const normalized = normalizeDraft()
    setDraft(normalized)
    updateSettings(normalized)
    onClose()
  }

  function handleResetPrompts() {
    setDraft((d) => ({
      ...d,
      suggestIntentPrompts: cloneSuggestIntentPrompts(
        SUGGEST_INTENT_PROMPTS_DEFAULT,
      ),
      chatPrompt: CHAT_PROMPT_DEFAULT,
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 bg-ink/25 backdrop-blur-[3px]"
      />
      <aside className="flex h-full w-[440px] max-w-full shrink-0 flex-col border-l border-line bg-paper shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-6 py-5">
          <h2 id="settings-title" className="inline-flex items-center gap-2 font-[Georgia,serif] text-[28px] tracking-[-0.03em] text-ink">
            <span>Settings</span>
            {hasChanges ? (
              <span
                aria-label="Unsaved changes"
                title="Unsaved changes"
                className="text-accent"
              >
                •
              </span>
            ) : null}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings panel"
            className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-wash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 text-[13px]">
          <Field label="Groq API key">
            <input
              type="password"
              autoComplete="off"
              value={draft.groqApiKey}
              onChange={(e) => setDraft({ ...draft, groqApiKey: e.target.value })}
              placeholder="gsk_..."
              className="min-h-11 w-full rounded-md border border-line bg-sheet px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Stored only in this browser session. Required for transcription, suggestions, and chat.
            </p>
          </Field>

          <div className="space-y-2">
            <p className="border-t border-line pt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              Your suggestion prompts
            </p>
            <div>
              <div className="grid gap-4">
                {SUGGEST_INTENT_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label}>
                    <textarea
                      rows={3}
                      value={draft.suggestIntentPrompts[field.key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          suggestIntentPrompts: {
                            ...draft.suggestIntentPrompts,
                            [field.key]: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-md border border-line bg-sheet px-3 py-2 leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </Field>
                ))}
              </div>
            </div>
          </div>

          <Field label="Chat prompt">
            <textarea
              rows={5}
              value={draft.chatPrompt}
              onChange={(e) => setDraft({ ...draft, chatPrompt: e.target.value })}
              className="w-full rounded-md border border-line bg-sheet px-3 py-2 leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Suggest context chars">
              <input
                type="number"
                min={MIN_SUGGEST_CONTEXT}
                max={MAX_SUGGEST_CONTEXT}
                value={draft.suggestContextChars}
                onChange={(e) =>
                  setDraft({ ...draft, suggestContextChars: Number(e.target.value) })
                }
                className="min-h-10 w-full rounded-md border border-line bg-sheet px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </Field>
            <Field label="Chat context chars">
              <input
                type="number"
                min={MIN_CHAT_CONTEXT}
                max={MAX_CHAT_CONTEXT}
                value={draft.chatContextChars}
                onChange={(e) =>
                  setDraft({ ...draft, chatContextChars: Number(e.target.value) })
                }
                className="min-h-10 w-full rounded-md border border-line bg-sheet px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </Field>
          </div>

          <button
            onClick={handleResetPrompts}
            className="min-h-9 rounded-sm text-xs font-medium text-accent-strong underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            Reset prompts to defaults
          </button>
          <p className="text-[11px] leading-relaxed text-muted">
            Unsaved changes are discarded on Cancel, X, or click outside. Press Save to apply.
          </p>
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-line bg-sheet p-5">
          <button
            onClick={onClose}
            className="min-h-10 rounded-md border border-line px-4 py-2 text-xs font-medium text-muted hover:bg-wash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="min-h-10 rounded-md bg-accent px-5 py-2 text-xs font-medium text-white hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Save
          </button>
        </footer>
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
