import type React from 'react'
import { useState } from 'react'
import { CreditChip } from '../components/CreditChip'

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

const IconBack = () => (
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
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

interface Template {
  id: string
  name: string
  description: string
  tags: string[]
  theme: {
    bg: string
    primary: string
    accent: string
    secondary: string
    fonts: string
    imageMode: string
  }
  previewSlides: Array<{
    id: number
    title: string
    subtitle?: string
    body?: string
    bullets?: string[]
    stats?: Array<{ value: string; label: string }>
    layout: string
  }>
}

const TEMPLATES: Template[] = [
  {
    id: 'BRUTALIST_NEWSPAPER',
    name: 'Brutalist AI Newspaper 2026',
    description: 'High-contrast editorial style inspired by modern brutalist aesthetics and retro-futuristic news layouts. Uses vintage paper texture, strict black/red highlights, halftone photo filters, and thick borders.',
    tags: ['Brutalist', 'Editorial', 'Bold', 'Retro-Futuristic'],
    theme: {
      bg: '#F3EFE0',
      primary: '#CC2222',
      accent: '#111111',
      secondary: '#444444',
      fonts: 'IBM Plex Serif + Oswald + Courier',
      imageMode: 'Grayscale Halftone Contrast',
    },
    previewSlides: [
      {
        id: 1,
        title: 'THE AI REVOLUTION',
        subtitle: 'HOW GENERATIVE MODELS ARE REDEFINING AESTHETICS IN 2026',
        layout: 'NEWSPAPER-COVER',
      },
      {
        id: 2,
        title: 'CHRONICLES & CORNERS',
        bullets: [
          'Halftone image filtering for high contrast',
          'Thick grid lines and strict layout divisions',
          'Monospaced labels paired with serif headlines',
        ],
        layout: 'GLANCE',
      },
      {
        id: 3,
        title: 'STATISTICAL BULLETINS',
        stats: [
          { value: '94%', label: 'Retention Rate' },
          { value: '2.4x', label: 'Growth Speed' },
        ],
        layout: 'DATA-TABLE',
      },
    ],
  },
  {
    id: 'MINIMAL_CORPORATE',
    name: 'Minimal Corporate',
    description: 'Sleek, high-end corporate presentation template with a light color scheme, geometric sans-serif fonts, thin elegant borders, and clean data callouts.',
    tags: ['Clean', 'Professional', 'Corporate', 'Minimalist'],
    theme: {
      bg: '#F8F9FA',
      primary: '#004080',
      accent: '#1A1A1A',
      secondary: '#555555',
      fonts: 'Montserrat + Inter',
      imageMode: 'Natural Soft Light Stock',
    },
    previewSlides: [
      {
        id: 1,
        title: 'STRATEGIC INITIATIVE',
        subtitle: 'Annual Growth Plan and Market Analysis',
        layout: 'COVER',
      },
      {
        id: 2,
        title: 'OUR CORE OBJECTIVES',
        bullets: [
          'Focus on sustainable, carbon-neutral supply chain systems.',
          'Leverage edge computing capabilities for global telemetry data.',
          'Deliver seamless micro-service performance indicators.',
        ],
        layout: 'BRIEF-EXPLAIN',
      },
      {
        id: 3,
        title: 'ANNUAL PERFORMANCE METRICS',
        stats: [
          { value: '+45%', label: 'Year-Over-Year Revenue' },
          { value: '< 10ms', label: 'API Response Latency' },
        ],
        layout: 'METRIC-ROW',
      },
    ],
  },
  {
    id: 'DARK_TECH',
    name: 'Dark Tech / Neon Glow',
    description: 'Sophisticated dark theme with neon cyan and green accents, glowing border lines, and modern tech sans fonts. Best for AI, SaaS, and cybersecurity.',
    tags: ['Dark Mode', 'Technology', 'Cybersecurity', 'SaaS'],
    theme: {
      bg: '#0F172A',
      primary: '#06B6D4',
      accent: '#10B981',
      secondary: '#94A3B8',
      fonts: 'Share Tech Mono + JetBrains Mono',
      imageMode: 'Cyan Hue High-Contrast Tint',
    },
    previewSlides: [
      {
        id: 1,
        title: 'CYBER INFRASTRUCTURE',
        subtitle: 'Security and AI Ops Dashboard',
        layout: 'TECH-COVER',
      },
      {
        id: 2,
        title: 'LOGICAL NODE ANALYSIS',
        bullets: [
          'Realtime tracing across all microservice instances.',
          'Anomaly scoring powered by local clustering algorithms.',
          'Active threat mitigation triggers upon token decay.',
        ],
        layout: 'DASHBOARD-GLANCE',
      },
      {
        id: 3,
        title: 'SYSTEM TELEMETRY SUMMARY',
        stats: [
          { value: '99.99%', label: 'System Uptime Rate' },
          { value: '42ms', label: 'Mean Mitigation Time' },
        ],
        layout: 'METRIC-GLOW',
      },
    ],
  },
]

interface TemplatesViewProps {
  isSubmitting: boolean
  onQueuePdfJob: (values: {
    topic: string
    slideCount: number
    slideHeadings: string[]
    template: string
  }) => Promise<void>
}

export const TemplatesView = ({ isSubmitting, onQueuePdfJob }: TemplatesViewProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [headings, setHeadings] = useState<string[]>(Array(20).fill(''))
  const [showHeadings, setShowHeadings] = useState(false)
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})

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

    await onQueuePdfJob({
      topic: topic.trim(),
      slideCount,
      slideHeadings: jobHeadings,
      template: selectedTemplate.id,
    })
  }

  const renderMiniPreviewSlide = (template: Template, idx: number) => {
    const slide = template.previewSlides[idx]
    if (!slide) return null

    if (template.id === 'BRUTALIST_NEWSPAPER') {
      return (
        <div
          className="w-full h-full relative overflow-hidden flex flex-col p-8 border-3 border-gray-950 font-serif select-none"
          style={{ backgroundColor: '#F3EFE0', color: '#111111' }}
        >
          {/* Header */}
          <div className="flex justify-between border-b border-gray-950 text-[8px] font-mono font-bold pb-1 mb-2 uppercase tracking-wide">
            <span>VOL. CXXVI... No. 42,910</span>
            <span>THE DAILY FORECAST</span>
            <span>PRICE $1.50</span>
          </div>

          {slide.layout === 'NEWSPAPER-COVER' && (
            <div className="flex-1 flex flex-col justify-center">
              <div className="border-b-4 border-double border-gray-950 pb-2 mb-3">
                <h3 className="text-2xl md:text-3xl font-extrabold tracking-tighter text-center font-sans leading-none uppercase">
                  {slide.title}
                </h3>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-[10px] md:text-xs italic leading-tight font-serif text-gray-800">
                    {slide.subtitle}
                  </p>
                  <div className="text-[7px] font-mono font-bold border-t border-gray-950 pt-2 mt-2 uppercase">
                    Reported by AI Agent
                  </div>
                </div>
                <div className="w-1/3 aspect-[4/3] bg-[#EAE6D5] border border-gray-950 flex items-center justify-center text-[8px] font-mono text-gray-500">
                  [PHOTO_HLFTONE]
                </div>
              </div>
            </div>
          )}

          {slide.layout === 'GLANCE' && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <span className="inline-block text-[7px] font-mono font-bold border border-gray-950 px-1 py-0.5 bg-[#CC2222] text-[#F3EFE0] mb-2 uppercase">
                  AT A GLANCE
                </span>
                <h4 className="text-sm font-bold border-b border-gray-950 pb-1 mb-2">
                  {slide.title}
                </h4>
              </div>
              <div className="flex gap-4 flex-1">
                <div className="w-1/3 bg-[#EAE6D5] border border-gray-950 flex items-center justify-center text-[8px] font-mono text-gray-500">
                  [NEWS_GRAIN]
                </div>
                <div className="flex-1">
                  <ul className="space-y-1.5">
                    {slide.bullets?.map((b, i) => (
                      <li key={i} className="text-[9px] leading-snug flex items-start gap-1 font-serif text-gray-900">
                        <span className="text-[#CC2222] text-[7px] translate-y-[2px]">◆</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {slide.layout === 'DATA-TABLE' && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <span className="inline-block text-[7px] font-mono font-bold border border-gray-950 px-1 py-0.5 bg-[#CC2222] text-[#F3EFE0] mb-2 uppercase">
                  STATISTICAL BULLETIN
                </span>
                <h4 className="text-sm font-bold border-b border-gray-950 pb-1 mb-2">
                  {slide.title}
                </h4>
              </div>
              <div className="flex flex-col border-t border-gray-950 flex-1 justify-around">
                {slide.stats?.map((s, i) => (
                  <div key={i} className="flex border-b border-gray-950/60 pb-1 items-center">
                    <div className="w-1/3 text-lg font-black font-sans text-[#CC2222] tracking-tighter border-r border-gray-950/60 pr-2">
                      {s.value}
                    </div>
                    <div className="flex-1 pl-2 text-[9px] font-bold text-gray-950">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    if (template.id === 'MINIMAL_CORPORATE') {
      return (
        <div
          className="w-full h-full relative overflow-hidden flex flex-col p-8 border border-gray-200 select-none font-sans"
          style={{ backgroundColor: '#F8F9FA', color: '#555555' }}
        >
          {/* Top Line accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#004080]"></div>

          {slide.layout === 'COVER' && (
            <div className="flex-1 flex flex-col justify-center items-center text-center">
              <h3 className="text-xl md:text-2xl font-bold tracking-tight text-gray-900 leading-tight">
                {slide.title}
              </h3>
              <p className="text-xs text-gray-500 mt-2 font-normal">
                {slide.subtitle}
              </p>
              <div className="absolute bottom-6 text-[8px] tracking-wider text-gray-400 font-semibold uppercase">
                Annual Corporate Brief
              </div>
            </div>
          )}

          {slide.layout === 'BRIEF-EXPLAIN' && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <span className="inline-block text-[8px] font-bold tracking-wider text-[#004080] bg-[#004080]/10 px-1.5 py-0.5 rounded mb-1.5 uppercase">
                  OVERVIEW
                </span>
                <h4 className="text-sm font-bold text-gray-950 leading-tight">
                  {slide.title}
                </h4>
              </div>
              <div className="flex gap-4 flex-1 items-center mt-2">
                <div className="flex-1">
                  <ul className="space-y-1.5">
                    {slide.bullets?.map((b, i) => (
                      <li key={i} className="text-[9px] leading-normal flex items-start gap-1.5 text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#004080] shrink-0 mt-[4px]"></span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="w-1/3 aspect-[4/3] rounded bg-white border border-gray-200 flex items-center justify-center text-[8px] text-gray-400">
                  [STOCK_IMAGE]
                </div>
              </div>
            </div>
          )}

          {slide.layout === 'METRIC-ROW' && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <span className="inline-block text-[8px] font-bold tracking-wider text-[#004080] bg-[#004080]/10 px-1.5 py-0.5 rounded mb-1.5 uppercase">
                  KEY METRICS
                </span>
                <h4 className="text-sm font-bold text-gray-950 leading-tight">
                  {slide.title}
                </h4>
              </div>
              <div className="flex gap-3 flex-1 items-center mt-2">
                {slide.stats?.map((s, i) => (
                  <div key={i} className="flex-1 bg-white border border-gray-200 p-2.5 rounded shadow-sm">
                    <div className="text-lg font-bold text-[#004080] leading-none">
                      {s.value}
                    </div>
                    <div className="text-[8px] font-bold text-gray-800 mt-1">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    if (template.id === 'DARK_TECH') {
      return (
        <div
          className="w-full h-full relative overflow-hidden flex flex-col p-8 border border-slate-800 select-none font-mono"
          style={{ backgroundColor: '#0F172A', color: '#94A3B8' }}
        >
          {/* Tech Grid Background Lines */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(to right, #06B6D4 1px, transparent 1px), linear-gradient(to bottom, #06B6D4 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          ></div>

          {slide.layout === 'TECH-COVER' && (
            <div className="flex-1 flex flex-col justify-center z-10">
              <div className="text-[#06B6D4] text-[8px] tracking-widest uppercase mb-1.5">
                [ SYSTEM INTAKE ACTIVE ]
              </div>
              <h3 className="text-lg md:text-xl font-bold tracking-tight text-white leading-tight">
                {slide.title}
              </h3>
              <p className="text-[9px] text-[#10B981] mt-2">
                &gt; {slide.subtitle}
              </p>
              <div className="absolute bottom-6 text-[8px] text-slate-600">
                HOST: AGENT_SYSTEM // TIMESTAMP: 2026
              </div>
            </div>
          )}

          {slide.layout === 'DASHBOARD-GLANCE' && (
            <div className="flex-1 flex flex-col justify-between z-10">
              <div>
                <span className="inline-block text-[8px] border border-dashed border-[#06B6D4] text-[#06B6D4] px-1.5 py-0.5 rounded mb-1.5">
                  SYS.OVERVIEW
                </span>
                <h4 className="text-xs font-bold text-white uppercase">
                  // {slide.title}
                </h4>
              </div>
              <div className="flex gap-3 flex-1 items-center mt-2">
                <div className="w-1/3 aspect-[4/3] rounded border border-slate-700 bg-slate-900 flex items-center justify-center text-[7px] text-slate-500">
                  [CYAN_TINT]
                </div>
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded p-2.5 flex flex-col">
                  <div className="flex gap-1 mb-1.5 border-b border-slate-900 pb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                  </div>
                  <ul className="space-y-1.5">
                    {slide.bullets?.map((b, i) => (
                      <li key={i} className="text-[8px] leading-snug flex items-start gap-1 text-slate-400">
                        <span className="text-[#10B981] font-bold">&gt;</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {slide.layout === 'METRIC-GLOW' && (
            <div className="flex-1 flex flex-col justify-between z-10">
              <div>
                <span className="inline-block text-[8px] border border-dashed border-[#06B6D4] text-[#06B6D4] px-1.5 py-0.5 rounded mb-1.5">
                  SYS.TELEMETRY
                </span>
                <h4 className="text-xs font-bold text-white uppercase">
                  // {slide.title}
                </h4>
              </div>
              <div className="flex gap-3 flex-1 items-center mt-2">
                {slide.stats?.map((s, i) => (
                  <div key={i} className="flex-1 bg-slate-800/80 border border-slate-700 p-2.5 rounded relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#06B6D4]"></div>
                    <div className="text-base font-bold text-[#06B6D4] leading-none">
                      {s.value}
                    </div>
                    <div className="text-[7px] font-bold text-white mt-1.5 uppercase">
                      &lt; {s.label} &gt;
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  const inputBase =
    'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white'
  const inputError = 'border-red-300 focus:ring-red-200 focus:border-red-400'

  if (selectedTemplate) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto w-full">
        {/* Back Link */}
        <button
          onClick={() => {
            setSelectedTemplate(null)
            setPreviewSlideIdx(0)
            setErrors({})
          }}
          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors bg-transparent border-none outline-none cursor-pointer mb-6"
        >
          <IconBack />
          <span>Back to Templates Gallery</span>
        </button>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
              {selectedTemplate.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              {selectedTemplate.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedTemplate.tags.map(t => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Split Preview and Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Premium Preview Card */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Live Design Preview
            </div>
            <div className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-gray-200 shadow-md bg-gray-100 relative group">
              {renderMiniPreviewSlide(selectedTemplate, previewSlideIdx)}
            </div>

            {/* Slider Dots/Controls */}
            <div className="flex items-center justify-between px-1">
              <div className="flex gap-1.5">
                {selectedTemplate.previewSlides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPreviewSlideIdx(idx)}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 border-none outline-none cursor-pointer ${
                      previewSlideIdx === idx ? 'bg-gray-900 scale-125' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    title={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
              <div className="text-[11px] font-bold text-gray-400 uppercase">
                Slide {previewSlideIdx + 1} of {selectedTemplate.previewSlides.length}
              </div>
            </div>

            {/* Specs Panel */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mt-2">
              <div className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
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
                    <span className="font-mono text-gray-800">{selectedTemplate.theme.primary}</span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Typography stack</span>
                  <span className="font-semibold text-gray-800">{selectedTemplate.theme.fonts}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Image Rendering</span>
                  <span className="font-semibold text-gray-800">{selectedTemplate.theme.imageMode}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Generation Form */}
          <div className="lg:col-span-7">
            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
              {/* Topic Section */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <span className="text-red-500">*</span>Presentation Topic / Prompt
                  </label>
                  <span className={`text-xs font-semibold ${isWordLimitExceeded ? 'text-red-500' : 'text-gray-400'}`}>
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
                  className="w-full flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 flex items-center justify-center border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <IconLoader /> : <IconPlay />}
                  {isSubmitting ? 'Queuing PDF Generation…' : 'Generate Premium Presentation'}
                  {!isSubmitting && <CreditChip amount={1} className="bg-white text-gray-900" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      {/* Page Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
          Premium Style Gallery
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Select a pre-designed premium template preset below to lock in the visual identity. The AI
          agent will write and build your deck using the exact styling and constraints of that design.
        </p>
      </div>

      {/* Grid of Templates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TEMPLATES.map(template => (
          <div
            key={template.id}
            onClick={() => setSelectedTemplate(template)}
            className="group cursor-pointer bg-white border border-gray-200 hover:border-gray-950 hover:shadow-lg transition-all duration-300 rounded-xl overflow-hidden flex flex-col h-full hover:-translate-y-0.5"
          >
            {/* Template Card Mini-Deck Screen */}
            <div className="aspect-[16/10] bg-gray-100 border-b border-gray-100 overflow-hidden relative p-4 flex items-center justify-center">
              <div className="w-full h-full scale-[0.95] group-hover:scale-[1.0] transition-transform duration-500 rounded shadow-sm overflow-hidden">
                {renderMiniPreviewSlide(template, 0)}
              </div>
            </div>

            {/* Template Info */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-950 uppercase group-hover:text-gray-900 transition-colors">
                  {template.name}
                </h3>
                <p className="text-xs text-gray-500 line-clamp-3 mt-2 leading-relaxed">
                  {template.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1">
                {template.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] bg-gray-50 text-gray-500 font-medium px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
