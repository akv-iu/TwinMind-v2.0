'use client'

import { useRef, useState } from 'react'
import { ThreeColumnLayout } from '@/components/layout/ThreeColumnLayout'
import { TranscriptColumn } from '@/components/transcript/TranscriptColumn'
import { SuggestionsColumn } from '@/components/suggestions/SuggestionsColumn'
import { ChatColumn, type ChatColumnHandle } from '@/components/chat/ChatColumn'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { InfraNoticeBanner } from '@/components/layout/InfraNoticeBanner'
import { AppHeader } from '@/components/layout/AppHeader'
import { useStore } from '@/store'
import type { SuggestionCard } from '@/lib/types'

export default function AppPage() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const chatRef = useRef<ChatColumnHandle | null>(null)
  const apiKey = useStore((s) => s.groqApiKey)
  const noKey = !apiKey.trim()

  function handleCardClick(card: SuggestionCard) {
    chatRef.current?.sendCardAsMessage(card)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink selection:bg-accent-soft lg:h-dvh lg:overflow-hidden">
      <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
      <InfraNoticeBanner />

      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 px-5 py-6 sm:px-8 lg:py-7">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Your meeting workspace</p>
          <h1 className="text-[28px] font-medium leading-tight tracking-[-0.045em] sm:text-[34px]">
            Room for the <span className="font-[Georgia,serif] italic text-accent-strong">conversation.</span>
          </h1>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted">Stay present. Catch a useful thought.<br className="hidden sm:block" /> Go deeper when you need to.</p>
      </div>

      <div className="min-h-0 flex-1 px-4 pb-5 sm:px-8 sm:pb-8">
        <ThreeColumnLayout
          left={<TranscriptColumn />}
          middle={
            <SuggestionsColumn
              onCardClick={handleCardClick}
              cardsDisabled={noKey}
            />
          }
          right={<ChatColumn ref={chatRef} />}
        />
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
