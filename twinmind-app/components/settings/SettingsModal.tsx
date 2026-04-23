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
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 bg-black/60"
      />
      <aside className="flex h-full w-96 max-w-full flex-col border-l border-zinc-800 bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            <span>Settings</span>
            {hasChanges ? (
              <span
                aria-label="Unsaved changes"
                title="Unsaved changes"
                className="text-zinc-500"
              >
                •
              </span>
            ) : null}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <Field label="Groq API key">
            <input
              type="password"
              autoComplete="off"
              value={draft.groqApiKey}
              onChange={(e) => setDraft({ ...draft, groqApiKey: e.target.value })}
              placeholder="gsk_..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Stored only in this browser session. Required for transcription, suggestions, and chat.
            </p>
          </Field>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Suggestion Intent Prompts (4 Sections)
            </p>
            <div className="overflow-x-auto pb-1">
              <div className="grid grid-flow-col auto-cols-[17rem] gap-3">
                {SUGGEST_INTENT_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label}>
                    <textarea
                      rows={7}
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
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
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
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
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
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
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
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </Field>
          </div>

          <button
            onClick={handleResetPrompts}
            className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            Reset prompts to defaults
          </button>
          <p className="text-xs text-zinc-500">
            Unsaved changes are discarded on Cancel, X, or click outside. Press Save to apply.
          </p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-800 p-4">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  )
}
