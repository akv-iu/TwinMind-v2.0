'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ColumnHeader } from '@/components/layout/ColumnHeader'
import { SuggestionBatch } from './SuggestionBatch'
import { formatCardType } from './SuggestionCard'
import { useStore } from '@/store'
import type { SuggestionCard, TranscriptLine } from '@/lib/types'
import { takeTailByChars } from '@/lib/context'
import { refreshSummary, shouldRefreshSummary } from '@/lib/summary'
import { buildSuggestPrompt } from '@/store/settingsSlice'

const COUNTDOWN_SECONDS = 30

function timestampNow(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function countTranscriptChars(lines: TranscriptLine[]): number {
  return lines.reduce((total, line) => total + line.timestamp.length + 2 + line.text.length + 1, 0)
}

interface SuggestResponse {
  cards: SuggestionCard[]
  degraded?: boolean
}

export interface SuggestionsColumnProps {
  onCardClick?: (card: SuggestionCard) => void
  cardsDisabled?: boolean
}

export function SuggestionsColumn({ onCardClick, cardsDisabled }: SuggestionsColumnProps) {
  const batches = useStore((s) => s.batches)
  const getRecentBatches = useStore((s) => s.getRecentBatches)
  const summary = useStore((s) => s.summary)
  const setSummary = useStore((s) => s.setSummary)
  const transcriptLines = useStore((s) => s.transcriptLines)
  const isRecording = useStore((s) => s.isRecording)
  const apiKey = useStore((s) => s.groqApiKey)
  const suggestIntentPrompts = useStore((s) => s.suggestIntentPrompts)
  const suggestContextChars = useStore((s) => s.suggestContextChars)
  const addBatch = useStore((s) => s.addBatch)

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waitingForSubstance, setWaitingForSubstance] = useState(false)

  const isLoadingRef = useRef(false)
  const isSummaryRefreshingRef = useRef(false)
  const lastSummaryTranscriptCharsRef = useRef(0)
  const lastSummaryBatchCountRef = useRef(0)

  useEffect(() => {
    if (batches.length !== 0 || summary.trim()) return
    lastSummaryTranscriptCharsRef.current = 0
    lastSummaryBatchCountRef.current = 0
  }, [batches.length, summary])

  const fireSuggestions = useCallback(async () => {
    if (isLoadingRef.current) return
    const key = apiKey.trim()
    if (!key) return

    const recentTranscript = takeTailByChars(transcriptLines, suggestContextChars)
    if (!recentTranscript.trim()) return

    const priorBatches = getRecentBatches(2)
      .flatMap((batch) => batch.cards.map((card) => `${formatCardType(card.type)}: ${card.preview}`))
      .join('\n')

    const mergedPrompt = buildSuggestPrompt(suggestIntentPrompts, {
      recentTranscript,
      rollingSummary: summary,
      priorBatches,
    })

    const payload = {
      transcript: recentTranscript,
      prompt: mergedPrompt,
      apiKey: key,
    }

    isLoadingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(data.error ?? 'Unknown error')
      }

      const data = (await res.json()) as SuggestResponse
      const cards = Array.isArray(data.cards) ? data.cards : []

      if (cards.length === 0) {
        setWaitingForSubstance(true)
        return
      }

      addBatch({ timestamp: timestampNow(), cards })
      setWaitingForSubstance(false)

      const nextBatchCount = useStore.getState().batches.length
      const transcriptChars = countTranscriptChars(transcriptLines)
      const refreshNeeded = shouldRefreshSummary({
        transcriptChars,
        batchCount: nextBatchCount,
        lastSummaryTranscriptChars: lastSummaryTranscriptCharsRef.current,
        lastSummaryBatchCount: lastSummaryBatchCountRef.current,
      })

      if (!refreshNeeded || isSummaryRefreshingRef.current) return

      lastSummaryTranscriptCharsRef.current = transcriptChars
      lastSummaryBatchCountRef.current = nextBatchCount
      isSummaryRefreshingRef.current = true

      const summaryInput = takeTailByChars(
        transcriptLines,
        Math.max(suggestContextChars * 6, 24_000),
      )
      void refreshSummary(summaryInput, key)
        .then((nextSummary) => {
          if (nextSummary) setSummary(nextSummary)
        })
        .catch(() => {
          // summary failures are non-fatal for live suggestions
        })
        .finally(() => {
          isSummaryRefreshingRef.current = false
        })
    } catch {
      setError('Failed to load suggestions. Retrying in 30s.')
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [
    addBatch,
    apiKey,
    getRecentBatches,
    setSummary,
    suggestContextChars,
    suggestIntentPrompts,
    summary,
    transcriptLines,
  ])

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

      {waitingForSubstance && !noKey && (
        <div className="border-b border-zinc-900 px-4 py-2 text-xs text-zinc-500">
          waiting for substance...
        </div>
      )}

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
