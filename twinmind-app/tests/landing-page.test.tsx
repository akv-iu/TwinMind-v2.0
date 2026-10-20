import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LandingPage from '@/app/page'
import { useStore } from '@/store'

afterEach(() => {
  cleanup()
  useStore.setState({ groqApiKey: '' })
})

it.each([
  ['', 'Try TwinMind'],
  ['   ', 'Try TwinMind'],
  ['gsk_test', 'Continue to app'],
])('offers the right app entry point for key %j', (groqApiKey, label) => {
  useStore.setState({ groqApiKey })
  render(<LandingPage />)

  expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe('/app')
})
