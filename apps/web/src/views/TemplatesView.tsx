import { useAuth } from '@clerk/react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../App'
import { CreditChip } from '../components/CreditChip'
import {
  buildSlideHtml,
  GalleryThumb,
  TEMPLATE_CSS,
  TEMPLATE_FONTS,
  TEMPLATES,
  type Template,
} from '../lib/deckTemplateDesigns'
import { createProject } from '../lib/studio-api'
import { describeStudioError } from '../lib/studio-errors'

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

const IconLoader = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="animate-spin"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

const IconChevronDown = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const IconChevronUp = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

interface TemplatesViewProps {
  /** Called whenever the user enters/exits the template detail view */
  onDetailModeChange?: (inDetail: boolean) => void
  /** Receives a function that clears the selected template (the shell's back button calls it) */
  onClearSelectionReady?: (clear: (() => void) | null) => void
}

/**
 * Template gallery. Picking a template and a topic creates a deck project
 * (POST /projects, flow "deck") and opens it in the studio.
 */
export const TemplatesView = ({
  onDetailModeChange,
  onClearSelectionReady,
}: TemplatesViewProps) => {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [headings, setHeadings] = useState<string[]>(Array(20).fill(''))
  const [showHeadings, setShowHeadings] = useState(false)
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0)
  const [previewScale, setPreviewScale] = useState(0.36)
  const previewCarouselRef = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [fullViewOpen, setFullViewOpen] = useState(false)
  const fullViewRef = useRef<HTMLDivElement>(null)
  const [fullViewScale, setFullViewScale] = useState(1)

  // Measure carousel viewport → compute exact scale for 1280×720 virtual slide
  useEffect(() => {
    const el = previewCarouselRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPreviewScale(entry.contentRect.width / 1280)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [selectedTemplate])

  // Measure full-view viewport → scale slide to fit without upscaling beyond 1:1
  useEffect(() => {
    if (!fullViewOpen) return
    const el = fullViewRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setFullViewScale(Math.min(width / 1280, height / 720, 1))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fullViewOpen])

  // Close full-view on Escape
  useEffect(() => {
    if (!fullViewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullViewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullViewOpen])

  // Keep parent header in sync whenever detail mode changes
  const clearSelection = () => {
    setSelectedTemplate(null)
    setPreviewSlideIdx(0)
    setErrors({})
    onDetailModeChange?.(false)
    // The link that opened this template is spent once you have left it, so
    // the back button does not walk straight back into the same form.
    if (params.get('t')) {
      const next = new URLSearchParams(params)
      next.delete('t')
      setParams(next, { replace: true })
    }
  }

  // Expose clearSelection so the shell's back button can trigger it.
  //
  // Registered ONCE, through a ref, rather than on every change of the
  // callback prop. Keyed on the prop it re-fired whenever the parent
  // re-rendered, and since registering sets state in the parent, that was a
  // loop — one an inline arrow up there is enough to start. A ref makes the
  // parent's memoisation an optimisation rather than a correctness condition.
  /** `/templates?t=<id>` opens that template's form directly. */
  const requestedId = params.get('t')
  useEffect(() => {
    if (!requestedId) return
    const wanted = TEMPLATES.find(t => t.id === requestedId)
    if (!wanted) return
    setSelectedTemplate(wanted)
    setPreviewSlideIdx(0)
    onDetailModeChange?.(true)
  }, [requestedId, onDetailModeChange])

  const readyRef = useRef(onClearSelectionReady)
  readyRef.current = onClearSelectionReady
  const clearRef = useRef(clearSelection)
  clearRef.current = clearSelection
  useEffect(() => {
    readyRef.current?.(() => clearRef.current())
    return () => readyRef.current?.(null)
  }, [])

  const wordCount = (text: string) => {
    const clean = text.trim().replace(/\s+/g, ' ')
    return clean === '' ? 0 : clean.split(' ').length
  }

  const currentWords = wordCount(topic)
  const isWordLimitExceeded = currentWords > 30

  const handleHeadingChange = (index: number, val: string) => {
    const next = [...headings]
    next[index] = val
    setHeadings(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTemplate) return

    const errs: Record<string, string> = {}
    if (!topic.trim()) {
      errs.topic = 'Please enter a presentation topic'
    } else if (isWordLimitExceeded) {
      errs.topic = 'Topic cannot exceed 30 words'
    }

    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }

    const jobHeadings = headings
      .slice(0, slideCount)
      .map(h => h.trim())
      .filter(h => h !== '')

    setIsSubmitting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const project = await createProject(token, {
        prompt: topic.trim(),
        options: {
          topic: topic.trim(),
          slideCount,
          headings: jobHeadings,
          template: selectedTemplate.id,
        },
      })
      window.dispatchEvent(new Event('credits-changed'))
      navigate(`/p/${project.id}`)
    } catch (err) {
      toast(describeStudioError(err, 'Could not create the deck'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Iframe-based pixel-perfect preview ───────────────────────────────────────
  // Renders the exact same HTML+CSS used in the real PDF, scaled to fit the card.
  const renderPreviewSlide = (template: Template, idx: number, scale: number) => {
    const slide = template.previewSlides[idx]
    if (!slide) return null

    const slideHtml = buildSlideHtml(template.id, slide)
    const css = TEMPLATE_CSS[template.id] ?? ''
    const googleFonts = TEMPLATE_FONTS[template.id] ?? ''

    const VIRTUAL_W = 1280
    const VIRTUAL_H = 720

    const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${googleFonts}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{width:${VIRTUAL_W}px;height:${VIRTUAL_H}px;overflow:hidden;}
.slide{width:${VIRTUAL_W}px;height:${VIRTUAL_H}px;position:relative;overflow:hidden;}
${css}
</style>
</head>
<body>${slideHtml}</body>
</html>`

    return (
      <div className="w-full h-full relative overflow-hidden">
        <iframe
          srcDoc={doc}
          title={`${template.name} – ${slide.layout}`}
          scrolling="no"
          style={{
            width: VIRTUAL_W,
            height: VIRTUAL_H,
            border: 'none',
            transformOrigin: '0 0',
            transform: `scale(${scale})`,
            display: 'block',
          }}
          sandbox="allow-scripts"
        />
      </div>
    )
  }

  const inputBase =
    'w-full border border-[#dededb] rounded-[10px] px-3.5 py-2.5 text-sm text-[#171615] placeholder-[#9b9893] outline-none focus:ring-2 focus:ring-black/5 focus:border-[#aaa7a2] transition-colors bg-white'
  const inputError = 'border-red-300 focus:ring-red-200 focus:border-red-400'

  if (selectedTemplate) {
    return (
      <div className="min-h-full bg-[#f7f7f5] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="mx-auto w-full max-w-[1160px]">
          {/* Header */}
          <div className="mb-7 flex flex-col items-start justify-between gap-4 border-b border-[#e2e1de] pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#85817c]">
                Template setup
              </p>
              <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.035em] text-[#171615] sm:text-[30px]">
                {selectedTemplate.name}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#706c67]">
                {selectedTemplate.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTemplate.tags.map(t => (
                <span
                  key={t}
                  className="rounded-full border border-[#dededb] bg-white px-2.5 py-1 text-[11px] font-medium text-[#706c67]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Split Preview and Form */}
          <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-12 lg:gap-8">
            {/* Left Column: Premium Preview Carousel */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Live Design Preview
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFullViewOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide hover:text-gray-800 transition-colors cursor-pointer border-none bg-transparent p-0"
                    aria-label="Open full view preview"
                    title="Open full view preview"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h6v6" />
                      <path d="M9 21H3v-6" />
                      <path d="M21 3l-7 7" />
                      <path d="M3 21l7-7" />
                    </svg>
                    Full view
                  </button>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    {previewSlideIdx + 1} / {selectedTemplate.previewSlides.length} layouts
                  </div>
                </div>
              </div>

              {/* Carousel Viewport */}
              <div
                ref={previewCarouselRef}
                className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-gray-200 shadow-md bg-gray-100 relative"
                style={{ userSelect: 'none' }}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight')
                    setPreviewSlideIdx(i => (i + 1) % selectedTemplate.previewSlides.length)
                  if (e.key === 'ArrowLeft')
                    setPreviewSlideIdx(
                      i =>
                        (i - 1 + selectedTemplate.previewSlides.length) %
                        selectedTemplate.previewSlides.length,
                    )
                }}
              >
                {/* Slide strip: all slides side-by-side, translated by active index */}
                <div
                  className="absolute inset-0 flex transition-transform duration-500 ease-in-out"
                  style={{
                    transform: `translateX(-${previewSlideIdx * (100 / selectedTemplate.previewSlides.length)}%)`,
                    width: `${selectedTemplate.previewSlides.length * 100}%`,
                  }}
                >
                  {selectedTemplate.previewSlides.map((_, idx) => (
                    <div
                      key={idx}
                      className="relative shrink-0"
                      style={{ width: `${100 / selectedTemplate.previewSlides.length}%` }}
                    >
                      {renderPreviewSlide(selectedTemplate, idx, previewScale)}
                    </div>
                  ))}
                </div>

                {/* Layout name badge */}
                <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
                  <span
                    className="text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-widest"
                    style={{
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    {selectedTemplate.previewSlides[previewSlideIdx]?.layout}
                  </span>
                </div>

                {/* Prev arrow */}
                {previewSlideIdx > 0 && (
                  <button
                    onClick={() => setPreviewSlideIdx(i => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center border-none outline-none cursor-pointer transition-all duration-200 hover:scale-110"
                    style={{
                      background: 'rgba(0,0,0,0.45)',
                      color: '#fff',
                      backdropFilter: 'blur(4px)',
                    }}
                    aria-label="Previous layout"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}

                {/* Next arrow */}
                {previewSlideIdx < selectedTemplate.previewSlides.length - 1 && (
                  <button
                    onClick={() => setPreviewSlideIdx(i => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center border-none outline-none cursor-pointer transition-all duration-200 hover:scale-110"
                    style={{
                      background: 'rgba(0,0,0,0.45)',
                      color: '#fff',
                      backdropFilter: 'blur(4px)',
                    }}
                    aria-label="Next layout"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Pill dot indicators */}
              <div className="flex items-center justify-center gap-1.5">
                {selectedTemplate.previewSlides.map((slide, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPreviewSlideIdx(idx)}
                    title={slide.layout}
                    className={`transition-all duration-300 border-none outline-none cursor-pointer rounded-full ${
                      previewSlideIdx === idx
                        ? 'w-5 h-2 bg-gray-900'
                        : 'w-2 h-2 bg-gray-300 hover:bg-gray-500'
                    }`}
                  />
                ))}
              </div>

              {/* Specs Panel */}
              <div className="mt-1 rounded-[14px] border border-[#dededb] bg-white p-4">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#85817c]">
                  Style Specifications
                </div>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                  <div>
                    <span className="text-gray-400 block mb-0.5">Background color</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded border border-gray-300"
                        style={{ backgroundColor: selectedTemplate.theme.bg }}
                      ></span>
                      <span className="font-mono text-gray-800">{selectedTemplate.theme.bg}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Primary Accent</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded border border-gray-300"
                        style={{ backgroundColor: selectedTemplate.theme.primary }}
                      ></span>
                      <span className="font-mono text-gray-800">
                        {selectedTemplate.theme.primary}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Typography stack</span>
                    <span className="font-semibold text-gray-800">
                      {selectedTemplate.theme.fonts}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Image Rendering</span>
                    <span className="font-semibold text-gray-800">
                      {selectedTemplate.theme.imageMode}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Generation Form */}
            <div className="lg:col-span-7">
              <form
                onSubmit={handleSubmit}
                className="space-y-6 rounded-[16px] border border-[#dededb] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)] sm:p-6"
              >
                {/* Topic Section */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <span className="text-red-500">*</span>Presentation Topic / Prompt
                    </label>
                    <span
                      className={`text-xs font-semibold ${isWordLimitExceeded ? 'text-red-500' : 'text-gray-400'}`}
                    >
                      {currentWords} / 30 words
                    </span>
                  </div>
                  <textarea
                    id="template-topic-input"
                    rows={3}
                    className={`${inputBase} resize-none ${errors.topic || isWordLimitExceeded ? inputError : ''}`}
                    placeholder={`e.g. AI-driven newspapers in 2026: How digital journalism utilizes automated layout nodes and halftone filters to revive classic prints.`}
                    value={topic}
                    onChange={e => {
                      setTopic(e.target.value)
                      setErrors(prev => {
                        const next = { ...prev }
                        delete next.topic
                        return next
                      })
                    }}
                  />
                  {errors.topic && <p className="text-xs text-red-500 mt-1">{errors.topic}</p>}
                </div>

                {/* Slide Count */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                    Slide Count (5 to 20 slides)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={5}
                      max={20}
                      value={slideCount}
                      onChange={e => setSlideCount(parseInt(e.target.value, 10))}
                      className="flex-1 accent-gray-900 cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none"
                    />
                    <span className="text-sm font-bold text-gray-900 w-16 text-right shrink-0">
                      {slideCount} slides
                    </span>
                  </div>
                </div>

                {/* Collapsible Slide Headings */}
                <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                  <button
                    type="button"
                    onClick={() => setShowHeadings(!showHeadings)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors border-none outline-none bg-transparent cursor-pointer"
                  >
                    <span>Custom Slide Headings (Optional)</span>
                    <span>{showHeadings ? <IconChevronUp /> : <IconChevronDown />}</span>
                  </button>

                  {showHeadings && (
                    <div className="mt-4 space-y-3 max-h-56 overflow-y-auto pr-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <p className="text-xs text-gray-400 mb-2">
                        Leave blank to let AI automatically generate headings for those slides.
                      </p>
                      {Array.from({ length: slideCount }, (_, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-gray-400 w-16 select-none shrink-0">
                            Slide {idx + 1}:
                          </span>
                          <input
                            type="text"
                            className={inputBase}
                            placeholder={`e.g. Slide ${idx + 1} Heading`}
                            value={headings[idx]}
                            onChange={e => handleHeadingChange(idx, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || isWordLimitExceeded}
                    id="generate-template-pdf-btn"
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-[#171615] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? <IconLoader /> : <IconPlay />}
                    {isSubmitting ? 'Creating deck…' : 'Create deck in studio'}
                    {!isSubmitting && <CreditChip amount={1} className="bg-white text-gray-900" />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Full-view preview modal */}
        {fullViewOpen && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 sm:p-8"
            onClick={e => {
              if (e.target === e.currentTarget) setFullViewOpen(false)
            }}
          >
            <button
              type="button"
              onClick={() => setFullViewOpen(false)}
              className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border-none bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
              aria-label="Close full view"
              title="Close full view"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div
              ref={fullViewRef}
              className="relative w-full max-w-[1280px] aspect-[16/9] max-h-[80vh]"
            >
              {renderPreviewSlide(selectedTemplate, previewSlideIdx, fullViewScale)}

              {/* Full-view prev arrow */}
              {previewSlideIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setPreviewSlideIdx(i => i - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center border-none outline-none cursor-pointer transition-all duration-200 hover:scale-110"
                  style={{
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                  }}
                  aria-label="Previous layout"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}

              {/* Full-view next arrow */}
              {previewSlideIdx < selectedTemplate.previewSlides.length - 1 && (
                <button
                  type="button"
                  onClick={() => setPreviewSlideIdx(i => i + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center border-none outline-none cursor-pointer transition-all duration-200 hover:scale-110"
                  style={{
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                  }}
                  aria-label="Next layout"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3 text-white/80">
              <span className="text-xs font-medium">
                {previewSlideIdx + 1} / {selectedTemplate.previewSlides.length} layouts
              </span>
              <span className="text-xs text-white/50">·</span>
              <span className="text-xs text-white/70">
                {selectedTemplate.previewSlides[previewSlideIdx]?.layout}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#f7f7f5] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1160px]">
        {/* Page Heading */}
        <div className="mb-7 flex flex-col justify-between gap-5 border-b border-[#e2e1de] pb-7 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#85817c]">
              Presentation templates
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#171615] sm:text-[34px]">
              Start with a visual point of view.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#706c67]">
              Pick a design direction, add your topic, and let the Pitch agent build the deck in
              your studio. You can refine every slide in chat afterward.
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-[#dededb] bg-white px-3 py-1.5 text-xs text-[#706c67]">
            {TEMPLATES.length} curated styles
          </div>
        </div>

        {/* Grid of Templates */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TEMPLATES.map(template => (
            <button
              type="button"
              key={template.id}
              onClick={() => {
                setSelectedTemplate(template)
                onDetailModeChange?.(true)
              }}
              className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[14px] border border-[#dededb] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.025)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#aaa7a2] hover:shadow-[0_10px_30px_rgba(0,0,0,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            >
              {/* Template Card Mini-Deck Screen */}
              <div className="relative aspect-[16/10] overflow-hidden border-b border-[#e7e6e3] bg-[#efefed]">
                <GalleryThumb template={template} />
              </div>

              {/* Template Info */}
              <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-[#171615]">
                    {template.name}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-[#77736e]">
                    {template.description}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1 border-t border-[#ecebe8] pt-3">
                  {template.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[10px] font-medium text-[#77736e]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
