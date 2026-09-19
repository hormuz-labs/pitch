import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { BlocksPanel, createChartBlockHTML } from '../src/solid/studio/deck/BlocksPanel'
import {
  createBlockHTML,
  createIconBlockHTML,
  createImageBlockHTML,
  createSlideHTML,
  createTableHTML,
  ICONS,
} from '../src/solid/studio/deck/blocks'
import { ChartPanel } from '../src/solid/studio/deck/ChartPanel'
import { createDeckSession, type DeckSession } from '../src/solid/studio/deck/deckSession'
import { SlidesBar } from '../src/solid/studio/deck/SlidesBar'
import type { ProjectStore } from '../src/solid/studio/useProject'

// createQrBlockHTML loads `qrcode` dynamically; happy-dom has no canvas (same
// mock as deck-blocks.test.tsx).
vi.mock('qrcode', () => ({
  toDataURL: vi.fn((text: string) => Promise.resolve(`data:image/png;base64,mock:${text}`)),
}))

function makeSession() {
  const post = vi.fn()
  const session: DeckSession = createDeckSession(post)
  return { post, session }
}
const lastPost = (post: ReturnType<typeof vi.fn>) => post.mock.calls.at(-1)?.[0]

const fakeStore = {
  project: null,
  thumbnailUrl: () => null,
} as unknown as ProjectStore

const SLIDES = [
  { index: 1, title: 'Intro', thumbSrcDoc: '<!DOCTYPE html><html><body>one</body></html>' },
  { index: 2, title: 'Body', thumbSrcDoc: '<!DOCTYPE html><html><body>two</body></html>' },
]

