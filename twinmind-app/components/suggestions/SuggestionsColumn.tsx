'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ColumnHeader } from '@/components/layout/ColumnHeader'
import { SuggestionBatch } from './SuggestionBatch'
import { formatCardType } from './SuggestionCard'
import { useStore } from '@/store'
import type { SuggestionCard, TranscriptLine } from '@/lib/types'
import {
  refreshSummary,
} from '@/lib/summary'
import {
  CHECKPOINT_SUMMARY_RETRY_COOLDOWN_MS,
  getCheckpointSummaryWindow,
  getSuggestTranscriptTailFromCheckpoint,
  shouldStartCheckpointSummary,
} from '@/lib/suggestCheckpoint'
import { takeTailByChars } from '@/lib/context'
import {
  classifyMeeting,
  shouldClassify,
} from '@/lib/meetingKind'
import {
  INVALID_GROQ_KEY_COPY,
  RATE_LIMITED_COPY,
  SUGGEST_FAILURE_COPY,
  normalizeApiErrorCopy,
} from '@/lib/clientErrorCopy'

const COUNTDOWN_SECONDS = 30
const CHECKPOINT_PENDING_LOG_BUCKET_MS = 30_000

interface PendingCheckpoint {
  requestId: number
  snapshotBatchCount: number
  snapshotLineCount: number
  startedAtMs: number
}

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

function formatTranscriptForSummary(lines: TranscriptLine[]): string {
  return lines.map((line) => `${line.timestamp}  ${line.text}`).join('\n')
}

function logCheckpointEvent(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') return
  console.log(
    JSON.stringify({
      route: 'suggest-client',
      subsystem: 'checkpoint',
      event,
      ...payload,
    }),
  )
}

interface SuggestResponse {
  cards: SuggestionCard[]
  degraded?: boolean
  repaired?: boolean
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
  const meetingKind = useStore((s) => s.meetingKind)
  const setMeetingKind = useStore((s) => s.setMeetingKind)
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
  const [showDegradedHint, setShowDegradedHint] = useState(false)
  const [showRepairedHint, setShowRepairedHint] = useState(false)

  const isLoadingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const deadlineRef = useRef<number>(Date.now() + COUNTDOWN_SECONDS * 1000)
  const lastFireHashRef = useRef<string>('')
  const fireSuggestionsRef = useRef<() => Promise<void>>(async () => {})
  const isSummaryRefreshingRef = useRef(false)
  const isClassifyingRef = useRef(false)
  const committedCheckpointBatchCountRef = useRef(0)
  const committedCheckpointLineCountRef = useRef(0)
  const pendingCheckpointRef = useRef<PendingCheckpoint | null>(null)
  const checkpointRequestSeqRef = useRef(0)
  const summaryRetryNotBeforeMsRef = useRef(0)
  const lastPendingAgeLogBucketRef = useRef(-1)

  useEffect(() => {
    if (batches.length !== 0 || summary.trim()) return
    committedCheckpointBatchCountRef.current = 0
    committedCheckpointLineCountRef.current = 0
    pendingCheckpointRef.current = null
    checkpointRequestSeqRef.current = 0
    summaryRetryNotBeforeMsRef.current = 0
    lastPendingAgeLogBucketRef.current = -1
    isSummaryRefreshingRef.current = false
  }, [batches.length, summary])

