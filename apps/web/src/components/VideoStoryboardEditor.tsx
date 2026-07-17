import { useAuth } from '@clerk/react'
import * as Popover from '@radix-ui/react-popover'
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { type GiphyResult, searchGiphy } from '../lib/giphy'
import {
  defaultCalloutNoteRect,
  moveStoryboardLayer,
  nextStoryboardLayer,
  rectFromDrag,
  removeStoryboardScene,
  type StoryboardRectTransformMode,
  storyboardDurationSec,
  storyboardLayerEntries,
  transformStoryboardRect,
  updateStoryboardOverlay,
  updateStoryboardScene,
  updateStoryboardTitleCard,
} from '../lib/storyboardEditor'
import type {
  Project,
  StoryboardEmphasis,
  StoryboardOverlay,
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
  scenes: storyboard.scenes.map(scene => ({ ...scene, overlays: scene.overlays ?? [] })),
})

const GIPHY_API_KEY = (import.meta.env.VITE_GIPHY_API_KEY ?? '').trim()
const DEFAULT_MEDIA_RECT: StoryboardRect = {
  leftPct: 62,
  topPct: 6,
  widthPct: 26,
  heightPct: 26,
}

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
  const [selectedOverlayIndex, setSelectedOverlayIndex] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [overlayDrawMode, setOverlayDrawMode] = useState<'blur' | 'callout' | null>(null)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [giphyQuery, setGiphyQuery] = useState('')
  const [giphyResults, setGiphyResults] = useState<GiphyResult[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
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
  const [overlayInteraction, setOverlayInteraction] = useState<{
    sceneId: string
    index: number
    rectField: 'rect' | 'noteRect'
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
  const hasInvalidOverlay = draft.scenes.some(scene =>
    scene.overlays.some(overlay => overlay.kind === 'callout' && !overlay.text.trim()),
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

  const editOverlay = (index: number, update: Parameters<typeof updateStoryboardOverlay>[3]) => {
    if (!selected) return
    setDraft(current => updateStoryboardOverlay(current, selected.id, index, update))
    setMessage('Unsaved changes')
  }

  const appendOverlay = (overlay: StoryboardOverlay) => {
    if (!selected) return
    const nextIndex = selected.overlays.length
    const layeredOverlay = {
      ...overlay,
      layer: overlay.layer ?? nextStoryboardLayer(selected),
    } as StoryboardOverlay
    editSelected({ overlays: [...selected.overlays, layeredOverlay] })
    setSelectedEmphasisIndex(null)
    setSelectedOverlayIndex(nextIndex)
    setDrawMode(false)
    setOverlayDrawMode(null)
  }

  const removeOverlay = (index: number) => {
    if (!selected) return
    editSelected({ overlays: selected.overlays.filter((_, itemIndex) => itemIndex !== index) })
    setSelectedOverlayIndex(null)
  }

  const addMediaOverlay = (media: {
    url: string
    alt: string
    source: 'upload' | 'giphy'
    giphyId?: string
  }) => {
    appendOverlay({ kind: 'media', rect: DEFAULT_MEDIA_RECT, ...media })
    setMediaPickerOpen(false)
  }

  const uploadMedia = async (file: File) => {
    setMediaBusy(true)
    setMessage('Uploading media…')
    try {
      const token = await getToken()
      const form = new FormData()
      form.append('files', file)
      const uploads = await api.postForm<
        Array<{ url: string; name: string; type: string; size: number }>
      >('/uploads', token!, form)
      const uploaded = uploads[0]
      if (!uploaded) throw new Error('Upload returned no usable media.')
      addMediaOverlay({
        url: uploaded.url,
        alt: uploaded.name.replace(/\.[^.]+$/, '') || 'Slide media',
        source: 'upload',
      })
      setMessage('Media added · unsaved changes')
    } catch (error: any) {
      setMessage(error?.message || 'Could not upload this media.')
    } finally {
      setMediaBusy(false)
    }
  }

  const runGiphySearch = async () => {
    setMediaBusy(true)
    setMessage('Searching GIPHY…')
    try {
      const results = await searchGiphy(giphyQuery, GIPHY_API_KEY)
      setGiphyResults(results)
      setMessage(results.length > 0 ? '' : 'No GIPHY results found.')
    } catch (error: any) {
      setMessage(error?.message || 'Could not search GIPHY.')
    } finally {
      setMediaBusy(false)
    }
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
    setSelectedOverlayIndex(null)
    setDrawMode(false)
    setOverlayDrawMode(null)
    setMediaPickerOpen(false)
    setLayersOpen(false)
    setDrawing(null)
    setBoxInteraction(null)
    setOverlayInteraction(null)
  }

  const removeScene = (sceneId: string) => {
    const sceneIndex = draft.scenes.findIndex(scene => scene.id === sceneId)
    if (sceneIndex < 0) return
    if (draft.scenes.length <= 1) {
      setMessage('A video must keep at least one scene.')
      return
    }
    const remaining = draft.scenes.filter(scene => scene.id !== sceneId)
    setDraft(current => removeStoryboardScene(current, sceneId))
    if (selectedId === sceneId) {
      const nextScene = remaining[Math.min(sceneIndex, remaining.length - 1)]
      if (nextScene) selectScene(nextScene.id)
    }
    setMessage('Scene removed · unsaved changes')
  }

  const confirmAndRemoveScene = (sceneId: string) => {
    const scene = draft.scenes.find(item => item.id === sceneId)
    if (!scene || draft.scenes.length <= 1) return
    const confirmed = window.confirm(
      `Remove "${scene.title}"?\n\nThis slide and its narration, highlights, and overlays will be excluded from the final video.`,
    )
    if (confirmed) removeScene(sceneId)
  }

  const moveLayer = (
    target: { kind: 'overlay' | 'emphasis'; index: number },
    direction: 'front' | 'back',
  ) => {
    if (!selected) return
    setDraft(current => moveStoryboardLayer(current, selected.id, target, direction))
    setMessage(
      direction === 'front'
        ? 'Layer brought to front · unsaved changes'
        : 'Layer sent to back · unsaved changes',
    )
  }

  const beginBoxInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    index: number,
    mode: StoryboardRectTransformMode,
  ) => {
    if (drawMode || overlayDrawMode || effectPreview || !selected) return
    const emphasis = selected.emphasis[index]
    if (!emphasis) return
    event.preventDefault()
    event.stopPropagation()
    previewRef.current?.setPointerCapture(event.pointerId)
    setSelectedEmphasisIndex(index)
    setSelectedOverlayIndex(null)
    setBoxInteraction({
      sceneId: selected.id,
      index,
      mode,
      start: { x: event.clientX, y: event.clientY },
      rect: emphasis.rect,
    })
  }

  const beginOverlayInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    index: number,
    mode: StoryboardRectTransformMode,
    rectField: 'rect' | 'noteRect' = 'rect',
  ) => {
    if (drawMode || overlayDrawMode || effectPreview || !selected) return
    const overlay = selected.overlays[index]
    if (!overlay) return
    event.preventDefault()
    event.stopPropagation()
    previewRef.current?.setPointerCapture(event.pointerId)
    setSelectedOverlayIndex(index)
    setSelectedEmphasisIndex(null)
    setOverlayInteraction({
      sceneId: selected.id,
      index,
      rectField,
      mode,
      start: { x: event.clientX, y: event.clientY },
      rect:
        rectField === 'noteRect' && overlay.kind === 'callout'
          ? (overlay.noteRect ?? defaultCalloutNoteRect(overlay.rect))
          : overlay.rect,
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
    setOverlayDrawMode(null)
    setSelectedOverlayIndex(null)
    setDrawing(null)
    setBoxInteraction(null)
    setOverlayInteraction(null)
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
    if ((!drawMode && !overlayDrawMode) || effectPreview) return
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
    if (overlayInteraction) {
      const bounds = previewBounds()
      if (!bounds) return
      const rect = transformStoryboardRect(
        overlayInteraction.rect,
        overlayInteraction.mode,
        overlayInteraction.start,
        { x: event.clientX, y: event.clientY },
        bounds,
      )
      setDraft(current =>
        updateStoryboardOverlay(current, overlayInteraction.sceneId, overlayInteraction.index, {
          [overlayInteraction.rectField]: rect,
        }),
      )
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
    if (overlayDrawMode === 'blur') {
      appendOverlay({ kind: 'blur', rect, strength: 10 })
      return
    }
    if (overlayDrawMode === 'callout') {
      appendOverlay({
        kind: 'callout',
        rect,
        noteRect: defaultCalloutNoteRect(rect),
        text: 'Add your note',
        shape: 'box',
        color: 'blue',
      })
      return
    }
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
          layer: nextStoryboardLayer(selected),
        },
      ],
    })
    setSelectedEmphasisIndex(nextIndex)
    setSelectedOverlayIndex(null)
    setDrawMode(false)
  }

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing) finishDrawing(event)
    setBoxInteraction(null)
    setOverlayInteraction(null)
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
          <span
            className={`text-xs ${hasInvalidEmphasis || hasInvalidOverlay ? 'text-red-500' : 'text-gray-500'}`}
          >
            {hasInvalidEmphasis
              ? 'Every highlight needs exact trigger words from its voiceover.'
              : hasInvalidOverlay
                ? 'Every callout needs note text before rendering.'
                : message}
          </span>
          <button
            type="button"
            onClick={() => void save().catch(() => undefined)}
            disabled={busy !== null || hasInvalidEmphasis || hasInvalidOverlay}
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
              hasInvalidOverlay ||
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
            {draft.scenes.map((scene, index) => {
              const isSelected = scene.id === selected.id
              return (
                <div key={scene.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectScene(scene.id)}
                    className={`w-full rounded-lg border p-2 pr-9 text-left transition-colors ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={scene.previewUrl}
                        alt=""
                        className="h-10 w-14 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] opacity-60">Scene {index + 1}</p>
                        <p className="truncate text-xs font-semibold">{scene.title}</p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove scene ${index + 1}`}
                    title={
                      draft.scenes.length <= 1
                        ? 'A video must keep at least one scene'
                        : 'Remove scene from video'
                    }
                    disabled={draft.scenes.length <= 1}
                    onClick={() => confirmAndRemoveScene(scene.id)}
                    className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      isSelected
                        ? 'text-gray-400 hover:bg-white/10 hover:text-red-300'
                        : 'text-gray-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100'
                    }`}
                  >
                    ×
                  </button>
                </div>
              )
            })}
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
                : overlayDrawMode === 'blur'
                  ? 'Drag over the page to blur an area for this complete scene.'
                  : overlayDrawMode === 'callout'
                    ? 'Drag around the point the callout should explain.'
                    : drawMode
                      ? 'Drag over the page to create a highlight area.'
                      : 'Select any highlight or slide overlay to drag, resize, and edit it.'}
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
                  setOverlayDrawMode(null)
                  setMediaPickerOpen(false)
                  setDrawing(null)
                  setSelectedEmphasisIndex(null)
                  setSelectedOverlayIndex(null)
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  drawMode
                    ? 'bg-pink-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-pink-300'
                }`}
              >
                {drawMode ? 'Cancel drawing' : '+ Draw highlight area'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopEffectPreview()
                  setOverlayDrawMode(current => (current === 'blur' ? null : 'blur'))
                  setDrawMode(false)
                  setMediaPickerOpen(false)
                  setDrawing(null)
                  setSelectedEmphasisIndex(null)
                  setSelectedOverlayIndex(null)
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  overlayDrawMode === 'blur'
                    ? 'bg-sky-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-sky-300'
                }`}
              >
                {overlayDrawMode === 'blur' ? 'Cancel blur' : '+ Blur area'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopEffectPreview()
                  setOverlayDrawMode(current => (current === 'callout' ? null : 'callout'))
                  setDrawMode(false)
                  setMediaPickerOpen(false)
                  setDrawing(null)
                  setSelectedEmphasisIndex(null)
                  setSelectedOverlayIndex(null)
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  overlayDrawMode === 'callout'
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                {overlayDrawMode === 'callout' ? 'Cancel callout' : '+ Callout'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopEffectPreview()
                  setMediaPickerOpen(current => !current)
                  setDrawMode(false)
                  setOverlayDrawMode(null)
                  setDrawing(null)
                  setSelectedEmphasisIndex(null)
                  setSelectedOverlayIndex(null)
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  mediaPickerOpen
                    ? 'bg-violet-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-violet-300'
                }`}
              >
                {mediaPickerOpen ? 'Close media' : '+ GIF / image'}
              </button>
            </div>
          </div>

          {mediaPickerOpen && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800">
                  {mediaBusy ? 'Working…' : 'Upload GIF or image'}
                  <input
                    type="file"
                    accept="image/gif,image/webp,image/png,image/jpeg,image/avif"
                    disabled={mediaBusy}
                    className="sr-only"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void uploadMedia(file)
                    }}
                  />
                </label>
                <span className="text-[11px] text-gray-500">
                  Uploaded media is stored with this project.
                </span>
              </div>

              <form
                className="mt-3 flex gap-2"
                onSubmit={event => {
                  event.preventDefault()
                  void runGiphySearch()
                }}
              >
                <input
                  value={giphyQuery}
                  onChange={event => setGiphyQuery(event.target.value)}
                  placeholder="Search reaction GIFs"
                  maxLength={50}
                  disabled={!GIPHY_API_KEY || mediaBusy}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 disabled:bg-gray-100"
                />
                <button
                  type="submit"
                  disabled={!GIPHY_API_KEY || mediaBusy || !giphyQuery.trim()}
                  className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-40"
                >
                  Search
                </button>
              </form>
              {!GIPHY_API_KEY && (
                <p className="mt-2 text-[11px] text-amber-700">
                  Add VITE_GIPHY_API_KEY to the repository-root .env.local to enable search.
                </p>
              )}
              {giphyResults.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {giphyResults.map(result => (
                    <button
                      key={result.id}
                      type="button"
                      title={result.title}
                      onClick={() =>
                        addMediaOverlay({
                          url: result.assetUrl,
                          alt: result.alt,
                          source: 'giphy',
                          giphyId: result.id,
                        })
                      }
                      className="aspect-square overflow-hidden rounded-lg border border-violet-100 bg-white hover:border-violet-400"
                    >
                      <img
                        src={result.previewUrl}
                        alt={result.alt}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Powered by GIPHY
              </p>
            </div>
          )}

          <div
            ref={previewRef}
            onPointerDown={beginDrawing}
            onPointerMove={continueDrawing}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={() => {
              setDrawing(null)
              setBoxInteraction(null)
              setOverlayInteraction(null)
            }}
            className={`relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 ${
              drawMode || overlayDrawMode ? 'cursor-crosshair ring-2 ring-pink-200' : ''
            }`}
          >
            <div className="relative touch-none">
              <img
                src={selected.previewUrl}
                alt={selected.title}
                draggable={false}
                className="pointer-events-none block h-auto w-full select-none"
              />
              {selected.overlays.map((overlay, index) => {
                const selectedOverlayBox = selectedOverlayIndex === index
                const overlayZIndex = selectedOverlayBox ? 1000 : 20 + (overlay.layer ?? index)
                const calloutColor =
                  overlay.kind === 'callout'
                    ? overlay.color === 'pink'
                      ? 'border-pink-500 text-pink-600'
                      : overlay.color === 'yellow'
                        ? 'border-yellow-500 text-yellow-700'
                        : overlay.color === 'green'
                          ? 'border-green-500 text-green-700'
                          : 'border-blue-500 text-blue-600'
                    : ''
                const calloutStroke =
                  overlay.kind === 'callout'
                    ? overlay.color === 'pink'
                      ? 'stroke-pink-500 fill-pink-500'
                      : overlay.color === 'yellow'
                        ? 'stroke-yellow-500 fill-yellow-500'
                        : overlay.color === 'green'
                          ? 'stroke-green-500 fill-green-500'
                          : 'stroke-blue-500 fill-blue-500'
                    : ''
                const calloutNoteRect =
                  overlay.kind === 'callout'
                    ? (overlay.noteRect ?? defaultCalloutNoteRect(overlay.rect))
                    : null
                const calloutTargetCenter = {
                  x: overlay.rect.leftPct + overlay.rect.widthPct / 2,
                  y: overlay.rect.topPct + overlay.rect.heightPct / 2,
                }
                const calloutNoteCenter = calloutNoteRect
                  ? {
                      x: calloutNoteRect.leftPct + calloutNoteRect.widthPct / 2,
                      y: calloutNoteRect.topPct + calloutNoteRect.heightPct / 2,
                    }
                  : null
                const calloutMarkerId = `editor-callout-arrow-${selected.id}-${index}`
                return (
                  <Popover.Root
                    key={`${selected.id}-overlay-${index}`}
                    open={selectedOverlayBox && !drawMode && !overlayDrawMode && !effectPreview}
                    onOpenChange={open => {
                      if (!open && selectedOverlayBox) setSelectedOverlayIndex(null)
                    }}
                  >
                    <Popover.Anchor asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${overlay.kind} overlay ${index + 1}`}
                        title={`${overlay.kind} overlay — drag to move`}
                        onPointerDown={event => beginOverlayInteraction(event, index, 'move')}
                        onClick={() => {
                          setSelectedOverlayIndex(index)
                          setSelectedEmphasisIndex(null)
                          setDrawMode(false)
                          setOverlayDrawMode(null)
                        }}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            setSelectedOverlayIndex(index)
                            setSelectedEmphasisIndex(null)
                          }
                        }}
                        className={`absolute z-20 cursor-move ${
                          overlay.kind === 'callout'
                            ? `border-[3px] ${calloutColor} ${overlay.shape === 'circle' ? 'rounded-full' : 'rounded-md'}`
                            : overlay.kind === 'blur'
                              ? 'rounded-md bg-white/10'
                              : 'rounded-md'
                        } ${
                          selectedOverlayBox
                            ? 'shadow-[0_0_0_4px_rgba(14,165,233,0.3)]'
                            : 'hover:shadow-[0_0_0_3px_rgba(14,165,233,0.2)]'
                        } ${
                          drawMode || overlayDrawMode || effectPreview ? 'pointer-events-none' : ''
                        }`}
                        style={{
                          zIndex: overlayZIndex,
                          left: `${overlay.rect.leftPct}%`,
                          top: `${overlay.rect.topPct}%`,
                          width: `${overlay.rect.widthPct}%`,
                          height: `${overlay.rect.heightPct}%`,
                          ...(overlay.kind === 'blur'
                            ? {
                                backdropFilter: `blur(${overlay.strength}px)`,
                                WebkitBackdropFilter: `blur(${overlay.strength}px)`,
                              }
                            : {}),
                        }}
                      >
                        {overlay.kind === 'media' && (
                          <img
                            src={overlay.url}
                            alt={overlay.alt}
                            draggable={false}
                            className="pointer-events-none h-full w-full select-none rounded-md object-contain drop-shadow-lg"
                          />
                        )}
                        <span className="pointer-events-none absolute -top-5 left-0 rounded bg-sky-600 px-1.5 py-0.5 text-[9px] uppercase text-white">
                          {overlay.kind.slice(0, 1)}
                          {index + 1}
                        </span>
                        {selectedOverlayBox &&
                          !drawMode &&
                          !overlayDrawMode &&
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
                              aria-label={`Resize ${overlay.kind} overlay from ${mode}`}
                              onPointerDown={event => beginOverlayInteraction(event, index, mode)}
                              className={`absolute h-3 w-3 rounded-full border-2 border-white bg-sky-600 shadow ${position}`}
                            />
                          ))}
                      </div>
                    </Popover.Anchor>

                    {overlay.kind === 'callout' && calloutNoteRect && calloutNoteCenter && (
                      <>
                        <svg
                          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                          style={{ zIndex: overlayZIndex }}
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <defs>
                            <marker
                              id={calloutMarkerId}
                              markerWidth="8"
                              markerHeight="8"
                              refX="7"
                              refY="4"
                              orient="auto"
                            >
                              <path d="M0,0 L8,4 L0,8 z" className={calloutStroke} />
                            </marker>
                          </defs>
                          <line
                            x1={calloutNoteCenter.x}
                            y1={calloutNoteCenter.y}
                            x2={calloutTargetCenter.x}
                            y2={calloutTargetCenter.y}
                            markerEnd={`url(#${calloutMarkerId})`}
                            className={calloutStroke}
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`Move callout note ${index + 1}`}
                          title="Drag to move this note"
                          onPointerDown={event =>
                            beginOverlayInteraction(event, index, 'move', 'noteRect')
                          }
                          onClick={() => {
                            setSelectedOverlayIndex(index)
                            setSelectedEmphasisIndex(null)
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              setSelectedOverlayIndex(index)
                              setSelectedEmphasisIndex(null)
                            }
                          }}
                          className={`absolute z-20 flex cursor-move items-center overflow-hidden rounded-lg border-2 bg-white/95 px-2.5 py-2 text-[10px] font-semibold leading-tight shadow-lg ${calloutColor} ${
                            selectedOverlayBox
                              ? 'ring-4 ring-sky-400/30'
                              : 'hover:ring-2 hover:ring-sky-400/20'
                          }`}
                          style={{
                            zIndex: overlayZIndex,
                            left: `${calloutNoteRect.leftPct}%`,
                            top: `${calloutNoteRect.topPct}%`,
                            width: `${calloutNoteRect.widthPct}%`,
                            height: `${calloutNoteRect.heightPct}%`,
                          }}
                        >
                          {overlay.text}
                        </div>
                      </>
                    )}

                    <Popover.Portal>
                      <Popover.Content
                        role="dialog"
                        aria-label={`Edit ${overlay.kind} overlay ${index + 1}`}
                        side="bottom"
                        align="center"
                        sideOffset={8}
                        collisionPadding={12}
                        onOpenAutoFocus={event => event.preventDefault()}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={event => event.stopPropagation()}
                        className="z-[100] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
                        style={{
                          maxHeight:
                            'min(calc(100vh - 1.5rem), var(--radix-popover-content-available-height))',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-600">
                              Slide overlay {index + 1}
                            </p>
                            <p className="text-xs font-medium capitalize text-gray-700">
                              {overlay.kind === 'media'
                                ? overlay.source === 'giphy'
                                  ? 'GIPHY media'
                                  : 'Uploaded media'
                                : overlay.kind}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Close overlay controls"
                            onClick={() => setSelectedOverlayIndex(null)}
                            className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-gray-100"
                          >
                            ×
                          </button>
                        </div>

                        {overlay.kind === 'blur' && (
                          <label className="mt-3 block text-[11px] font-medium text-gray-500">
                            Blur strength: {overlay.strength}px
                            <input
                              type="range"
                              min={1}
                              max={24}
                              value={overlay.strength}
                              onChange={event =>
                                editOverlay(index, { strength: Number(event.target.value) })
                              }
                              className="mt-2 block w-full accent-sky-600"
                            />
                          </label>
                        )}

                        {overlay.kind === 'media' && (
                          <label className="mt-3 block text-[11px] font-medium text-gray-500">
                            Description
                            <input
                              value={overlay.alt}
                              onChange={event => editOverlay(index, { alt: event.target.value })}
                              placeholder="Describe this media"
                              className="mt-1 w-full rounded-md border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
                            />
                          </label>
                        )}

                        {overlay.kind === 'callout' && (
                          <div className="mt-3 space-y-3">
                            <label className="block text-[11px] font-medium text-gray-500">
                              Note text
                              <textarea
                                rows={3}
                                maxLength={280}
                                value={overlay.text}
                                onChange={event => editOverlay(index, { text: event.target.value })}
                                className="mt-1 w-full resize-y rounded-md border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
                              />
                              <span className="mt-1 block text-[10px] font-normal text-gray-400">
                                Drag the note itself on the slide to reposition it.
                              </span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[11px] font-medium text-gray-500">
                                Target shape
                                <select
                                  value={overlay.shape}
                                  onChange={event =>
                                    editOverlay(index, {
                                      shape: event.target.value as 'box' | 'circle',
                                    })
                                  }
                                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs"
                                >
                                  <option value="box">Box</option>
                                  <option value="circle">Circle</option>
                                </select>
                              </label>
                              <label className="text-[11px] font-medium text-gray-500">
                                Color
                                <select
                                  value={overlay.color}
                                  onChange={event =>
                                    editOverlay(index, {
                                      color: event.target.value as
                                        | 'pink'
                                        | 'blue'
                                        | 'yellow'
                                        | 'green',
                                    })
                                  }
                                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs"
                                >
                                  <option value="blue">Blue</option>
                                  <option value="pink">Pink</option>
                                  <option value="yellow">Yellow</option>
                                  <option value="green">Green</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                          <button
                            type="button"
                            onClick={() => removeOverlay(index)}
                            className="text-[11px] font-medium text-red-500 hover:text-red-700"
                          >
                            Remove overlay
                          </button>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => moveLayer({ kind: 'overlay', index }, 'back')}
                              className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                            >
                              Send back
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLayer({ kind: 'overlay', index }, 'front')}
                              className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                            >
                              Bring front
                            </button>
                          </div>
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                )
              })}
              {selected.emphasis.map((emphasis, index) => (
                <Popover.Root
                  key={`${selected.id}-box-${index}`}
                  open={
                    selectedEmphasisIndex === index &&
                    !drawMode &&
                    !overlayDrawMode &&
                    !effectPreview
                  }
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
                        setSelectedOverlayIndex(null)
                        setDrawMode(false)
                        setOverlayDrawMode(null)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelectedEmphasisIndex(index)
                          setSelectedOverlayIndex(null)
                          setDrawMode(false)
                          setOverlayDrawMode(null)
                        }
                      }}
                      className={`absolute cursor-move rounded border-2 bg-pink-400/15 ${
                        drawMode || overlayDrawMode || effectPreview
                          ? 'pointer-events-none opacity-0'
                          : ''
                      } ${
                        selectedEmphasisIndex === index
                          ? 'border-pink-600 shadow-[0_0_0_4px_rgba(236,72,153,0.25)]'
                          : 'border-pink-500 shadow-[0_0_0_3px_rgba(236,72,153,0.15)]'
                      }`}
                      style={{
                        zIndex:
                          selectedEmphasisIndex === index
                            ? 1000
                            : 20 + (emphasis.layer ?? selected.overlays.length + index),
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
                        !overlayDrawMode &&
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

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                        <button
                          type="button"
                          onClick={() => removeEmphasis(index)}
                          className="text-[11px] font-medium text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => moveLayer({ kind: 'emphasis', index }, 'back')}
                            className="rounded-md border border-gray-200 px-2 py-1.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Send back
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLayer({ kind: 'emphasis', index }, 'front')}
                            className="rounded-md border border-gray-200 px-2 py-1.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Bring front
                          </button>
                          <button
                            type="button"
                            onClick={() => playEffectPreview()}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800"
                          >
                            Preview effect
                          </button>
                        </div>
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
                  className={`pointer-events-none absolute z-40 rounded border-2 border-dashed ${
                    overlayDrawMode
                      ? 'border-sky-600 bg-sky-400/20'
                      : 'border-pink-600 bg-pink-400/20'
                  }`}
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

          <div className="border-t border-gray-100 pt-4">
            <button
              type="button"
              aria-expanded={layersOpen}
              onClick={() => setLayersOpen(current => !current)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-gray-50"
            >
              <span>
                <span className="block text-xs font-semibold text-gray-700">Slide layers</span>
                <span className="block text-[10px] font-normal text-gray-400">
                  Select covered items and change their order.
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-500">
                  {selected.overlays.length + selected.emphasis.length}
                </span>
                <span className="text-xs text-gray-400">{layersOpen ? '▴' : '▾'}</span>
              </span>
            </button>

            {layersOpen && (
              <div className="mt-2 space-y-1">
                <p className="px-1 pb-1 text-[10px] text-gray-400">Topmost layer first</p>
                {storyboardLayerEntries(selected)
                  .sort((a, b) => b.layer - a.layer)
                  .map(entry => {
                    const item =
                      entry.ref.kind === 'overlay'
                        ? selected.overlays[entry.ref.index]
                        : selected.emphasis[entry.ref.index]
                    if (!item) return null
                    const isSelected =
                      entry.ref.kind === 'overlay'
                        ? selectedOverlayIndex === entry.ref.index
                        : selectedEmphasisIndex === entry.ref.index
                    const label =
                      'style' in item
                        ? `Highlight ${entry.ref.index + 1} · ${item.style}`
                        : `${item.kind === 'media' ? 'GIF / image' : item.kind} ${entry.ref.index + 1}`
                    return (
                      <div
                        key={`${entry.ref.kind}-${entry.ref.index}`}
                        className={`flex items-center gap-1 rounded-lg border p-1 ${
                          isSelected ? 'border-sky-300 bg-sky-50' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            stopEffectPreview()
                            setDrawMode(false)
                            setOverlayDrawMode(null)
                            if (entry.ref.kind === 'overlay') {
                              setSelectedOverlayIndex(entry.ref.index)
                              setSelectedEmphasisIndex(null)
                            } else {
                              setSelectedEmphasisIndex(entry.ref.index)
                              setSelectedOverlayIndex(null)
                            }
                          }}
                          className="min-w-0 flex-1 truncate px-2 py-1 text-left text-[11px] font-medium capitalize text-gray-700"
                        >
                          {label}
                        </button>
                        <button
                          type="button"
                          title="Send to back"
                          aria-label={`Send ${label} to back`}
                          onClick={() => moveLayer(entry.ref, 'back')}
                          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white hover:text-gray-900"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          title="Bring to front"
                          aria-label={`Bring ${label} to front`}
                          onClick={() => moveLayer(entry.ref, 'front')}
                          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white hover:text-gray-900"
                        >
                          ↑
                        </button>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
