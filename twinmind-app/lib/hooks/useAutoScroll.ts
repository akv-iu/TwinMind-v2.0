'use client'

import { useCallback, useRef } from 'react'

export interface UseAutoScrollResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
  scrollToBottom: () => void
  isUserScrolledUpRef: React.MutableRefObject<boolean>
}

const THRESHOLD = 50

export function useAutoScroll(): UseAutoScrollResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isUserScrolledUpRef = useRef<boolean>(false)

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    isUserScrolledUpRef.current = distanceFromBottom > THRESHOLD
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (isUserScrolledUpRef.current) return
    el.scrollTop = el.scrollHeight
  }, [])

  return { containerRef, onScroll, scrollToBottom, isUserScrolledUpRef }
}