describe('BlocksPanel', () => {
  function setup() {
    const { post, session } = makeSession()
    const onClose = vi.fn()
    render(() => <BlocksPanel session={session} onClose={onClose} />)
    return { post, onClose }
  }

  it('search filters the block registry', () => {
    setup()
    fireEvent.input(screen.getByLabelText('Search blocks'), { target: { value: 'quote' } })
    expect(screen.getByRole('button', { name: 'Quote' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Heading 1' })).toBeNull()
    // The special pickers hide while searching
    expect(screen.queryByRole('grid', { name: 'Pick table size' })).toBeNull()
  })

  it('clicking a block posts deck_insert_html with createBlockHTML output', () => {
    const { post } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Quote' }))
    expect(lastPost(post)).toEqual({
      type: 'deck_insert_html',
      html: createBlockHTML('blockquote'),
    })
  })

  it('table grid posts createTableHTML for the hovered size', () => {
    const { post } = setup()
    const cell = screen.getByRole('gridcell', { name: 'Insert 2 by 3 table' })
    fireEvent.mouseEnter(cell)
    expect(screen.getByText('Table — 2 × 3')).toBeTruthy()
    fireEvent.click(cell)
    expect(lastPost(post)).toEqual({ type: 'deck_insert_html', html: createTableHTML(2, 3) })
  })

  it('chart picker posts a data-chart wrapper with canvas and init script', () => {
    const { post } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Bar chart' }))
    const html = lastPost(post).html as string
    expect(lastPost(post).type).toBe('deck_insert_html')
    expect(html).toContain('data-chart="1"')
    expect(html).toMatch(/<canvas id="chart_[a-z0-9]+"/)
    expect(html).toContain('window.Chart')
    expect(html).toContain('"type":"bar"')
  })

  it('createChartBlockHTML matches the old insertChart shape', () => {
    const html = createChartBlockHTML('pie')
    expect(html).toContain('data-pitch-block="1"')
    expect(html).toContain('width:600px;height:340px')
    expect(html).toContain('setTimeout(go,60)')
  })

  it('icon grid posts createIconBlockHTML', () => {
    const { post } = setup()
    fireEvent.click(screen.getByTitle(`Insert ${ICONS[0]} icon`))
    expect(lastPost(post)).toEqual({
      type: 'deck_insert_html',
      html: createIconBlockHTML(ICONS[0]),
    })
  })

  it('image URL posts createImageBlockHTML; unsafe URLs alert instead', () => {
    const { post } = setup()
    const input = screen.getByLabelText('Image URL')
    fireEvent.input(input, { target: { value: 'https://example.com/cat.png' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[0])
    expect(lastPost(post)).toEqual({
      type: 'deck_insert_html',
      html: createImageBlockHTML('https://example.com/cat.png'),
    })

    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    fireEvent.input(screen.getByLabelText('Image URL'), {
      target: { value: 'javascript:alert(1)' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[0])
    expect(alertMock).toHaveBeenCalledOnce()
    expect(post.mock.calls.filter(c => c[0].type === 'deck_insert_html')).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('QR insert posts an image block built from the entered text', async () => {
    const { post } = setup()
    fireEvent.input(screen.getByLabelText('QR code text'), {
      target: { value: 'https://trypitch.co' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[1])
    await vi.waitFor(() => expect(lastPost(post)?.type).toBe('deck_insert_html'))
    expect(lastPost(post).html).toContain('data:image/png;base64,mock:https://trypitch.co')
  })
})

describe('ChartPanel', () => {
  function setup(withChart = true) {
    const { post, session } = makeSession()
    if (withChart)
      session.setChart({
        labels: ['Q1', 'Q2'],
        data: [10, 20],
        backgroundColor: '#6366f1',
        borderColor: '#4f46e5',
      })
    render(() => <ChartPanel session={session} onClose={() => {}} />)
    return { post, session }
  }

  it('requests chart data on mount when empty', () => {
    const { post } = setup(false)
    expect(post).toHaveBeenCalledWith({ type: 'deck_chart_get' })
  })

  it('renders one row per datapoint from the deck_chart message', () => {
    setup()
    expect(screen.getByLabelText('Label 1')).toHaveProperty('value', 'Q1')
    expect(screen.getByLabelText('Value 2')).toHaveProperty('value', '20')
  })

  it('label edits post deck_chart_set with the patched labels', () => {
    const { post } = setup()
    fireEvent.input(screen.getByLabelText('Label 1'), { target: { value: 'Jan' } })
    expect(lastPost(post)).toEqual({ type: 'deck_chart_set', patch: { labels: ['Jan', 'Q2'] } })
  })

  it('value edits post deck_chart_set with the patched data', () => {
    const { post } = setup()
    fireEvent.input(screen.getByLabelText('Value 2'), { target: { value: '42' } })
    expect(lastPost(post)).toEqual({ type: 'deck_chart_set', patch: { data: [10, 42] } })
  })

  it('color edits post backgroundColor / borderColor patches', () => {
    const { post } = setup()
    fireEvent.change(screen.getByLabelText('Chart fill color'), { target: { value: '#111111' } })
    expect(lastPost(post)).toEqual({
      type: 'deck_chart_set',
      patch: { backgroundColor: '#111111' },
    })
    fireEvent.change(screen.getByLabelText('Chart border color'), { target: { value: '#222222' } })
    expect(lastPost(post)).toEqual({ type: 'deck_chart_set', patch: { borderColor: '#222222' } })
  })
})

describe('SlidesBar', () => {
  function setup(slides = SLIDES) {
    const { post, session } = makeSession()
    session.setSlides(slides)
    render(() => <SlidesBar session={session} store={fakeStore} />)
    return { post, session }
  }

  it('renders one card per bridge slide with a srcdoc thumbnail', () => {
    setup()
    expect(screen.getByTitle('Intro').tagName).toBe('IFRAME')
    expect(screen.getByText('Body')).toBeTruthy()
  })

  it('thumb iframes carry the srcdoc and the 1280→thumb scale sizing', () => {
    setup()
    const frame = screen.getByTitle('Intro') as HTMLIFrameElement
    // The srcdoc is the slide document, not a URL
    expect(frame.getAttribute('srcdoc')).toContain('<body>one</body>')
    expect(frame.getAttribute('sandbox')).toBe('')
    // Fixed slide-size document, scaled down by transform — the iframe element
    // itself must stay 1280px wide (a shrinking element breaks the transform
    // math and leaves a sliver; .deck-slide-thumb-frame carries flex:none)
    expect(frame.style.width).toBe('1280px')
    expect(frame.style.height).toBe('720px')
    expect(frame.style.transform).toBe(`scale(${138 / 1280})`)
    expect(frame.style.transformOrigin).toBe('0 0')
    expect(frame.className).toContain('deck-slide-thumb-frame')
  })

  it('falls back to description slides before the first deck_slides message', () => {
    const { session } = makeSession()
    const store = {
      project: { description: { slides: [{ index: 1, title: 'From server' }] } },
      thumbnailUrl: () => null,
    } as unknown as ProjectStore
    render(() => <SlidesBar session={session} store={store} />)
    expect(screen.getByText('From server')).toBeTruthy()
  })

  it('clicking a card posts deck_scroll_to (1-based)', () => {
    const { post } = setup()
    fireEvent.click(screen.getByText('Body'))
    expect(lastPost(post)).toEqual({ type: 'deck_scroll_to', index: 2 })
  })

  it('highlights the active slide from the bridge', () => {
    const { session } = setup()
    session.setActiveSlide(2)
    expect(screen.getByText('Body').closest('.deck-slide-card')?.className).toContain('selected')
  })

  it('drag and drop posts a reorder op', () => {
    const { post } = setup()
    const first = screen.getByText('Intro').closest('.deck-slide-card')!
    const second = screen.getByText('Body').closest('.deck-slide-card')!
    fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn() } })
    fireEvent.dragOver(second)
    fireEvent.drop(second)
    expect(lastPost(post)).toEqual({ type: 'deck_slide_op', op: 'reorder', from: 1, to: 2 })
  })

  it('background dots and the custom color input post background ops', () => {
    const { post } = setup()
    fireEvent.click(screen.getByLabelText('Set slide 2 background #0f172a'))
    expect(lastPost(post)).toEqual({
      type: 'deck_slide_op',
      op: 'background',
      index: 2,
      color: '#0f172a',
    })
    fireEvent.change(screen.getByLabelText('Custom background for slide 1'), {
      target: { value: '#123456' },
    })
    expect(lastPost(post)).toEqual({
      type: 'deck_slide_op',
      op: 'background',
      index: 1,
      color: '#123456',
    })
  })

  it('delete posts a delete op and is disabled with a single slide', () => {
    const { post, session } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete slide 2' }))
    expect(lastPost(post)).toEqual({ type: 'deck_slide_op', op: 'delete', index: 2 })

    session.setSlides([SLIDES[0]])
    const only = screen.getByRole('button', { name: 'Delete slide 1' })
    expect(only).toHaveProperty('disabled', true)
  })

  it('add posts deck_insert_slide with the template html after the active slide', () => {
    const { post, session } = setup()
    session.setActiveSlide(2)
    fireEvent.click(screen.getByRole('button', { name: 'Add slide' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Two columns' }))
    expect(lastPost(post)).toEqual({
      type: 'deck_insert_slide',
      html: createSlideHTML('two-column'),
      after: 2,
    })
  })
})
