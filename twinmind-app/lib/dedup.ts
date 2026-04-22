export function deduplicateTail(prevTail: string, newText: string): string {
  if (!prevTail || !newText) return newText
  const prevWords = prevTail.trim().split(/\s+/).filter(Boolean)
  const newWords = newText.trim().split(/\s+/).filter(Boolean)
  let overlapLength = 0
  const maxCandidate = Math.min(prevWords.length, newWords.length)
  for (let len = maxCandidate; len > 0; len--) {
    const suffix = prevWords.slice(-len).join(' ').toLowerCase()
    const prefix = newWords.slice(0, len).join(' ').toLowerCase()
    if (suffix === prefix) {
      overlapLength = len
      break
    }
  }
  if (overlapLength > 0) {
    const removeCount = Math.min(overlapLength, 20)
    return newWords.slice(removeCount).join(' ')
  }
  return newText
}

export function lastWords(text: string, count: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.slice(-count).join(' ')
}