  const startCheckpointSummary = useCallback(
    (input: { apiKey: string; batchCount: number; transcriptLines: TranscriptLine[] }) => {
      const pending = pendingCheckpointRef.current
      if (pending) {
        const ageMs = Date.now() - pending.startedAtMs
        const ageBucket = Math.floor(ageMs / CHECKPOINT_PENDING_LOG_BUCKET_MS)
        if (ageBucket > lastPendingAgeLogBucketRef.current) {
          lastPendingAgeLogBucketRef.current = ageBucket
          logCheckpointEvent('pending_age', {
            requestId: pending.requestId,
            ageMs,
            snapshotBatchCount: pending.snapshotBatchCount,
            committedCheckpointBatchCount: committedCheckpointBatchCountRef.current,
          })
        }
        return
      }

      if (Date.now() < summaryRetryNotBeforeMsRef.current) {
        return
      }

      if (
        !shouldStartCheckpointSummary({
          batchCount: input.batchCount,
          committedCheckpointBatchCount: committedCheckpointBatchCountRef.current,
          hasPendingCheckpoint: false,
        })
      ) {
        return
      }

      const requestId = checkpointRequestSeqRef.current + 1
      checkpointRequestSeqRef.current = requestId
      const pendingCheckpoint: PendingCheckpoint = {
        requestId,
        snapshotBatchCount: input.batchCount,
        snapshotLineCount: input.transcriptLines.length,
        startedAtMs: Date.now(),
      }
      pendingCheckpointRef.current = pendingCheckpoint
      isSummaryRefreshingRef.current = true
      lastPendingAgeLogBucketRef.current = 0

      logCheckpointEvent('triggered', {
        requestId,
        snapshotBatchCount: pendingCheckpoint.snapshotBatchCount,
        snapshotLineCount: pendingCheckpoint.snapshotLineCount,
        committedCheckpointBatchCount: committedCheckpointBatchCountRef.current,
        committedCheckpointLineCount: committedCheckpointLineCountRef.current,
      })

      const priorSummary = useStore.getState().summary

      const summaryWindow = getCheckpointSummaryWindow({
        transcriptLines: input.transcriptLines,
        committedCheckpointLineCount: committedCheckpointLineCountRef.current,
        snapshotLineCount: pendingCheckpoint.snapshotLineCount,
      })
      const summaryTranscript = formatTranscriptForSummary(summaryWindow)
      const firstSummaryLine = summaryWindow[0]
      const lastSummaryLine = summaryWindow[summaryWindow.length - 1]

      logCheckpointEvent('window_built', {
        requestId,
        windowLineCount: summaryWindow.length,
        windowChars: summaryTranscript.length,
        windowFirstTimestamp: firstSummaryLine?.timestamp ?? null,
        windowLastTimestamp: lastSummaryLine?.timestamp ?? null,
      })

      if (!summaryTranscript.trim()) {
        pendingCheckpointRef.current = null
        isSummaryRefreshingRef.current = false
        logCheckpointEvent('skipped_empty_transcript', {
          requestId,
          snapshotBatchCount: pendingCheckpoint.snapshotBatchCount,
        })
        return
      }

      void refreshSummary({
        transcript: summaryTranscript,
        apiKey: input.apiKey,
        priorSummary,
      })
        .then((nextSummary) => {
          const livePending = pendingCheckpointRef.current
          if (!livePending || livePending.requestId !== requestId) {
            logCheckpointEvent('stale_response_ignored', { requestId })
            return
          }

          pendingCheckpointRef.current = null
          isSummaryRefreshingRef.current = false
          if (!nextSummary) {
            summaryRetryNotBeforeMsRef.current =
              Date.now() + CHECKPOINT_SUMMARY_RETRY_COOLDOWN_MS
            logCheckpointEvent('summary_empty_retry_scheduled', {
              requestId,
              retryAtMs: summaryRetryNotBeforeMsRef.current,
            })
            return
          }

          const prevBatch = committedCheckpointBatchCountRef.current
          const prevLine = committedCheckpointLineCountRef.current
          setSummary(nextSummary)
          committedCheckpointBatchCountRef.current = livePending.snapshotBatchCount
          committedCheckpointLineCountRef.current = livePending.snapshotLineCount
          summaryRetryNotBeforeMsRef.current = 0
          lastPendingAgeLogBucketRef.current = -1

          logCheckpointEvent('commit_applied', {
            requestId,
            fromBatchCount: prevBatch,
            toBatchCount: livePending.snapshotBatchCount,
            fromLineCount: prevLine,
            toLineCount: livePending.snapshotLineCount,
            summaryChars: nextSummary.length,
          })
        })
        .catch((error) => {
          const livePending = pendingCheckpointRef.current
          if (!livePending || livePending.requestId !== requestId) {
            logCheckpointEvent('stale_error_ignored', { requestId })
            return
          }

          pendingCheckpointRef.current = null
          isSummaryRefreshingRef.current = false
          summaryRetryNotBeforeMsRef.current =
            Date.now() + CHECKPOINT_SUMMARY_RETRY_COOLDOWN_MS

          const message = error instanceof Error ? error.message : 'unknown'
          logCheckpointEvent('summary_failed_retry_scheduled', {
            requestId,
            retryAtMs: summaryRetryNotBeforeMsRef.current,
            error: message,
          })
        })
    },
    [setSummary],
  )

