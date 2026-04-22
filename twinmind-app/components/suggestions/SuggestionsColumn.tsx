'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ColumnHeader } from '@/components/layout/ColumnHeader'
import { SuggestionBatch } from './SuggestionBatch'
import { useStore } from '@/store'
import type { SuggestionCard } from '@/lib/types'
import { buildSuggestPrompt } from '@/store/settingsSlice'

const COUNTDOWN_SECONDS = 30

function timestampNow(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export interface SuggestionsColumnProps {
  onCardClick?: (card: SuggestionCard) => void
  cardsDisabled?: boolean
}

export function SuggestionsColumn({ onCardClick, cardsDisabled }: SuggestionsColumnProps) {
  const batches = useStore((s) => s.batches)
  const transcriptLines = useStore((s) => s.transcriptLines)
  const isRecording = useStore((s) => s.isRecording)
  const apiKey = useStore((s) => s.groqApiKey)
  const suggestIntentPrompts = useStore((s) => s.suggestIntentPrompts)
  const suggestContextChars = useStore((s) => s.suggestContextChars)
  const addBatch = useStore((s) => s.addBatch)

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLoadingRef = useRef(false)

  const fireSuggestions = useCallback(async () => {
    if (isLoadingRef.current) return
    if (!apiKey.trim()) return
    const allText = transcriptLines.map((l) => l.text).join(' ')
    const context = allText.slice(-suggestContextChars)
    if (!context.trim()) return

    isLoadingRef.current = true
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: context,
          prompt: buildSuggestPrompt(suggestIntentPrompts),
          apiKey,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(data.error ?? 'Unknown error')
      }
      const { cards } = (await res.json()) as { cards: SuggestionCard[] }
      addBatch({ timestamp: timestampNow(), cards })
    } catch {
      setError('Failed to load suggestions. Retrying in 30s.')
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [apiKey, suggestIntentPrompts, suggestContextChars, transcriptLines, addBatch])

  useEffect(() => {
    if (!isRecording) return
    const id = setInterval(() => {
      if (isLoadingRef.current) return
      setCountdown((prev) => {
        if (prev <= 1) {
          void fireSuggestions()
          return COUNTDOWN_SECONDS
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [fireSuggestions, isRecording])

  function handleReload() {
    if (isLoading || !apiKey.trim()) return
    setCountdown(COUNTDOWN_SECONDS)
    void fireSuggestions()
  }

  const batchCount = batches.length
  const badgeLabel = batchCount === 1 ? '1 BATCH' : `${batchCount} BATCHES`
  const noKey = !apiKey.trim()

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <ColumnHeader
        number={2}
        title="LIVE SUGGESTIONS"
        badge={
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {badgeLabel}
          </span>
        }
      />

      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <button
          type="button"
          onClick={handleReload}
          disabled={isLoading || noKey}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : undefined} />
          Reload suggestions
        </button>
        <span className="text-xs text-zinc-500">
          {isRecording ? `auto-refresh in ${countdown}s` : 'auto-refresh paused (mic off)'}
        </span>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        {noKey ? (
          <p className="mt-4 px-4 text-center text-xs text-zinc-500">
            Add your Groq API key in Settings to start.
          </p>
        ) : error ? (
          <p className="mt-4 px-4 text-center text-xs text-red-400">{error}</p>
        ) : null}

        {batches.length === 0 && !isLoading && !noKey ? (
          <p className="mt-8 px-4 text-center text-sm text-zinc-500">
            Start recording to generate suggestions.
          </p>
        ) : (
          batches.map((batch, index) => (
            <SuggestionBatch
              key={batch.batchNumber}
              batch={batch}
              index={index}
              onCardClick={onCardClick}
              cardsDisabled={cardsDisabled}
            />
          ))
        )}

        {isLoading && (
          <div className="pointer-events-none absolute inset-x-0 top-0 space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 w-full animate-pulse rounded-lg bg-zinc-800/70"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
