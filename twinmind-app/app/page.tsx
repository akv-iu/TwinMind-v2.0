'use client'

import Link from 'next/link'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  CircleHelp,
  FileText,
  MessageSquare,
  Mic,
} from 'lucide-react'
import { useStore } from '@/store'

const STEPS = [
  {
    number: '01',
    title: 'Bring your key.',
    description: 'Create a Groq API key and add it in Settings. No TwinMind account needed.',
  },
  {
    number: '02',
    title: 'Start the conversation.',
    description: 'Turn on your mic. Your transcript takes shape as the conversation unfolds.',
  },
  {
    number: '03',
    title: 'Find your next thought.',
    description: 'Get fresh suggestions every 30 seconds. Ask the chat when you want to go deeper.',
  },
]

export default function LandingPage() {
  const hasKey = useStore((s) => s.groqApiKey.trim().length > 0)

  return (
    <div className="min-h-screen bg-[#f8f7f3] font-sans text-[#252820] selection:bg-[#edc4ad] [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-[#b44829]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-20 focus:bg-[#f8f7f3] focus:p-3">
        Skip to content
      </a>

      <header className="mx-auto flex max-w-[1240px] items-center justify-between border-b border-[#deded5] px-6 py-6 sm:mx-8 sm:px-0 lg:mx-auto lg:w-[calc(100%-112px)]">
        <Link href="/" aria-label="TwinMind home" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#c65332] text-[#fff9f0]">
            <AudioLines size={23} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="text-[21px] font-semibold tracking-[-0.9px]">twinmind<span className="text-[#c65332]">.</span></span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-7 text-[13px] font-medium sm:gap-10">
          <a href="#how-it-works" className="hidden text-[#62665b] transition-colors hover:text-[#b44829] sm:block">How it works</a>
          <Link href="/app" className="flex min-h-10 items-center gap-2 transition-colors hover:text-[#b44829]">
            Open app <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="mx-auto grid max-w-[1240px] items-center gap-14 px-6 pb-16 pt-14 sm:px-8 sm:pt-20 lg:w-[calc(100%-112px)] lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-0 lg:pb-24 lg:pt-24">
          <div>
            <p className="mb-7 flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#676b5f] sm:text-[11px]">
              <span className="h-px w-7 bg-[#c65332]" aria-hidden="true" />
              A second mind for your meetings
            </p>
            <h1 id="hero-title" className="text-[clamp(2.75rem,14vw,3.5rem)] leading-[1.02] tracking-[-0.065em] sm:text-[clamp(3.5rem,7.2vw,6.25rem)]">
              <span className="font-medium">Be here.</span>
              <br />
              <span className="font-[Georgia,serif] italic tracking-[-0.065em] text-[#b44829]">Think ahead.</span>
            </h1>
            <p className="mt-7 max-w-[390px] text-[16px] leading-[1.8] text-[#63675d] sm:text-[17px]">
              Stay with the conversation. TwinMind turns what&apos;s being said into useful questions, clear answers, and your next good idea.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-5">
              <Link href="/app" className="group inline-flex min-h-12 items-center justify-center gap-6 rounded-md bg-[#c65332] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#a94024]">
                {hasKey ? 'Continue to app' : 'Try TwinMind'}
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
              </Link>
              <a href="#in-action" className="inline-flex min-h-11 items-center gap-2 border-b border-[#9a9d90] text-sm transition-colors hover:text-[#b44829]">
                See it in action <ArrowDown size={14} aria-hidden="true" />
              </a>
            </div>
            <p className="mt-5 text-xs text-[#6b7063]">No sign-up. Your Groq API key. Your conversation.</p>
          </div>

          <figure id="in-action" className="min-w-0 scroll-mt-8">
            <div className="relative rounded-xl bg-[#eae9e1] p-4 pb-6 sm:p-7 sm:pb-8">
              <div className="mb-5 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#65695d] sm:text-[10px]">
                <span>A conversation, with a little backup.</span>
                <span className="shrink-0">LIVE CONTEXT</span>
              </div>

              <div className="overflow-hidden rounded-lg bg-[#272d27] text-[#f4f3ea] shadow-[0_12px_24px_-16px_#25282066]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <span className="flex items-center gap-2 text-xs font-medium"><AudioLines size={16} className="text-[#d7ad91]" aria-hidden="true" /> Product sync</span>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] text-[#ced8c3]"><span className="size-1.5 rounded-full bg-[#b8cd99]" aria-hidden="true" /> TRANSCRIBING</span>
                </div>

                <div className="space-y-5 px-5 pb-8 pt-6 text-xs leading-[1.85] sm:px-6 sm:text-[13px]">
                  <p className="flex gap-4 text-[#c0c5bb]"><span className="pt-0.5 font-mono text-[10px] text-[#a2ad9c]">08:34</span><span>We&apos;re aiming to ship the new onboarding flow by the end of the month.</span></p>
                  <p className="flex gap-4"><span className="pt-0.5 font-mono text-[10px] text-[#a2ad9c]">08:42</span><span>But we still haven&apos;t decided <span className="bg-[#46513d] px-0.5 text-[#e1edce]">what success looks like</span> for the first release.</span></p>
                </div>

                <div className="mx-3 mb-3 rounded-md bg-[#faf9f4] p-5 text-[#303429] sm:mx-5 sm:mb-5">
                  <div className="mb-3 flex items-center justify-between text-[#b44829]">
                    <span className="flex items-center gap-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em]"><CircleHelp size={14} aria-hidden="true" /> A question to ask</span>
                    <span className="font-mono text-[9px] text-[#73786a]">JUST NOW</span>
                  </div>
                  <p className="font-[Georgia,serif] text-[21px] leading-[1.4] tracking-[-0.025em] sm:text-[25px]">&ldquo;What&apos;s the one metric that would tell us this launch worked?&rdquo;</p>
                  <div className="mt-4 border-t border-[#e2e3d9] pt-3 text-[10px] text-[#676d5f]">Grounded in the conversation <span aria-hidden="true">↗</span></div>
                </div>

                <div className="flex items-center justify-between px-5 pb-4">
                  <span className="flex items-center gap-2 text-[10px] text-[#c0c9b7]"><Mic size={13} aria-hidden="true" /> Listening, so you can too.</span>
                  <AudioLines size={32} strokeWidth={1.3} className="text-[#b8cd99]" aria-hidden="true" />
                </div>
              </div>
            </div>
            <figcaption className="mt-4 flex items-center justify-between gap-3 text-[10px] text-[#6b7063] sm:px-1 sm:text-[11px]">
              <span>A useful nudge. Right when you need it.</span>
              <span className="font-mono uppercase tracking-[0.1em]">Example session</span>
            </figcaption>
          </figure>
        </section>

        <section aria-label="Meeting tools" className="border-y border-[#deded5] bg-[#efefe7]">
          <div className="mx-auto grid max-w-[1240px] gap-7 px-6 py-8 sm:grid-cols-3 sm:gap-5 sm:px-8 lg:w-[calc(100%-112px)] lg:px-0">
            <div className="flex items-start gap-3.5"><Mic size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#777e65]" aria-hidden="true" /><div><h2 className="text-sm font-medium">Catch the conversation.</h2><p className="mt-1 text-xs leading-relaxed text-[#676c5e]">A live transcript as you speak.</p></div></div>
            <div className="flex items-start gap-3.5"><MessageSquare size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#777e65]" aria-hidden="true" /><div><h2 className="text-sm font-medium">Keep a thought partner close.</h2><p className="mt-1 text-xs leading-relaxed text-[#676c5e]">Suggestions and chat with meeting context.</p></div></div>
            <div className="flex items-start gap-3.5"><FileText size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#777e65]" aria-hidden="true" /><div><h2 className="text-sm font-medium">Leave with the important bits.</h2><p className="mt-1 text-xs leading-relaxed text-[#676c5e]">Automatic summaries to keep you oriented.</p></div></div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="setup-title" className="mx-auto max-w-[1240px] scroll-mt-8 px-6 py-16 sm:px-8 lg:w-[calc(100%-112px)] lg:px-0 lg:py-20">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#74796a]">Less setup. More presence.</p>
              <h2 id="setup-title" className="text-3xl font-medium tracking-[-0.045em] sm:text-4xl">Ready for your next meeting.</h2>
            </div>
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[#b44829] underline decoration-[#d6b4a4] underline-offset-4 hover:decoration-[#b44829]">Get a Groq API key <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>

          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-8 lg:gap-14">
            {STEPS.map(({ number, title, description }) => (
              <li key={number} className="border-t border-[#cdd0c2] pt-5">
                <span className="font-mono text-[11px] text-[#b44829]">{number}</span>
                <h3 className="mb-2 mt-4 text-base font-medium tracking-[-0.02em]">{title}</h3>
                <p className="max-w-xs text-[13px] leading-[1.8] text-[#676c5e]">{description}</p>
              </li>
            ))}
          </ol>

          <p className="mt-10 max-w-3xl border-l-2 border-[#d6b4a4] pl-4 text-xs leading-[1.8] text-[#676c5e]">
            <span className="font-medium text-[#454b3d]">A note on Groq:</span> a Developer plan is recommended for longer meetings. Free-tier rate limits can interrupt suggestions and chat.{' '}
            <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#b44829]">View plans <span className="sr-only">on Groq</span><span aria-hidden="true">↗</span></a>
          </p>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t border-[#deded5] px-6 py-6 text-[11px] text-[#6b7063] sm:mx-8 sm:px-0 lg:mx-auto lg:w-[calc(100%-112px)]">
        <p className="flex items-center gap-2"><AudioLines size={16} className="text-[#b44829]" aria-hidden="true" /><span className="font-medium text-[#454b3d]">twinmind.</span> A little backup for your brain.</p>
        <p>Browser-based <span className="mx-2" aria-hidden="true">·</span> Powered by Groq</p>
      </footer>
    </div>
  )
}
