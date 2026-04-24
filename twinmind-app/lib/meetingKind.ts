import type { MeetingKind } from './types'

const CLASSIFY_AFTER_BATCH = 3
const MIN_TRANSCRIPT_CHARS = 500

export function shouldClassify(state: {
  meetingKind: MeetingKind | null
  batchCount: number
  transcriptChars: number
  inFlight: boolean
}): boolean {
  if (state.inFlight) return false
  if (state.meetingKind !== null) return false
  if (state.batchCount < CLASSIFY_AFTER_BATCH) return false
  if (state.transcriptChars < MIN_TRANSCRIPT_CHARS) return false
  return true
}

export async function classifyMeeting(
  transcript: string,
  apiKey: string,
): Promise<MeetingKind> {
  const res = await fetch('/api/classify-meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, apiKey }),
  })
  if (!res.ok) throw new Error('classify failed')
  const data = (await res.json()) as { kind?: MeetingKind }
  return data.kind ?? 'other'
}

export const KIND_ROLE_HINTS: Record<MeetingKind, string> = {
  standup:
    'Prefer concise ANSWERs and pointed unblocker QUESTION_TO_ASKs. TALKING_POINTs should be short status-adjacent facts.',
  sales:
    'Lean toward TALKING_POINTs that move the deal and FACT_CHECKs for pricing/claims. QUESTION_TO_ASK should probe pain and budget.',
  one_on_one:
    'Prefer empathetic, open QUESTION_TO_ASKs. ANSWERs should be supportive. Avoid aggressive FACT_CHECKs unless evidence is strong.',
  design_review:
    'Prefer sharp QUESTION_TO_ASKs about tradeoffs and FACT_CHECKs on technical claims. TALKING_POINTs should reference prior decisions or constraints.',
  interview:
    'Prefer probing QUESTION_TO_ASKs that reveal depth. FACT_CHECKs should be gentle. ANSWERs fit when the candidate asked a question.',
  brainstorm:
    'Prefer TALKING_POINTs that add angles and QUESTION_TO_ASKs that open new directions. FACT_CHECKs are low priority.',
  presentation:
    'Prefer QUESTION_TO_ASKs the audience could ask. FACT_CHECKs for claims on slides. TALKING_POINTs to extend or relate to adjacent work.',
  retrospective:
    'Prefer QUESTION_TO_ASKs about root causes and blockers. TALKING_POINTs should surface patterns across past sprints. FACT_CHECKs for claimed outcomes or timelines.',
  other:
    'Use whatever mix of types best fits the recent transcript.',
}

export const KIND_EXAMPLES: Record<MeetingKind, string> = {
  standup: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"What's blocking you on the migration ticket?"},{"type":"ANSWER","preview":"The staging deploy went out yesterday around 6pm."},{"type":"TALKING_POINT","preview":"Two follow-ups from last standup are still open."}]}`,
  sales: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"Who else on your side owns the security review?"},{"type":"FACT_CHECK","preview":"The 40% improvement claim - is that vs. your current vendor or industry average?"},{"type":"TALKING_POINT","preview":"We have two customers in your segment who shipped in under 30 days."}]}`,
  one_on_one: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"What would make the next month feel like a win for you?"},{"type":"ANSWER","preview":"You asked about career ladder - levels are documented in the handbook under 'growth'."},{"type":"TALKING_POINT","preview":"You mentioned burnout last month - worth checking in on the workload now."}]}`,
  design_review: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"What happens if the queue back-pressures for more than 5 minutes?"},{"type":"FACT_CHECK","preview":"The 10ms p99 assumption - is that measured or estimated?"},{"type":"TALKING_POINT","preview":"The prior ADR on retries picked exponential backoff with jitter - worth revisiting here."}]}`,
  interview: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"Walk me through a tradeoff you regretted after shipping."},{"type":"ANSWER","preview":"The team is 8 people, mostly senior, with a 4-week onboarding plan."},{"type":"FACT_CHECK","preview":"You mentioned leading a 50-person org - was that direct reports or through managers?"}]}`,
  brainstorm: `{"cards":[{"type":"TALKING_POINT","preview":"Adjacent teams tried a similar idea and killed it over latency - worth reading their post-mortem."},{"type":"QUESTION_TO_ASK","preview":"What would have to be true in 6 months for this to have been a good bet?"},{"type":"FACT_CHECK","preview":"That 2-week estimate - is it scoped to the MVP or the full feature?"}]}`,
  presentation: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"How does this compare to what the incumbent vendor offers today?"},{"type":"FACT_CHECK","preview":"The 3x growth chart - what's the base period for the comparison?"},{"type":"TALKING_POINT","preview":"Slide 4's metric aligns with the target the team committed to last quarter."}]}`,
  retrospective: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"What was the root cause - was it the deploy process or the review gate?"},{"type":"TALKING_POINT","preview":"The same failure mode appeared in the sprint-4 retro - pattern worth escalating."},{"type":"FACT_CHECK","preview":"The 2-hour incident - was that MTTR or time-to-detect?"}]}`,
  other: `{"cards":[{"type":"QUESTION_TO_ASK","preview":"What's the blocker on the next decision here?"},{"type":"FACT_CHECK","preview":"Check the 18% figure - is that monthly or annualized?"},{"type":"TALKING_POINT","preview":"The team hit 92% of this KPI last quarter under similar constraints."}]}`,
}
