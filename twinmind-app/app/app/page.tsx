'use client'

import { useRef, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { ThreeColumnLayout } from '@/components/layout/ThreeColumnLayout'
import { TranscriptColumn } from '@/components/transcript/TranscriptColumn'
import { SuggestionsColumn } from '@/components/suggestions/SuggestionsColumn'
import { ChatColumn, type ChatColumnHandle } from '@/components/chat/ChatColumn'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { InfraNoticeBanner } from '@/components/layout/InfraNoticeBanner'
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

      <div className="relative min-h-0 flex-1">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-400 backdrop-blur transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
        >
          <SettingsIcon size={16} />
        </button>

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
