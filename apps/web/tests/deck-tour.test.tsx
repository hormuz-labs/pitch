import { fireEvent, render, screen } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DECK_TOUR_STORAGE_KEY,
  DeckEditorTour,
  deckTourComplete,
  rememberDeckTour,
} from '../src/solid/studio/deck/DeckEditorTour'

describe('DeckEditorTour', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.body.innerHTML = `
      <div data-deck-tour="canvas" style="width: 800px; height: 450px; position: absolute; left: 20px; top: 20px;"></div>
      <button data-deck-tour="insert" style="width: 40px; height: 40px; position: absolute; right: 20px; bottom: 80px;">Insert</button>
      <div data-deck-tour="slides" style="width: 800px; height: 80px; position: absolute; left: 20px; bottom: 0;">Slides</div>
      <button data-deck-tour="select" style="width: 40px; height: 40px; position: absolute; left: 20px; top: 20px;">Select</button>
    `
  })

  it('detects tour completion state via localStorage', () => {
    expect(deckTourComplete()).toBe(false)
    rememberDeckTour()
    expect(deckTourComplete()).toBe(true)
  })

  it('renders spotlight showcase tour when ready and not completed', async () => {
    render(() => <DeckEditorTour ready={true} />)
    expect(screen.getByTestId('deck-editor-tour')).toBeTruthy()
    expect(screen.getByText('Click anything to change it')).toBeTruthy()
    expect(screen.getByText('1 / 4')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip tour' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Next/ })).toBeTruthy()
  })

  it('navigates through steps with Next and Back buttons', async () => {
    render(() => <DeckEditorTour ready={true} />)
    const nextBtn = screen.getByRole('button', { name: /Next/ })
    const backBtn = screen.getByRole('button', { name: /Back/ })

    expect(backBtn.hasAttribute('disabled')).toBe(true)

    // Step 1 -> Step 2
    fireEvent.click(nextBtn)
    expect(screen.getByText('2 / 4')).toBeTruthy()
    expect(screen.getByText('Add content from here')).toBeTruthy()
    expect(backBtn.hasAttribute('disabled')).toBe(false)

    // Step 2 -> Step 1
    fireEvent.click(backBtn)
    expect(screen.getByText('1 / 4')).toBeTruthy()
    expect(screen.getByText('Click anything to change it')).toBeTruthy()

    // Step 1 -> 2 -> 3 -> 4
    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)
    expect(screen.getByText('3 / 4')).toBeTruthy()
    expect(screen.getByText('Every slide stays within reach')).toBeTruthy()

    fireEvent.click(nextBtn)
    expect(screen.getByText('4 / 4')).toBeTruthy()
    expect(screen.getByText('Point at an element for the chat')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start editing' })).toBeTruthy()

    // Complete tour on final step
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }))
    expect(window.localStorage.getItem(DECK_TOUR_STORAGE_KEY)).toBe('done')
    expect(screen.queryByTestId('deck-editor-tour')).toBeNull()
  })

  it('skips tour immediately and sets completion flag', () => {
    render(() => <DeckEditorTour ready={true} />)
    const skipBtn = screen.getByRole('button', { name: 'Skip tour' })
    fireEvent.click(skipBtn)
    expect(window.localStorage.getItem(DECK_TOUR_STORAGE_KEY)).toBe('done')
    expect(screen.queryByTestId('deck-editor-tour')).toBeNull()
  })

  it('closes tour on Escape key', () => {
    render(() => <DeckEditorTour ready={true} />)
    expect(screen.getByTestId('deck-editor-tour')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(window.localStorage.getItem(DECK_TOUR_STORAGE_KEY)).toBe('done')
    expect(screen.queryByTestId('deck-editor-tour')).toBeNull()
  })
})
