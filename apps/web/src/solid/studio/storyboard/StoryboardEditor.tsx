import {
  Check,
  CircleDot,
  MessageSquareText,
  MousePointer2,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { studio } from '../client'
import type {
  StoryboardAnnotationStyle,
  StoryboardEmphasis,
  StoryboardRect,
  VideoStoryboard,
} from '../types'
import type { ProjectStore } from '../useProject'
import {
  rebaseStoryboard,
  rectFromDrag,
  type StoryboardRectTransformMode,
  storyboardDurationSec,
  transformStoryboardRect,
  updateStoryboardScene,
} from './editorModel'

const EFFECTS: Array<{ value: StoryboardAnnotationStyle; label: string }> = [
  { value: 'box', label: 'Box' },
  { value: 'circle', label: 'Circle' },
  { value: 'underline', label: 'Underline' },
  { value: 'highlighter', label: 'Highlighter' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'bracket', label: 'Bracket' },
]

const clone = (storyboard: VideoStoryboard): VideoStoryboard =>
  JSON.parse(JSON.stringify(storyboard)) as VideoStoryboard

const invalidEmphasis = (storyboard: VideoStoryboard) =>
  storyboard.scenes.some(
    scene =>
      scene.enabled &&
      (!scene.narration.trim() ||
        scene.emphasis.some(
          emphasis =>
            !emphasis.phrase.trim() ||
            !scene.narration
              .toLocaleLowerCase()
              .includes(emphasis.phrase.trim().toLocaleLowerCase()),
        )),
  )

export function StoryboardEditor(props: { store: ProjectStore }) {
  const source = () => props.store.project?.description.extra?.storyboard
  const initial = source()
  let synced = initial ? clone(initial) : null
  const [draft, setDraft] = createSignal<VideoStoryboard | null>(initial ? clone(initial) : null)
  const [selectedId, setSelectedId] = createSignal(initial?.scenes[0]?.id ?? '')
  const [selectedEmphasis, setSelectedEmphasis] = createSignal<number | null>(null)
  const [drawMode, setDrawMode] = createSignal(false)
  const [drawing, setDrawing] = createSignal<{
    start: { x: number; y: number }
    rect: StoryboardRect | null
  } | null>(null)
  const [boxInteraction, setBoxInteraction] = createSignal<{
    index: number
    mode: StoryboardRectTransformMode
    start: { x: number; y: number }
    rect: StoryboardRect
  } | null>(null)
  const [previewing, setPreviewing] = createSignal<number | null>(null)
  const [saveState, setSaveState] = createSignal<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [saveMessage, setSaveMessage] = createSignal('Saved')
  let preview: HTMLDivElement | undefined
  let saveTimer = 0
  let saveInFlight: Promise<VideoStoryboard | null> | null = null
  let editVersion = 0
  let previewTimer = 0

  const selected = createMemo(() => {
    const current = draft()
    return current?.scenes.find(scene => scene.id === selectedId()) ?? current?.scenes[0] ?? null
  })
  const duration = createMemo(() => (draft() ? storyboardDurationSec(draft()!) : 0))
  const hasProblems = createMemo(() => (draft() ? invalidEmphasis(draft()!) : true))

  createEffect(() => {
    const incoming = source()
    const current = draft()
    if (!incoming || saveState() === 'dirty' || saveState() === 'saving') return
    if (!current || incoming.revision > current.revision) {
      synced = clone(incoming)
      setDraft(clone(incoming))
      if (!incoming.scenes.some(scene => scene.id === selectedId())) {
        setSelectedId(incoming.scenes[0]?.id ?? '')
      }
    }
  })

  onCleanup(() => {
    window.clearTimeout(saveTimer)
    window.clearTimeout(previewTimer)
  })

  const scheduleSave = () => {
    editVersion += 1
    setSaveState('dirty')
    setSaveMessage('Unsaved changes')
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void save(), 900)
  }

  const edit = (change: (current: VideoStoryboard) => VideoStoryboard) => {
    setDraft(current => (current ? change(current) : current))
    scheduleSave()
  }

  const editScene = (change: Parameters<typeof updateStoryboardScene>[2]) => {
    const scene = selected()
    if (!scene) return
    edit(current => updateStoryboardScene(current, scene.id, change))
  }

  const save = async (): Promise<VideoStoryboard | null> => {
    window.clearTimeout(saveTimer)
    if (saveState() === 'saved') return draft()
    if (saveInFlight) {
      await saveInFlight
      if (saveState() === 'dirty') return save()
      return draft()
    }
    const current = draft()
    if (!current || hasProblems()) {
      setSaveState('error')
      setSaveMessage('Fix narration triggers before saving')
      return null
    }
    const version = editVersion
    setSaveState('saving')
    setSaveMessage('Saving revision…')
    saveInFlight = (async () => {
      try {
        const saved = await studio.saveStoryboard(
          await props.store.getToken(),
          props.store.id!,
          current,
        )
        setDraft(latest => {
          if (!latest) return clone(saved)
          return version === editVersion ? clone(saved) : { ...latest, revision: saved.revision }
        })
        synced = clone(saved)
        if (version === editVersion) {
          setSaveState('saved')
          setSaveMessage(`Revision ${saved.revision} saved`)
        } else {
          setSaveState('dirty')
          setSaveMessage('Saving latest changes…')
          window.clearTimeout(saveTimer)
          saveTimer = window.setTimeout(() => void save(), 100)
        }
        return saved
      } catch (error: unknown) {
        if ((error as { status?: number })?.status === 409 && synced) {
          try {
            const latest = await studio.get(await props.store.getToken(), props.store.id!)
            const remote = latest.description.extra?.storyboard
            if (remote) {
              const rebased = rebaseStoryboard(synced, current, remote)
              synced = clone(remote)
              setDraft(rebased)
              setSaveState('dirty')
              setSaveMessage(`Merged with revision ${remote.revision} · review and save again`)
              return null
            }
          } catch {
            // Keep the original conflict below when the latest revision cannot load.
          }
        }
        setSaveState('error')
        setSaveMessage(error instanceof Error ? error.message : 'Could not save storyboard')
        return null
      } finally {
        saveInFlight = null
      }
    })()
    return saveInFlight
  }

  const targetScene = (prompt?: string) => {
    const scene = selected()
    if (!scene) return
    if (prompt) props.store.setDraft(prompt)
    props.store.addTarget({
      sceneId: scene.id,
      page: scene.pageIndex + 1,
      tagName: 'storyboard-scene',
      className: 'storyboard-scene',
      id: scene.id,
      selector: `storyboard.scene[${JSON.stringify(scene.id)}]`,
      text: `${scene.title}: ${scene.narration}`,
    })
  }

  const recordWithAgent = async () => {
    const saved = await save()
    if (!saved) return
    await props.store.send(
      `Use the saved asset storyboard revision ${saved.revision} as the exact contract. Record, render, and publish the finished asset demo now.`,
    )
  }

  const bounds = () => preview?.getBoundingClientRect() ?? null
  const beginBox = (event: PointerEvent, index: number, mode: StoryboardRectTransformMode) => {
    const emphasis = selected()?.emphasis[index]
    if (!emphasis || drawMode()) return
    event.preventDefault()
    event.stopPropagation()
    preview?.setPointerCapture(event.pointerId)
    setSelectedEmphasis(index)
    setBoxInteraction({
      index,
      mode,
      start: { x: event.clientX, y: event.clientY },
      rect: emphasis.rect,
    })
  }

  const pointerDown = (event: PointerEvent) => {
    if (!drawMode()) return
    event.currentTarget instanceof HTMLElement &&
      event.currentTarget.setPointerCapture(event.pointerId)
    setDrawing({ start: { x: event.clientX, y: event.clientY }, rect: null })
  }

  const pointerMove = (event: PointerEvent) => {
    const area = bounds()
    if (!area) return
    const interaction = boxInteraction()
    if (interaction) {
      const rect = transformStoryboardRect(
        interaction.rect,
        interaction.mode,
        interaction.start,
        { x: event.clientX, y: event.clientY },
        area,
      )
      const scene = selected()
      if (scene) {
        setDraft(current =>
          current
            ? updateStoryboardScene(current, scene.id, {
                emphasis: scene.emphasis.map((item, index) =>
                  index === interaction.index ? { ...item, rect } : item,
                ),
              })
            : current,
        )
      }
      return
    }
    const active = drawing()
    if (!active) return
    setDrawing({
      ...active,
      rect: rectFromDrag(active.start, { x: event.clientX, y: event.clientY }, area),
    })
  }

  const pointerUp = (event: PointerEvent) => {
    if (boxInteraction()) {
      setBoxInteraction(null)
      scheduleSave()
      return
    }
    const active = drawing()
    const scene = selected()
    const area = bounds()
    setDrawing(null)
    if (!active || !scene || !area) return
    const rect = rectFromDrag(active.start, { x: event.clientX, y: event.clientY }, area)
    if (!rect) return
    const phrase = scene.narration.trim().split(/\s+/).slice(0, 6).join(' ')
    editScene({
      emphasis: [
        ...scene.emphasis,
        { phrase, rect, coordinateSpace: 'page', style: 'box', zoom: 1.7 },
      ],
    })
    setSelectedEmphasis(scene.emphasis.length)
    setDrawMode(false)
  }

  const editEmphasis = (index: number, change: Partial<StoryboardEmphasis>) => {
    const scene = selected()
    if (!scene) return
    editScene({
      emphasis: scene.emphasis.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...change } : item,
      ),
    })
  }

  const previewEffect = (index: number) => {
    window.clearTimeout(previewTimer)
    setPreviewing(index)
    previewTimer = window.setTimeout(() => setPreviewing(null), 1500)
  }

  return (
    <Show when={draft() && selected()}>
      <div class="storyboard-editor">
        <header class="storyboard-editor__header">
          <div>
            <div class="storyboard-editor__eyebrow">
              <Sparkles size={13} /> Video storyboard
            </div>
            <div class="storyboard-editor__title-row">
              <h2>Shape the story, then hand it back to the agent.</h2>
              <span class={`storyboard-save-state is-${saveState()}`}>
                {saveState() === 'saving' ? <span class="spinner" /> : <Check size={12} />}
                {saveMessage()}
              </span>
            </div>
            <p>
              {draft()!.scenes.filter(scene => scene.enabled).length} scenes · about{' '}
              {Math.ceil(duration())} seconds · revision {draft()!.revision}
            </p>
          </div>
          <div class="storyboard-editor__actions">
            <button
              class="storyboard-btn"
              disabled={saveState() === 'saving'}
              onClick={() => void save()}
            >
              <Save size={14} /> Save now
            </button>
            <button
              class="storyboard-btn storyboard-btn--primary"
              disabled={hasProblems() || saveState() === 'saving' || props.store.busy}
              onClick={() => void recordWithAgent()}
            >
              <Play size={14} /> Record with agent
            </button>
          </div>
        </header>

        <div class="storyboard-editor__workspace">
          <aside class="storyboard-scenes" aria-label="Storyboard scenes">
            <div class="storyboard-panel-title">Scenes</div>
            <div class="storyboard-scenes__list">
              <For each={draft()!.scenes}>
                {(scene, index) => (
                  <button
                    class="storyboard-scene-card"
                    classList={{
                      'is-active': scene.id === selected()!.id,
                      'is-disabled': !scene.enabled,
                    }}
                    onClick={() => {
                      setSelectedId(scene.id)
                      setSelectedEmphasis(null)
                      setDrawMode(false)
                    }}
                  >
                    <img src={scene.previewUrl} alt="" />
                    <span>
                      <small>
                        {String(index() + 1).padStart(2, '0')} · page {scene.pageIndex + 1}
                      </small>
                      <strong>{scene.title}</strong>
                      <em>{Math.ceil(scene.estimatedDurationSec)}s</em>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </aside>

          <main class="storyboard-canvas-panel">
            <div class="storyboard-canvas-toolbar">
              <div>
                <span>Page {selected()!.pageIndex + 1}</span>
                <strong>{selected()!.title}</strong>
              </div>
              <div>
                <button
                  class="storyboard-icon-btn"
                  classList={{ 'is-active': drawMode() }}
                  title="Draw a timed highlight"
                  onClick={() => {
                    setDrawMode(value => !value)
                    setSelectedEmphasis(null)
                  }}
                >
                  <Plus size={15} /> Highlight
                </button>
                <button
                  class="storyboard-icon-btn"
                  title="Attach this scene to a chat message"
                  onClick={() => targetScene('Change this storyboard scene: ')}
                >
                  <MessageSquareText size={15} /> Ask agent
                </button>
              </div>
            </div>
            <div class="storyboard-canvas-shell">
              <div
                ref={preview}
                class="storyboard-canvas"
                classList={{ 'is-drawing': drawMode() }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  setDrawing(null)
                  setBoxInteraction(null)
                }}
              >
                <img src={selected()!.previewUrl} alt={selected()!.title} draggable={false} />
                <For each={selected()!.emphasis}>
                  {(emphasis, index) => (
                    <div
                      class="storyboard-grounding"
                      classList={{
                        'is-active': selectedEmphasis() === index(),
                        'is-previewing': previewing() === index(),
                        [`effect-${emphasis.style}`]: true,
                      }}
                      style={{
                        left: `${emphasis.rect.leftPct}%`,
                        top: `${emphasis.rect.topPct}%`,
                        width: `${emphasis.rect.widthPct}%`,
                        height: `${emphasis.rect.heightPct}%`,
                      }}
                      onPointerDown={event => beginBox(event, index(), 'move')}
                      onClick={event => {
                        event.stopPropagation()
                        setSelectedEmphasis(index())
                      }}
                    >
                      <span>{index() + 1}</span>
                      <Show when={selectedEmphasis() === index()}>
                        <For
                          each={
                            [
                              ['northWest', 'nw'],
                              ['northEast', 'ne'],
                              ['southWest', 'sw'],
                              ['southEast', 'se'],
                            ] as const
                          }
                        >
                          {([mode, position]) => (
                            <button
                              aria-label={`Resize from ${position}`}
                              class={`storyboard-resize is-${position}`}
                              onPointerDown={event => beginBox(event, index(), mode)}
                            />
                          )}
                        </For>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={drawing()?.rect} keyed>
                  {rect => (
                    <div
                      class="storyboard-drawing"
                      style={{
                        left: `${rect.leftPct}%`,
                        top: `${rect.topPct}%`,
                        width: `${rect.widthPct}%`,
                        height: `${rect.heightPct}%`,
                      }}
                    />
                  )}
                </Show>
              </div>
            </div>
            <div class="storyboard-canvas-hint">
              <MousePointer2 size={13} />
              {drawMode()
                ? 'Drag over the page to add a highlight.'
                : 'Drag boxes to move them. Select one to edit timing and effect.'}
            </div>
          </main>

          <aside class="storyboard-inspector" aria-label="Scene inspector">
            <div class="storyboard-inspector__top">
              <div class="storyboard-panel-title">Scene direction</div>
              <label class="storyboard-switch">
                <input
                  type="checkbox"
                  checked={selected()!.enabled}
                  onChange={event => editScene({ enabled: event.currentTarget.checked })}
                />
                Include
              </label>
            </div>
            <label class="storyboard-field">
              <span>Scene label</span>
              <input
                value={selected()!.title}
                onInput={event => editScene({ title: event.currentTarget.value })}
              />
            </label>
            <label class="storyboard-field">
              <span>Voiceover</span>
              <textarea
                rows={7}
                value={selected()!.narration}
                onInput={event => editScene({ narration: event.currentTarget.value })}
              />
              <small>Estimated {selected()!.estimatedDurationSec.toFixed(1)} seconds</small>
            </label>
            <label class="storyboard-field">
              <span>Slideshow transition</span>
              <select
                value={draft()!.transition}
                onChange={event =>
                  edit(current => ({
                    ...current,
                    transition: event.currentTarget.value as VideoStoryboard['transition'],
                    status: 'draft',
                    approvedRevision: undefined,
                  }))
                }
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="zoom">Zoom reveal</option>
              </select>
            </label>
            <Show when={selected()!.screenText.length}>
              <div class="storyboard-detected">
                <span>
                  <Sparkles size={12} /> Visible points
                </span>
                <For each={selected()!.screenText}>{point => <p>{point}</p>}</For>
              </div>
            </Show>
            <div class="storyboard-highlights">
              <div class="storyboard-panel-title">Timed highlights</div>
              <Show
                when={selected()!.emphasis.length}
                fallback={
                  <p class="storyboard-empty-note">
                    Draw on the page or ask the agent to add emphasis.
                  </p>
                }
              >
                <For each={selected()!.emphasis}>
                  {(emphasis, index) => {
                    const valid = () =>
                      selected()!
                        .narration.toLocaleLowerCase()
                        .includes(emphasis.phrase.trim().toLocaleLowerCase())
                    return (
                      <div class="storyboard-highlight-card" classList={{ 'has-error': !valid() }}>
                        <button
                          class="storyboard-highlight-select"
                          onClick={() => setSelectedEmphasis(index())}
                        >
                          <CircleDot size={13} /> Highlight {index() + 1}
                        </button>
                        <input
                          aria-label={`Highlight ${index() + 1} trigger phrase`}
                          value={emphasis.phrase}
                          onInput={event =>
                            editEmphasis(index(), { phrase: event.currentTarget.value })
                          }
                        />
                        <div class="storyboard-highlight-row">
                          <select
                            aria-label={`Highlight ${index() + 1} effect`}
                            value={emphasis.style}
                            onChange={event => {
                              editEmphasis(index(), {
                                style: event.currentTarget.value as StoryboardAnnotationStyle,
                              })
                              previewEffect(index())
                            }}
                          >
                            <For each={EFFECTS}>
                              {effect => <option value={effect.value}>{effect.label}</option>}
                            </For>
                          </select>
                          <button title="Preview effect" onClick={() => previewEffect(index())}>
                            <Play size={13} />
                          </button>
                          <button
                            title="Remove highlight"
                            onClick={() => {
                              editScene({
                                emphasis: selected()!.emphasis.filter((_, i) => i !== index()),
                              })
                              setSelectedEmphasis(null)
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <Show when={!valid()}>
                          <small>Trigger must be exact words from the voiceover.</small>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </Show>
            </div>
          </aside>
        </div>
      </div>
    </Show>
  )
}
