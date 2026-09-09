import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { fmt } from '../helpers'
import type { ProjectStore } from '../useProject'

type Frame = { ready: boolean; t: number; duration: number; paused: boolean }
export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
)
export function SelectToggle(props: { active: boolean; onClick: () => void }) {
  return (
    <button class={`select-toggle${props.active ? ' on' : ''}`} onClick={props.onClick}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M3.5 3.5v17l4.5-4.5 3 6.5 3-1.5-3-6.5h6z" />
      </svg>
      {props.active ? 'Selecting — esc to stop' : 'Select'}
    </button>
  )
}
export function InspectButton(props: { active: boolean; onClick: () => void }) {
  return (
    <button
      class={`preview-btn preview-inspect-btn ${props.active ? 'active' : ''}`}
      onClick={props.onClick}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M3.5 3.5v17l4.5-4.5 3 6.5 3-1.5-3-6.5h6z" />
      </svg>
    </button>
  )
}
export function HtmlPreview(props: { store: ProjectStore; src: string }) {
  const s = props.store
  let container: HTMLDivElement | undefined,
    frame: HTMLIFrameElement | undefined,
    audio: HTMLAudioElement | undefined
  let state: Frame = { ready: false, t: 0, duration: 0, paused: true },
    hide = 0
  const [ready, setReady] = createSignal(false),
    [playing, setPlaying] = createSignal(false),
    [duration, setDuration] = createSignal(0),
    [time, setTime] = createSignal(0),
    [scale, setScale] = createSignal(0.5),
    [fullscreen, setFullscreen] = createSignal(false),
    [controls, setControls] = createSignal(true),
    [muted, setMuted] = createSignal(false)
  const audioSrc = () => s.mediaUrl(s.project?.description.audioUrl, s.videoVersion),
    post = (m: unknown) => frame?.contentWindow?.postMessage(m, '*'),
    cmd = (op: string, t?: number) => post({ type: 'studio_cmd', op, t }),
    resize = () => {
      const r =
        document.fullscreenElement === container
          ? { width: innerWidth, height: innerHeight }
          : container?.parentElement?.getBoundingClientRect()
      if (r && r.width > 0 && r.height > 0) setScale(Math.min(r.width / 1920, r.height / 1080))
    },
    sync = (t: number, play: boolean) => {
      if (!audio || !audioSrc()) return
      if (Math.abs(audio.currentTime - t) > 0.15) audio.currentTime = t
      if (play) void audio.play().catch(() => {})
      else audio.pause()
    },
    seek = (t: number, play: boolean) => {
      const v = Math.min(Math.max(0, t), Math.max(0, state.duration - 0.001))
      cmd(play ? 'play' : 'seek', v)
      sync(v, play)
      s.setPlayhead(v)
      setTime(v)
    },
    toggle = () => {
      if (!state.ready) return
      if (state.paused) seek(state.t >= state.duration - 0.01 ? 0 : state.t, true)
      else {
        cmd('pause')
        sync(state.t, false)
      }
    },
    inspect = () => {
      s.setInspectMode(!s.inspectMode)
      post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale: scale() })
    }
  createEffect(() => {
    if (ready()) post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale: scale() })
  })
  createEffect(() => {
    if (ready())
      post({ type: 'studio_set_marks', marks: s.targets.map(t => t.mark).filter(x => x != null) })
  })
  onMount(() => {
    s.player.current = { seek: t => seek(t, true) }
    resize()
    const ro = new ResizeObserver(resize)
    if (container?.parentElement) ro.observe(container.parentElement)
    const message = (e: MessageEvent) => {
      if (e.source !== frame?.contentWindow) return
      const d = e.data
      if (d?.type === 'studio_element_selected' && d.element) s.addTarget(d.element)
      if (d?.type === 'studio_state') {
        const prev = state
        state = {
          ready: !!d.ready,
          t: +d.t || 0,
          duration: +d.duration || 0,
          paused: d.paused !== false,
        }
        if (!prev.ready && state.ready) {
          setReady(true)
          setDuration(state.duration)
          cmd('pause', 0)
          const jump = s.consumeAutoSeek()
          if (jump) seek(jump.t, jump.play)
        }
        setTime(state.t)
        s.setPlayhead(state.t)
        if (prev.paused !== state.paused) {
          setPlaying(!state.paused)
          s.notePlayerState(!state.paused)
        }
        sync(state.t, !state.paused)
      }
    }
    const key = (e: KeyboardEvent) => {
      if (/input|textarea/i.test(document.activeElement?.tagName ?? '')) return
      if (e.code === 'Space' || /^k$/i.test(e.key)) {
        e.preventDefault()
        toggle()
      } else if (/^i$/i.test(e.key)) {
        e.preventDefault()
        inspect()
      } else if (e.key === 'Escape' && s.inspectMode) {
        s.setInspectMode(false)
      } else if (/^f$/i.test(e.key)) {
        if (!document.fullscreenElement) void container?.requestFullscreen()
        else void document.exitFullscreen()
      } else if (e.key === 'ArrowRight') seek(state.t + 0.5, !state.paused)
      else if (e.key === 'ArrowLeft') seek(state.t - 0.5, !state.paused)
    }
    const fs = () => {
      setFullscreen(!!document.fullscreenElement)
      setTimeout(resize, 50)
    }
    addEventListener('message', message)
    addEventListener('keydown', key)
    document.addEventListener('fullscreenchange', fs)
    onCleanup(() => {
      s.player.current = null
      ro.disconnect()
      removeEventListener('message', message)
      removeEventListener('keydown', key)
      document.removeEventListener('fullscreenchange', fs)
      clearTimeout(hide)
    })
  })
  return (
    <div
      ref={container}
      class={`live-preview${fullscreen() ? ' fullscreen' : ''}${s.inspectMode ? ' inspect-active' : ''}${controls() || !playing() ? ' show-controls' : ''}`}
      style={
        fullscreen() ? undefined : { width: `${1920 * scale()}px`, height: `${1080 * scale()}px` }
      }
      onMouseMove={() => {
        setControls(true)
        clearTimeout(hide)
        if (playing()) hide = window.setTimeout(() => setControls(false), 2500)
      }}
    >
      <div
        class="live-preview-viewport"
        style={{ width: `${1920 * scale()}px`, height: `${1080 * scale()}px` }}
        onClick={() => !s.inspectMode && toggle()}
      >
        <iframe
          ref={frame}
          src={props.src}
          title="Live preview"
          style={{ transform: `scale(${scale()})`, 'transform-origin': '0 0' }}
          onLoad={() => {
            setReady(false)
            state = { ready: false, t: 0, duration: 0, paused: true }
            setTimeout(() => cmd('state'), 100)
          }}
        />
        <Show when={audioSrc()}>
          {s => <audio ref={audio} src={s()} preload="auto" muted={muted()} />}
        </Show>
      </div>
      <SelectToggle active={s.inspectMode} onClick={inspect} />
      <Show when={!ready()}>
        <div class="preview-loading">
          <span class="spinner" /> Loading preview…
        </div>
      </Show>
      <Show when={s.busy}>
        <div class="preview-updating">
          <span class="spinner" /> {s.status}
        </div>
      </Show>
      <div class="preview-controls">
        <div class="preview-progress-wrap">
          <input
            type="range"
            class="preview-scrub"
            min={0}
            max={duration() || 1}
            step={0.05}
            value={time()}
            disabled={!ready()}
            onInput={e => seek(+e.currentTarget.value, false)}
          />
          <div
            class="preview-progress-fill"
            style={{ width: `${(time() / (duration() || 1)) * 100}%` }}
          />
        </div>
        <div class="preview-controls-row">
          <button class="preview-btn preview-play" onClick={toggle}>
            {playing() ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button class="preview-btn" onClick={() => setMuted(v => !v)}>
            {muted() ? 'Muted' : 'Sound'}
          </button>
          <span class="preview-time">
            {fmt(time())} / {fmt(duration())}
          </span>
          <div class="preview-spacer" />
          <InspectButton active={s.inspectMode} onClick={inspect} />
        </div>
      </div>
    </div>
  )
}
