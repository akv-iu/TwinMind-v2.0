import type { TranscriptLine } from './types'

export function takeTailByChars(lines: TranscriptLine[], budget: number): string {
  if (budget <= 0 || lines.length === 0) return ''

  const out: string[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const formatted = `${lines[i].timestamp}  ${lines[i].text}`
    const cost = formatted.length + 1
    if (used + cost > budget && out.length > 0) break
    out.unshift(formatted)
    used += cost
  }

  return out.join('\n')
}