  const fireSuggestions = useCallback(async () => {
    if (isLoadingRef.current) return
    const key = apiKey.trim()
    if (!key) return

    const currentState = useStore.getState()
    const transcriptLinesNow = currentState.transcriptLines
    const currentSummary = currentState.summary
    const currentMeetingKind = currentState.meetingKind
    const transcriptLineCount = transcriptLinesNow.length
    const recentTranscript = getSuggestTranscriptTailFromCheckpoint({
      transcriptLines: transcriptLinesNow,
      committedCheckpointLineCount: committedCheckpointLineCountRef.current,
      suggestContextChars,
    })
    if (!recentTranscript.trim()) return
    const hashInput = `${transcriptLineCount}:${recentTranscript.length}:${recentTranscript.slice(-64)}`
    if (hashInput === lastFireHashRef.current) {
      deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
      setCountdown(COUNTDOWN_SECONDS)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const priorBatches = getRecentBatches(2)
      .flatMap((batch) => batch.cards.map((card) => `${formatCardType(card.type)}: ${card.preview}`))
      .join('\n')

    const payload = {
      transcriptTail: recentTranscript,
      rollingSummary: currentSummary,
      priorBatchesText: priorBatches,
      meetingKind: currentMeetingKind ?? undefined,
      intentPrompts: suggestIntentPrompts,
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
        signal: controller.signal,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(data.error ?? 'Unknown error')
      }

      const data = (await res.json()) as SuggestResponse
      const cards = Array.isArray(data.cards) ? data.cards : []
      if (controller.signal.aborted) return

      if (cards.length === 0) {
        setShowDegradedHint(data.degraded === true)
        setShowRepairedHint(false)
        setWaitingForSubstance(true)
        return
      }

      lastFireHashRef.current = hashInput
      addBatch({
        timestamp: timestampNow(),
        cards,
        degraded: data.degraded === true,
        repaired: data.repaired === true,
      })
      setShowDegradedHint(data.degraded === true)
      setShowRepairedHint(data.repaired === true)
      setWaitingForSubstance(false)

      const latestState = useStore.getState()
      const nextBatchCount = latestState.batches.length
      const latestTranscriptLines = latestState.transcriptLines
      const transcriptChars = countTranscriptChars(latestTranscriptLines)

      startCheckpointSummary({
        apiKey: key,
        batchCount: nextBatchCount,
        transcriptLines: latestTranscriptLines,
      })

      const shouldRunClassify = shouldClassify({
        meetingKind: latestState.meetingKind,
        batchCount: nextBatchCount,
        transcriptChars,
        inFlight: isClassifyingRef.current,
      })
      if (shouldRunClassify) {
        isClassifyingRef.current = true
        const classifyInput = takeTailByChars(latestTranscriptLines, 6000)
        void classifyMeeting(classifyInput, key)
          .then((kind) => {
            setMeetingKind(kind)
          })
          .catch(() => {
            // classification failures are non-fatal
          })
          .finally(() => {
            isClassifyingRef.current = false
          })
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      const message = err instanceof Error ? err.message : ''
      const normalized = normalizeApiErrorCopy(message)
      if (normalized === RATE_LIMITED_COPY || normalized === INVALID_GROQ_KEY_COPY) {
        setError(normalized)
      } else {
        setError(SUGGEST_FAILURE_COPY)
      }
    } finally {
      deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
      setCountdown(COUNTDOWN_SECONDS)
      isLoadingRef.current = false
      setIsLoading(false)
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [
    addBatch,
    apiKey,
    getRecentBatches,
    startCheckpointSummary,
    suggestContextChars,
    suggestIntentPrompts,
    setMeetingKind,
  ])

  useEffect(() => {
    fireSuggestionsRef.current = fireSuggestions
  }, [fireSuggestions])

  useEffect(() => {
    if (!isRecording) return
    deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
    setCountdown(COUNTDOWN_SECONDS)

    const id = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      )
      setCountdown(remaining)
      if (remaining === 0 && !isLoadingRef.current) {
        void fireSuggestionsRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [isRecording])

  useEffect(() => {
    if (!isRecording) {
      abortRef.current?.abort()
    }
  }, [isRecording])

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  function handleReload() {
    if (isLoading || !apiKey.trim()) return
    deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
    setCountdown(COUNTDOWN_SECONDS)
    lastFireHashRef.current = ''
    void fireSuggestions()
  }

  const batchCount = batches.length
  const badgeLabel = batchCount === 1 ? '1 BATCH' : `${batchCount} BATCHES`
  const meetingKindLabel = meetingKind ? meetingKind.replace('_', ' ') : ''
  const noKey = !apiKey.trim()

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <ColumnHeader
        number={2}
        title="LIVE SUGGESTIONS"
        badge={
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {badgeLabel}
            {meetingKindLabel ? ` \u00B7 ${meetingKindLabel}` : ''}
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
          {!isRecording
            ? 'auto-refresh paused (mic off)'
            : isLoading
              ? 'generating suggestions...'
              : `auto-refresh in ${countdown}s`}
        </span>
      </div>

      {waitingForSubstance && !noKey && (
        <div className="border-b border-zinc-900 px-4 py-2 text-xs text-zinc-500">
          waiting for substance...
        </div>
      )}
      {showDegradedHint && !noKey && (
        <div className="border-b border-amber-500/20 px-4 py-2 text-xs text-amber-300/90">
          model json fallback active...
        </div>
      )}
      {showRepairedHint && !noKey && (
        <div className="border-b border-cyan-500/20 px-4 py-2 text-xs text-cyan-300/90">
          format repair applied...
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
