import { batch, createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js'
import type { PlayerCtrl } from '../types'
import type { ProjectStore } from '../useProject'
import { InspectButton, PlaybackControls, PreviewUpdate } from './PlaybackControls'
import { useFullscreen } from './useFullscreen'

type Frame = { ready: boolean; t: number; duration: number; paused: boolean }
const EMPTY: Frame = { ready: false, t: 0, duration: 0, paused: true }

export function HtmlPreview(props: { store: ProjectStore; src: string }) {
  const s = props.store
  let container!: HTMLDivElement
  let viewport!: HTMLDivElement
  let frame!: HTMLIFrameElement
  let audio: HTMLAudioElement | undefined
  let state = { ...EMPTY }
  let loaded = false
  let startingAudio = false
  let lastPaint = 0
  const [ready, setReady] = createSignal(false)
  const [playing, setPlaying] = createSignal(false)
  const [duration, setDuration] = createSignal(0)
  const [time, setTime] = createSignal(0)
  const [scale, setScale] = createSignal(0)
  const [muted, setMuted] = createSignal(false)
  const fullscreen = useFullscreen(() => container)
  const audioSrc = () => s.previewUrl(s.project?.description.audioUrl)
  const post = (message: unknown) => frame?.contentWindow?.postMessage(message, '*')
  const command = (op: string, t?: number) => post({ type: 'studio_cmd', op, t })
  const syncAudio = (t: number, play: boolean) => {
    if (!audio || !audioSrc()) return
    if (Math.abs(audio.currentTime - t) > 0.25) audio.currentTime = t
    if (!play) {
      if (!audio.paused) audio.pause()
      return
    }
    if (audio.paused && !startingAudio) {
      startingAudio = true
      void audio
        .play()
        .catch(() => {})
        .finally(() => {
          startingAudio = false
        })
    }
  }
  const pause = () => {
    command('pause')
    syncAudio(state.t, false)
    state.paused = true
    setPlaying(false)
    s.notePlayerState(false)
  }
  const seek = (t: number, play: boolean) => {
    if (!state.ready) return
    const next = Math.min(Math.max(0, t), Math.max(0, state.duration - 0.001))
    // A seek alone does not pause the engine's GSAP timeline.
    command(play ? 'play' : 'pause', next)
    state.t = next
    state.paused = !play
    batch(() => {
      setTime(next)
      setPlaying(play)
      s.setPlayhead(next)
      s.notePlayerState(play)
    })
    syncAudio(next, play)
  }
  const toggle = () => {
    if (!state.ready) return
    if (state.paused) seek(state.t >= state.duration - 0.01 ? 0 : state.t, true)
    else pause()
  }
  const inspect = () => {
    const enabled = !s.inspectMode
    if (enabled) pause()
    s.setInspectMode(enabled)
  }
  createEffect(
    on(
      () => props.src,
      () => {
        loaded = false
        state = { ...EMPTY }
        setReady(false)
        audio?.pause()
      },
    ),
  )
  createEffect(() => {
    if (ready()) post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale: scale() })
  })
  createEffect(() => {
    if (ready())
      post({
        type: 'studio_set_marks',
        marks: s.targets.map(target => target.mark).filter(mark => mark != null),
      })
  })
  const control: PlayerCtrl = { seek: t => seek(t, true), pause }
  onMount(() => {
    s.player.current = control
    const resize = () => {
      // Measure a viewport owned by layout, never a child sized by this scale.
      const { width, height } = viewport.getBoundingClientRect()
      if (width > 0 && height > 0) setScale(Math.min(width / 1920, height / 1080))
    }
    const observer = new ResizeObserver(resize)
    observer.observe(viewport)
    resize()
    const message = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return
      const data = event.data
      if (data?.type === 'studio_element_selected' && data.element) s.addTarget(data.element)
      if (data?.type !== 'studio_state' || !loaded) return
      const previous = state
      const total = Math.max(0, Number(data.duration) || 0)
      const t = Math.max(0, Number(data.t) || 0)
      state = {
        ready: !!data.ready,
        t,
        duration: total,
        paused: data.paused !== false || (total > 0 && t >= total - 0.001),
      }
      if (!previous.ready && state.ready) {
        setReady(true)
        setDuration(total)
        const jump = s.consumeAutoSeek()
        seek(jump?.t ?? 0, jump?.play ?? false)
        return
      }
      const changed = previous.paused !== state.paused
      // The engine can send every animation frame. Paint the surrounding UI
      // at 10Hz, and immediately for transport actions; audio still stays synced.
      if (changed || state.paused || performance.now() - lastPaint >= 100) {
        lastPaint = performance.now()
        batch(() => {
          setTime(state.t)
          s.setPlayhead(state.t)
          setPlaying(!state.paused)
          if (changed) s.notePlayerState(!state.paused)
        })
      }
      syncAudio(state.t, !state.paused)
    }
    const key = (event: KeyboardEvent) => {
      if (
        container.closest('[hidden]') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target as HTMLElement)?.closest?.(
          'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]',
        )
      )
        return
      if (event.code === 'Space' && (event.target as HTMLElement)?.closest?.('button,a')) return
      if (event.code === 'Space' || event.key.toLowerCase() === 'k') {
        event.preventDefault()
        toggle()
      } else if (event.key.toLowerCase() === 'i') {
        event.preventDefault()
        inspect()
      } else if (event.key === 'Escape' && s.inspectMode) s.setInspectMode(false)
      else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void fullscreen.toggle()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        seek(state.t + (event.key === 'ArrowRight' ? 5 : -5), !state.paused)
      }
    }
    window.addEventListener('message', message)
    window.addEventListener('keydown', key)
    onCleanup(() => {
      if (s.player.current === control) {
        s.player.current = null
        s.notePlayerState(false)
      }
      audio?.pause()
      observer.disconnect()
      window.removeEventListener('message', message)
      window.removeEventListener('keydown', key)
    })
  })
  return (
    <div
      ref={container}
      class={`live-preview${fullscreen.active() ? ' is-fullscreen' : ''}${s.inspectMode ? ' inspect-active' : ''}`}
    >
      <div ref={viewport} class="live-preview-stage">
        <div
          class="live-preview-viewport"
          style={{ width: `${1920 * scale()}px`, height: `${1080 * scale()}px` }}
          onClick={() => !s.inspectMode && toggle()}
        >
          <iframe
            ref={frame}
            src={props.src}
            title="Live preview"
            allow="autoplay; fullscreen"
            style={{ transform: `scale(${scale()})` }}
            onLoad={() => {
              loaded = true
              state = { ...EMPTY }
              setReady(false)
              command('state')
            }}
          />
        </div>
        <Show when={audioSrc()}>
          {src => (
            <audio
              ref={audio}
              src={src()}
              preload="auto"
              muted={muted()}
              onLoadedMetadata={() => syncAudio(state.t, !state.paused)}
            />
          )}
        </Show>
        <Show when={!ready()}>
          <div class="preview-loading">
            <span class="spinner" />
            Loading preview…
          </div>
        </Show>
        <Show when={s.previewNote}>
          <div class="media-preview-note" role="status">
            {s.previewNote}
          </div>
        </Show>
      </div>
      <PlaybackControls
        ready={ready()}
        playing={playing()}
        muted={muted()}
        audio={!!audioSrc()}
        time={time()}
        duration={duration()}
        fullscreen={fullscreen.active()}
        onPlay={toggle}
        onMute={() => setMuted(value => !value)}
        onSeek={t => seek(t, playing())}
        onFullscreen={() => void fullscreen.toggle()}
      >
        <PreviewUpdate store={s} />
        <InspectButton active={s.inspectMode} onClick={inspect} />
      </PlaybackControls>
    </div>
  )
}
