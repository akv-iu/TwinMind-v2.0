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
    <div className="flex h-screen flex-col">
      <InfraNoticeBanner />
      <AppHeader onSettingsClick={() => setSettingsOpen(true)} />

      <div className="min-h-0 flex-1">
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
