import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { DeckToolbar } from '../src/solid/studio/deck/DeckToolbar'
import {
  createDeckSession,
  type DeckSel,
  type DeckSession,
} from '../src/solid/studio/deck/deckSession'

function makeSel(overrides: Partial<DeckSel> = {}): DeckSel {
  return {
    kind: 'text',
    rect: { x: 100, y: 100, w: 200, h: 40 },
    slideIndex: 1,
    styles: {
      color: '#111111',
      fontSize: '20px',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      align: 'left',
      blockTag: 'p',
      ...overrides.styles,
    },
    ...overrides,
  }
}

function setup(sel: DeckSel) {
  const post = vi.fn()
  const session: DeckSession = createDeckSession(post)
  session.setSel(sel)
  const onToggleChart = vi.fn()
  render(() => <DeckToolbar session={session} chartOpen={false} onToggleChart={onToggleChart} />)
  return { post, session, onToggleChart }
}

const lastPost = (post: ReturnType<typeof vi.fn>) => post.mock.calls.at(-1)?.[0]

describe('DeckToolbar', () => {
  it('renders text controls for a text selection', () => {
    setup(makeSel())
    expect(screen.getByRole('toolbar', { name: 'Deck element tools' })).toBeTruthy()
    expect(screen.getByLabelText('Text style')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Replace image' })).toBeNull()
  })

  it('posts deck_exec when clicking bold', () => {
    const { post } = setup(makeSel())
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(lastPost(post)).toEqual({ type: 'deck_exec', cmd: 'bold' })
  })

  it('reflects active format state from sel.styles', () => {
    setup(makeSel({ styles: { ...makeSel().styles, bold: true, align: 'center' } }))
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Align center' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('font-size − posts the current size minus 2px', () => {
    const { post } = setup(makeSel())
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }))
    expect(lastPost(post)).toEqual({ type: 'deck_style', style: { fontSize: '18px' } })
  })

  it('font-size clamps at 8px', () => {
    const { post } = setup(makeSel({ styles: { ...makeSel().styles, fontSize: '9px' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }))
    expect(lastPost(post)).toEqual({ type: 'deck_style', style: { fontSize: '8px' } })
    fireEvent.click(screen.getByRole('button', { name: 'Increase font size' }))
    expect(lastPost(post)).toEqual({ type: 'deck_style', style: { fontSize: '11px' } })
  })

  it('block-type select posts formatBlock', () => {
    const { post } = setup(makeSel())
    fireEvent.change(screen.getByLabelText('Text style'), { target: { value: 'h2' } })
    expect(lastPost(post)).toEqual({ type: 'deck_exec', cmd: 'formatBlock', value: 'H2' })
  })

  it('align buttons post deck_style textAlign', () => {
    const { post } = setup(makeSel())
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }))
    expect(lastPost(post)).toEqual({ type: 'deck_style', style: { textAlign: 'right' } })
  })

  it('text color posts foreColor and highlight posts hiliteColor', () => {
    const { post } = setup(makeSel())
    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#ff0000' } })
    expect(lastPost(post)).toEqual({ type: 'deck_exec', cmd: 'foreColor', value: '#ff0000' })
    fireEvent.change(screen.getByLabelText('Highlight color'), { target: { value: '#00ff00' } })
    expect(lastPost(post)).toEqual({ type: 'deck_exec', cmd: 'hiliteColor', value: '#00ff00' })
  })

  it('link prompts for a URL and posts createLink; unlink posts unlink', () => {
    const { post } = setup(makeSel())
    const prompt = vi.fn(() => 'https://example.com')
    vi.stubGlobal('prompt', prompt)
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(prompt).toHaveBeenCalledOnce()
    expect(lastPost(post)).toEqual({
      type: 'deck_exec',
      cmd: 'createLink',
      value: 'https://example.com',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(lastPost(post)).toEqual({ type: 'deck_exec', cmd: 'unlink' })
    vi.unstubAllGlobals()
  })

  it('a dismissed link prompt posts nothing', () => {
    const { post } = setup(makeSel())
    vi.stubGlobal(
      'prompt',
      vi.fn(() => null),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(post).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('clear formatting posts removeFormat then unlink', () => {
    const { post } = setup(makeSel())
    fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }))
    expect(post.mock.calls.map(c => c[0].cmd)).toEqual(['removeFormat', 'unlink'])
  })

  it('shows bullet color only for list items and posts --primary', () => {
    const { post, session } = setup(makeSel())
    expect(screen.queryByLabelText('Bullet color')).toBeNull()
    session.setSel(makeSel({ styles: { ...makeSel().styles, blockTag: 'li' } }))
    fireEvent.change(screen.getByLabelText('Bullet color'), { target: { value: '#123456' } })
    expect(lastPost(post)).toEqual({ type: 'deck_style', style: { '--primary': '#123456' } })
  })

  it('shows border color only when the selection reports one', () => {
    const { post, session } = setup(makeSel())
    expect(screen.queryByLabelText('Border color')).toBeNull()
    session.setSel(makeSel({ styles: { ...makeSel().styles, borderColor: '#6366f1' } }))
    fireEvent.change(screen.getByLabelText('Border color'), { target: { value: '#abcdef' } })
    expect(lastPost(post)).toEqual({ type: 'deck_style', style: { borderColor: '#abcdef' } })
  })

  it('layer buttons post deck_layer for every kind', () => {
    const { post } = setup(makeSel({ kind: 'block' }))
    fireEvent.click(screen.getByRole('button', { name: 'Layer front' }))
    expect(lastPost(post)).toEqual({ type: 'deck_layer', mode: 'front' })
    fireEvent.click(screen.getByRole('button', { name: 'Layer inline' }))
    expect(lastPost(post)).toEqual({ type: 'deck_layer', mode: 'inline' })
  })

  it('delete posts deck_delete_el', () => {
    const { post } = setup(makeSel())
    fireEvent.click(screen.getByRole('button', { name: 'Delete element' }))
    expect(lastPost(post)).toEqual({ type: 'deck_delete_el' })
  })

  it('image selection shows Replace and posts deck_replace_image with a data URL', async () => {
    const { post } = setup(makeSel({ kind: 'image' }))
    const input = screen.getByLabelText('Choose replacement image') as HTMLInputElement
    const file = new File(['img'], 'cat.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() => {
      const last = lastPost(post)
      expect(last?.type).toBe('deck_replace_image')
    })
    expect(String(lastPost(post).src)).toMatch(/^data:/)
  })

  it('displays clean readable labels for layer controls', () => {
    setup(makeSel({ kind: 'block' }))
    const inlineBtn = screen.getByRole('button', { name: 'Layer inline' })
    const frontBtn = screen.getByRole('button', { name: 'Layer front' })
    const backBtn = screen.getByRole('button', { name: 'Layer back' })
    expect(inlineBtn.textContent).toBe('Inline')
    expect(frontBtn.textContent).toBe('Front')
    expect(backBtn.textContent).toBe('Back')
  })

  it('chart selection shows the Edit data toggle', () => {
    const { onToggleChart } = setup(makeSel({ kind: 'chart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit data' }))
    expect(onToggleChart).toHaveBeenCalledOnce()
  })
})
