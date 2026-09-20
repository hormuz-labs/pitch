import { fireEvent, render } from '@solidjs/testing-library'
import { createSignal, Show } from 'solid-js'
import { describe, expect, it } from 'vitest'

function StageShot(props: { src: string }) {
  const [loaded, setLoaded] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  return (
    <Show when={!failed() && !!props.src}>
      <img
        src={props.src}
        alt=""
        style={{ display: loaded() ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </Show>
  )
}

function ShotThumb(props: {
  thumbUrl?: string | null
  url: string
  mtime: string
  store: { mediaUrl: (path: string | null | undefined, v?: number) => string | null }
}) {
  const [useDirect, setUseDirect] = createSignal(false)
  const [loaded, setLoaded] = createSignal(false)
  const [failed, setFailed] = createSignal(false)

  const src = () => {
    const path = !useDirect() && props.thumbUrl ? props.thumbUrl : props.url
    return props.store.mediaUrl(path, Date.parse(props.mtime)) ?? ''
  }

  const handleError = () => {
    if (!useDirect() && props.thumbUrl) {
      setUseDirect(true)
    } else {
      setFailed(true)
    }
  }

  return (
    <Show when={!failed() && !!src()}>
      <img
        src={src()}
        alt=""
        style={{ display: loaded() ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </Show>
  )
}

describe('Build process frame display', () => {
  it('hides unrendered frame until onLoad fires and displays on load', () => {
    const { container } = render(() => <StageShot src="/files/frame.png" />)
    const img = container.querySelector('img')!
    expect(img).toBeTruthy()
    expect(img.style.display).toBe('none')

    fireEvent.load(img)
    expect(img.style.display).toBe('block')
  })

  it('removes broken frame completely from DOM on onError', () => {
    const { container } = render(() => <StageShot src="/files/broken.png" />)
    const img = container.querySelector('img')!
    expect(img).toBeTruthy()

    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
  })

  it('falls back to direct url when thumbUrl fails, and removes if direct url also fails', () => {
    const store = {
      mediaUrl: (path: string | null | undefined) => path ?? null,
    }
    const { container } = render(() => (
      <ShotThumb
        thumbUrl="/thumb/frame.png"
        url="/direct/frame.png"
        mtime="2026-09-20T00:00:00.000Z"
        store={store}
      />
    ))
    let img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/thumb/frame.png')
    expect(img.style.display).toBe('none')

    // First failure: falls back to direct URL
    fireEvent.error(img)
    img = container.querySelector('img')!
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('/direct/frame.png')

    // Second failure: direct URL also failed -> removed from DOM
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
  })
})
