import { useAuth } from '@clerk/react'
import * as Popover from '@radix-ui/react-popover'
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import {
  rectFromDrag,
  type StoryboardRectTransformMode,
  storyboardDurationSec,
  transformStoryboardRect,
  updateStoryboardScene,
  updateStoryboardTitleCard,
} from '../lib/storyboardEditor'
import type {
  Project,
  StoryboardEmphasis,
  StoryboardRect,
  StoryboardTitleCard,
  VideoStoryboard,
} from '../types'

interface VideoStoryboardEditorProps {
  project: Project
}

const emptyTitleCards = (): VideoStoryboard['titleCards'] => ({
  intro: { enabled: false, title: '', subtitle: '' },
  outro: { enabled: false, title: '', subtitle: '' },
})

const withTitleCards = (storyboard: VideoStoryboard): VideoStoryboard => ({
  ...storyboard,
  titleCards: storyboard.titleCards ?? emptyTitleCards(),
})

interface TitleCardEditorProps {
  kind: 'intro' | 'outro'
  card: StoryboardTitleCard
  onChange: (update: Partial<StoryboardTitleCard>) => void
}

function TitleCardEditor({ kind, card, onChange }: TitleCardEditorProps) {
  const label = kind === 'intro' ? 'Intro' : 'Outro'
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border border-gray-200 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            aria-hidden="true"
            className={`text-[10px] text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-700">{label} card</span>
            <span className="block truncate text-[10px] text-gray-400">
              {card.enabled ? card.title || 'Enabled · add a title' : 'Off by default'}
            </span>
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={card.enabled}
          aria-label={`${card.enabled ? 'Disable' : 'Enable'} ${label.toLowerCase()} card`}
          onClick={() => {
            const enabled = !card.enabled
            onChange({ enabled })
            if (enabled) setExpanded(true)
          }}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${
            card.enabled ? 'bg-emerald-500' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              card.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div
            className={`grid aspect-video place-items-center rounded-md border px-4 text-center ${
              card.enabled
                ? 'border-gray-200 bg-white text-gray-900 shadow-inner'
                : 'border-dashed border-gray-200 bg-gray-50 text-gray-400'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-serif text-sm font-medium">
                {card.title || (card.enabled ? 'Your title' : `${label} card is off`)}
              </p>
              {card.subtitle && (
                <p className="mt-1 truncate text-[9px] text-gray-500">{card.subtitle}</p>
              )}
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <input
              value={card.title}
              disabled={!card.enabled}
              onChange={event => onChange({ title: event.target.value })}
              aria-label={`${label} card title`}
              placeholder={`${label} title`}
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <input
              value={card.subtitle}
              disabled={!card.enabled}
              onChange={event => onChange({ subtitle: event.target.value })}
              aria-label={`${label} card subtitle`}
              placeholder="Optional subtitle"
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="text-[10px] text-gray-400">Adds 2.5 seconds when enabled.</p>
          </div>
        </div>
      )}
    </div>
  )
}

const previewAnnotationClass = (style: StoryboardEmphasis['style']) => {
  switch (style) {
    case 'circle':
      return 'rounded-full border-[3px] border-pink-500 bg-pink-400/10'
    case 'underline':
      return 'border-b-4 border-pink-500'
    case 'highlighter':
      return 'rounded-sm bg-yellow-300/60 mix-blend-multiply'
    case 'spotlight':
      return 'rounded border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.58)]'
    case 'pulse':
      return 'animate-pulse rounded border-[3px] border-pink-500 bg-pink-400/20'
    case 'bracket':
      return 'border-x-4 border-pink-500'
    case 'arrow':
      return 'border-b-[3px] border-pink-500'
    default:
      return 'rounded border-[3px] border-pink-500 bg-pink-400/10'
  }
}

