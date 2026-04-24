'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ExternalLink, Lightbulb, Mic, Zap } from 'lucide-react'
import { useStore } from '@/store'

const STEPS = [
  {
    number: '01',
    icon: Zap,
    title: 'Get a free Groq API key',
    description:
      'Groq is free to sign up. Generate a key at console.groq.com — takes under a minute.',
  },
  {
    number: '02',
    icon: Mic,
    title: 'Paste your key and start the mic',
    description:
      'Open TwinMind, paste your key in Settings ⚙, then hit the mic button to begin capturing your meeting.',
  },
  {
    number: '03',
    icon: Lightbulb,
    title: 'Get live suggestions',
    description:
      'Every 30 seconds: 3 fresh cards — questions to ask, talking points, and fact-checks grounded in what was just said.',
  },
]

export default function LandingPage() {
  const [mounted, setMounted] = useState(false)
  const apiKey = useStore((s) => s.groqApiKey)
  const hasKey = mounted && apiKey.trim().length > 0

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 py-20">

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-80px] h-[400px] w-[900px] -translate-x-1/2 bg-gradient-to-b from-indigo-500/8 to-transparent blur-[90px]" />
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center gap-10 text-center">

        {/* Badge */}
        <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs text-zinc-400 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Powered by Groq — sub-second inference
        </div>

        {/* Hero text */}
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Your real-time
            <br />
            <span className="bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              AI meeting copilot
            </span>
          </h1>
          <p className="mx-auto max-w-lg text-base leading-relaxed text-zinc-400">
            Live suggestions, instant answers, and automatic summaries — grounded in
            what&apos;s actually being said, as it happens.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            {hasKey ? 'Continue to App' : 'Get Started'}
            <ArrowRight size={15} />
          </Link>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Get free Groq API key
            <ExternalLink size={13} />
          </a>
        </div>

        {/* Steps */}
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {STEPS.map(({ number, icon: Icon, title, description }) => (
            <div
              key={number}
              className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-left backdrop-blur transition-colors hover:border-zinc-700"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs text-zinc-600">{number}</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                  <Icon size={13} className="text-zinc-400" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-zinc-100">{title}</p>
                <p className="text-xs leading-relaxed text-zinc-500">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-xs text-zinc-600">
          Free to use&nbsp;·&nbsp;Runs in your browser&nbsp;·&nbsp;API key stays on your
          device&nbsp;·&nbsp;No data stored on our servers
        </p>

      </div>
    </div>
  )
}