export function VideoStoryboardEditor({ project }: VideoStoryboardEditorProps) {
  const { getToken } = useAuth()
  const source = project.parameters.storyboard!
  const [draft, setDraft] = useState<VideoStoryboard>(() => withTitleCards(source))
  const [selectedId, setSelectedId] = useState(source.scenes[0]?.id ?? '')
  const [selectedEmphasisIndex, setSelectedEmphasisIndex] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [drawing, setDrawing] = useState<{
    start: { x: number; y: number }
    rect: StoryboardRect | null
  } | null>(null)
  const [boxInteraction, setBoxInteraction] = useState<{
    sceneId: string
    index: number
    mode: StoryboardRectTransformMode
    start: { x: number; y: number }
    rect: StoryboardRect
  } | null>(null)
  const [effectPreview, setEffectPreview] = useState<{ emphasis: StoryboardEmphasis } | null>(null)
  const [busy, setBusy] = useState<'save' | 'render' | null>(null)
  const [message, setMessage] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const effectPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (effectPreviewTimer.current) clearTimeout(effectPreviewTimer.current)
    },
    [],
  )

  useEffect(() => {
    const incoming = project.parameters.storyboard
    if (incoming && incoming.revision > draft.revision) {
      setDraft(withTitleCards(incoming))
      setSelectedId(current =>
        incoming.scenes.some(scene => scene.id === current)
          ? current
          : (incoming.scenes[0]?.id ?? ''),
      )
    }
  }, [project.parameters.storyboard, draft.revision])

  const selected = draft.scenes.find(scene => scene.id === selectedId) ?? draft.scenes[0]
  const selectedEmphasis =
    selected && selectedEmphasisIndex !== null
      ? selected.emphasis[selectedEmphasisIndex]
      : undefined
  const previewEmphasis = effectPreview?.emphasis
  const duration = useMemo(() => storyboardDurationSec(draft), [draft])
  const hasInvalidEmphasis = draft.scenes.some(scene =>
    scene.emphasis.some(
      emphasis =>
        !emphasis.phrase.trim() ||
        !scene.narration.toLocaleLowerCase().includes(emphasis.phrase.trim().toLocaleLowerCase()),
    ),
  )

  const editSelected = (update: Parameters<typeof updateStoryboardScene>[2]) => {
    if (!selected) return
    setDraft(current => updateStoryboardScene(current, selected.id, update))
    setMessage('Unsaved changes')
  }

  const editTransition = (transition: VideoStoryboard['transition']) => {
    setDraft(current => ({
      ...current,
      status: 'draft',
      approvedRevision: undefined,
      transition,
    }))
    setMessage('Unsaved changes')
  }

  const editTitleCard = (card: 'intro' | 'outro', update: Partial<StoryboardTitleCard>) => {
    setDraft(current => updateStoryboardTitleCard(current, card, update))
    setMessage('Unsaved changes')
  }

  const editEmphasis = (index: number, update: Partial<StoryboardEmphasis>) => {
    if (!selected) return
    editSelected({
      emphasis: selected.emphasis.map((emphasis, i) =>
        i === index ? { ...emphasis, ...update } : emphasis,
      ),
    })
  }

  const removeEmphasis = (index: number) => {
    if (!selected) return
    stopEffectPreview()
    editSelected({ emphasis: selected.emphasis.filter((_, i) => i !== index) })
    setSelectedEmphasisIndex(null)
  }

  const previewBounds = () => {
    const bounds = previewRef.current?.getBoundingClientRect()
    return bounds
      ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
      : null
  }

  const stopEffectPreview = () => {
    if (effectPreviewTimer.current) clearTimeout(effectPreviewTimer.current)
    effectPreviewTimer.current = null
    setEffectPreview(null)
  }

  const selectScene = (sceneId: string) => {
    stopEffectPreview()
    setSelectedId(sceneId)
    setSelectedEmphasisIndex(null)
    setDrawMode(false)
    setDrawing(null)
    setBoxInteraction(null)
  }

  const beginBoxInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    index: number,
    mode: StoryboardRectTransformMode,
  ) => {
    if (drawMode || effectPreview || !selected) return
    const emphasis = selected.emphasis[index]
    if (!emphasis) return
    event.preventDefault()
    event.stopPropagation()
    previewRef.current?.setPointerCapture(event.pointerId)
    setSelectedEmphasisIndex(index)
    setBoxInteraction({
      sceneId: selected.id,
      index,
      mode,
      start: { x: event.clientX, y: event.clientY },
      rect: emphasis.rect,
    })
  }

  const playEffectPreview = (
    index = selectedEmphasisIndex,
    emphasisOverride?: StoryboardEmphasis,
    durationMs = 2800,
  ) => {
    if (index === null || !selected) return
    const emphasis = emphasisOverride ?? selected.emphasis[index]
    if (!emphasis) return
    stopEffectPreview()
    setDrawMode(false)
    setDrawing(null)
    setBoxInteraction(null)
    setSelectedEmphasisIndex(index)
    setEffectPreview({ emphasis })
    effectPreviewTimer.current = setTimeout(() => {
      setEffectPreview(null)
      effectPreviewTimer.current = null
    }, durationMs)
  }

  const selectEffect = (index: number, style: StoryboardEmphasis['style']) => {
    if (!selected) return
    const emphasis = selected.emphasis[index]
    if (!emphasis) return
    const updated = { ...emphasis, style }
    editEmphasis(index, { style })
    playEffectPreview(index, updated, 1350)
  }

  const beginDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawMode || effectPreview) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrawing({ start: { x: event.clientX, y: event.clientY }, rect: null })
  }

  const continueDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (boxInteraction) {
      const bounds = previewBounds()
      if (!bounds) return
      const rect = transformStoryboardRect(
        boxInteraction.rect,
        boxInteraction.mode,
        boxInteraction.start,
        { x: event.clientX, y: event.clientY },
        bounds,
      )
      setDraft(current => {
        const scene = current.scenes.find(item => item.id === boxInteraction.sceneId)
        if (!scene) return current
        return updateStoryboardScene(current, scene.id, {
          emphasis: scene.emphasis.map((emphasis, index) =>
            index === boxInteraction.index ? { ...emphasis, rect } : emphasis,
          ),
        })
      })
      setMessage('Unsaved changes')
      return
    }
    if (!drawing) return
    const bounds = previewBounds()
    if (!bounds) return
    setDrawing({
      ...drawing,
      rect: rectFromDrag(drawing.start, { x: event.clientX, y: event.clientY }, bounds),
    })
  }

  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing || !selected) return
    const bounds = previewBounds()
    const rect = bounds
      ? rectFromDrag(drawing.start, { x: event.clientX, y: event.clientY }, bounds)
      : null
    setDrawing(null)
    if (!rect) return
    const nextIndex = selected.emphasis.length
    const phrase = selected.narration.trim().split(/\s+/).slice(0, 6).join(' ')
    editSelected({
      emphasis: [
        ...selected.emphasis,
        {
          phrase,
          rect,
          coordinateSpace: 'page',
          style: 'box',
          zoom: 1.7,
        },
      ],
    })
    setSelectedEmphasisIndex(nextIndex)
    setDrawMode(false)
  }

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing) finishDrawing(event)
    setBoxInteraction(null)
  }

  const save = async (): Promise<VideoStoryboard> => {
    setBusy('save')
    setMessage('Saving revision…')
    try {
      const token = await getToken()
      const updated = await api.patch<Project>(`/jobs/${project.id}/storyboard`, token!, {
        revision: draft.revision,
        transition: draft.transition,
        titleCards: draft.titleCards,
        scenes: draft.scenes,
      })
      const saved = updated.parameters.storyboard!
      setDraft(saved)
      setMessage(`Revision ${saved.revision} saved`)
      return saved
    } catch (error: any) {
      setMessage(error?.message || 'Could not save the storyboard.')
      throw error
    } finally {
      setBusy(null)
    }
  }

  const approveAndRender = async () => {
    setBusy('render')
    setMessage('Approving storyboard…')
    try {
      const saved = await save()
      setBusy('render')
      const token = await getToken()
      await api.post(`/jobs/${project.id}/render`, token!, { revision: saved.revision })
      setMessage('Approved. Final voiceover and video rendering are queued.')
    } catch (error: any) {
      setMessage(error?.message || 'Could not approve the storyboard.')
    } finally {
      setBusy(null)
    }
  }

  if (!selected) return null

  return (
    <div className="space-y-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-4 lg:space-y-0">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between lg:shrink-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">
            Storyboard ready
          </p>
          <h1 className="mt-1 text-xl font-bold text-gray-900">Review before rendering</h1>
          <p className="mt-1 text-sm text-gray-500">
            {draft.scenes.length} scenes · approximately {Math.ceil(duration)} seconds total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${hasInvalidEmphasis ? 'text-red-500' : 'text-gray-500'}`}>
            {hasInvalidEmphasis
              ? 'Every highlight needs exact trigger words from its voiceover.'
              : message}
          </span>
          <button
            type="button"
            onClick={() => void save().catch(() => undefined)}
            disabled={busy !== null || hasInvalidEmphasis}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={() => void approveAndRender()}
            disabled={
              busy !== null ||
              hasInvalidEmphasis ||
              draft.scenes.some(scene => !scene.narration.trim())
            }
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy === 'render' ? 'Queuing…' : 'Approve & render'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[180px_minmax(0,1fr)_300px] xl:grid-cols-[220px_minmax(0,1fr)_340px] xl:gap-5">
        <aside
          aria-label="Scenes"
          className="rounded-xl border border-gray-200 bg-white p-2 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="bg-white px-2 pb-2 lg:sticky lg:top-0 lg:z-10">
            <p className="py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Scenes
            </p>
            <label className="block text-[11px] font-medium text-gray-500">
              Selected scene label
              <input
                value={selected.title}
                onChange={event => editSelected({ title: event.target.value })}
                className="mt-1 w-full rounded-md border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none focus:border-gray-400"
              />
            </label>
          </div>
          <div className="space-y-1.5">
            {draft.scenes.map((scene, index) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => selectScene(scene.id)}
                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                  scene.id === selected.id
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <img src={scene.previewUrl} alt="" className="h-10 w-14 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="text-[10px] opacity-60">Scene {index + 1}</p>
                    <p className="truncate text-xs font-semibold">{scene.title}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section
          aria-label="Slide preview"
          className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
        >
          <div>
            <p className="text-xs text-gray-400">Page {selected.pageIndex + 1}</p>
            <h2 className="font-semibold text-gray-900">{selected.title}</h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">
              {effectPreview && previewEmphasis
                ? `Previewing the ${previewEmphasis.style} effect on this area.`
                : drawMode
                  ? 'Drag over the page to create a highlight area.'
                  : 'Select a box to drag, resize, or preview its final effect.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={effectPreview ? stopEffectPreview : () => playEffectPreview()}
                disabled={!selectedEmphasis}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-pink-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {effectPreview ? 'Stop preview' : 'Preview selected effect'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopEffectPreview()
                  setDrawMode(current => !current)
                  setDrawing(null)
                  setSelectedEmphasisIndex(null)
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  drawMode
                    ? 'bg-pink-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-pink-300'
                }`}
              >
                {drawMode ? 'Cancel drawing' : '+ Draw highlight area'}
              </button>
            </div>
          </div>

          <div
            ref={previewRef}
            onPointerDown={beginDrawing}
            onPointerMove={continueDrawing}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={() => {
              setDrawing(null)
              setBoxInteraction(null)
            }}
            className={`relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 ${
              drawMode ? 'cursor-crosshair ring-2 ring-pink-200' : ''
            }`}
          >
            <div className="relative touch-none">
              <img
                src={selected.previewUrl}
                alt={selected.title}
                draggable={false}
                className="pointer-events-none block h-auto w-full select-none"
              />
              {selected.emphasis.map((emphasis, index) => (
                <Popover.Root
                  key={`${selected.id}-box-${index}`}
                  open={selectedEmphasisIndex === index && !drawMode && !effectPreview}
                  onOpenChange={open => {
                    if (!open && selectedEmphasisIndex === index) {
                      setSelectedEmphasisIndex(null)
                    }
                  }}
                >
                  <Popover.Anchor asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      title={`${emphasis.phrase} — drag to move`}
                      onPointerDown={event => beginBoxInteraction(event, index, 'move')}
                      onClick={() => {
                        setSelectedEmphasisIndex(index)
                        setDrawMode(false)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelectedEmphasisIndex(index)
                          setDrawMode(false)
                        }
                      }}
                      className={`absolute cursor-move rounded border-2 bg-pink-400/15 ${
                        drawMode || effectPreview ? 'pointer-events-none opacity-0' : ''
                      } ${
                        selectedEmphasisIndex === index
                          ? 'border-pink-600 shadow-[0_0_0_4px_rgba(236,72,153,0.25)]'
                          : 'border-pink-500 shadow-[0_0_0_3px_rgba(236,72,153,0.15)]'
                      }`}
                      style={{
                        left: `${emphasis.rect.leftPct}%`,
                        top: `${emphasis.rect.topPct}%`,
                        width: `${emphasis.rect.widthPct}%`,
                        height: `${emphasis.rect.heightPct}%`,
                      }}
                    >
                      <span className="pointer-events-none absolute -top-5 left-0 rounded bg-pink-600 px-1.5 py-0.5 text-[9px] text-white">
                        {index + 1}
                      </span>
                      {selectedEmphasisIndex === index &&
                        !drawMode &&
                        !effectPreview &&
                        (
                          [
                            ['northWest', '-left-1.5 -top-1.5 cursor-nwse-resize'],
                            ['northEast', '-right-1.5 -top-1.5 cursor-nesw-resize'],
                            ['southWest', '-bottom-1.5 -left-1.5 cursor-nesw-resize'],
                            ['southEast', '-bottom-1.5 -right-1.5 cursor-nwse-resize'],
                          ] as const
                        ).map(([mode, position]) => (
                          <button
                            key={mode}
                            type="button"
                            aria-label={`Resize highlight from ${mode}`}
                            onPointerDown={event => beginBoxInteraction(event, index, mode)}
                            className={`absolute h-3 w-3 rounded-full border-2 border-white bg-pink-600 shadow ${position}`}
                          />
                        ))}
                    </div>
                  </Popover.Anchor>

                  <Popover.Portal>
                    <Popover.Content
                      role="dialog"
                      aria-label={`Edit highlight ${index + 1}`}
                      side="bottom"
                      align="center"
                      sideOffset={8}
                      collisionPadding={12}
                      onOpenAutoFocus={event => event.preventDefault()}
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => event.stopPropagation()}
                      className="z-[100] w-72 max-w-[calc(100vw-1.5rem)] cursor-default overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl ring-1 ring-black/5 touch-auto"
                      style={{
                        maxHeight:
                          'min(calc(100vh - 1.5rem), var(--radix-popover-content-available-height))',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-pink-600">
                            Highlight {index + 1}
                          </p>
                          <p className="truncate text-xs font-medium capitalize text-gray-700">
                            {emphasis.style} effect
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Close highlight controls"
                          onClick={() => setSelectedEmphasisIndex(null)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          ×
                        </button>
                      </div>

                      <label className="mt-3 block text-[11px] font-medium text-gray-500">
                        Appears when narration says
                        <input
                          value={emphasis.phrase}
                          onChange={event => editEmphasis(index, { phrase: event.target.value })}
                          aria-label={`Highlight ${index + 1} narration phrase`}
                          placeholder="Exact words from the voiceover"
                          className="mt-1 w-full rounded-md border border-gray-200 px-2.5 py-2 text-xs text-gray-800 outline-none focus:border-pink-400"
                        />
                      </label>
                      {!selected.narration
                        .toLocaleLowerCase()
                        .includes(emphasis.phrase.trim().toLocaleLowerCase()) && (
                        <p className="mt-1 text-[10px] text-red-500">
                          Use exact words from the voiceover for correct timing.
                        </p>
                      )}

                      <div className="mt-3">
                        <label className="text-[11px] font-medium text-gray-500">
                          Effect
                          <select
                            value={emphasis.style}
                            onChange={event =>
                              selectEffect(index, event.target.value as StoryboardEmphasis['style'])
                            }
                            aria-label={`Highlight ${index + 1} effect`}
                            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800"
                          >
                            <option value="box">Box</option>
                            <option value="circle">Circle</option>
                            <option value="underline">Underline</option>
                            <option value="highlighter">Highlighter</option>
                            <option value="arrow">Arrow</option>
                            <option value="spotlight">Spotlight</option>
                            <option value="pulse">Pulse</option>
                            <option value="bracket">Bracket</option>
                          </select>
                        </label>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                        <button
                          type="button"
                          onClick={() => removeEmphasis(index)}
                          className="text-[11px] font-medium text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => playEffectPreview()}
                          className="rounded-md bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800"
                        >
                          Preview effect
                        </button>
                      </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              ))}
              {effectPreview && previewEmphasis && (
                <div
                  data-effect={previewEmphasis.style}
                  className={`storyboard-effect-preview pointer-events-none absolute z-30 ${previewAnnotationClass(previewEmphasis.style)}`}
                  style={{
                    left: `${previewEmphasis.rect.leftPct}%`,
                    top: `${previewEmphasis.rect.topPct}%`,
                    width: `${previewEmphasis.rect.widthPct}%`,
                    height: `${previewEmphasis.rect.heightPct}%`,
                  }}
                >
                  {previewEmphasis.style === 'arrow' && (
                    <span className="absolute -left-5 -top-5 text-3xl font-black text-pink-500">
                      ↘
                    </span>
                  )}
                </div>
              )}
              {drawing?.rect && (
                <div
                  className="pointer-events-none absolute rounded border-2 border-dashed border-pink-600 bg-pink-400/20"
                  style={{
                    left: `${drawing.rect.leftPct}%`,
                    top: `${drawing.rect.topPct}%`,
                    width: `${drawing.rect.widthPct}%`,
                    height: `${drawing.rect.heightPct}%`,
                  }}
                />
              )}
            </div>
          </div>
        </section>

        <section
          aria-label="Scene settings"
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
        >
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Slideshow transition</span>
            <select
              value={draft.transition}
              onChange={event =>
                editTransition(event.target.value as VideoStoryboard['transition'])
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="zoom">Zoom reveal</option>
            </select>
          </label>

          <div>
            <p className="text-xs font-semibold text-gray-700">AI-detected points (reference)</p>
            <div className="mt-1 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
              {selected.screenText.length > 0 ? (
                <ul className="space-y-1 text-xs text-gray-600">
                  {selected.screenText.map(point => (
                    <li key={point}>• {point}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No high-confidence point detected.</p>
              )}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Voiceover script</span>
            <textarea
              rows={7}
              value={selected.narration}
              onChange={event => editSelected({ narration: event.target.value })}
              className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-gray-400"
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              Estimated {selected.estimatedDurationSec.toFixed(1)} seconds
            </span>
          </label>

          <fieldset className="border-t border-gray-100 pt-4">
            <legend className="text-xs font-semibold text-gray-700">Optional title cards</legend>
            <p className="mt-0.5 text-[10px] text-gray-400">
              Intro and outro stay off by default for PDF videos.
            </p>
            <div className="mt-2 space-y-2">
              <TitleCardEditor
                kind="intro"
                card={draft.titleCards.intro}
                onChange={update => editTitleCard('intro', update)}
              />
              <TitleCardEditor
                kind="outro"
                card={draft.titleCards.outro}
                onChange={update => editTitleCard('outro', update)}
              />
            </div>
          </fieldset>
        </section>
      </div>
    </div>
  )
}
