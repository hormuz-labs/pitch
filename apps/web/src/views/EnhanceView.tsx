import type React from 'react'
import { useCallback, useRef, useState } from 'react'
import { CreditChip } from '../components/CreditChip'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconUpload = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)
const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconLoader = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)
const IconSparkle = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.5L12 17.1l-6.2 4.5 2.4-7.5L2 9.6h7.6L12 2z" />
  </svg>
)
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

// ── Mode selector card ────────────────────────────────────────────────────────
const ModeCard = ({
  id,
  selected,
  icon,
  title,
  description,
  badge,
  onSelect,
}: {
  id: string
  selected: boolean
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  onSelect: () => void
}) => (
  <button
    type="button"
    id={`mode-${id}`}
    onClick={onSelect}
    className={`relative flex-1 text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer outline-none group ${
      selected
        ? 'border-gray-900 bg-gray-900 text-white shadow-lg'
        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:shadow-sm'
    }`}
  >
    {badge && (
      <span className={`absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${selected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
        {badge}
      </span>
    )}
    <div className={`mb-2 ${selected ? 'text-white' : 'text-gray-400'}`}>{icon}</div>
    <div className={`font-bold text-sm mb-1 ${selected ? 'text-white' : 'text-gray-800'}`}>{title}</div>
    <div className={`text-xs leading-relaxed ${selected ? 'text-white/70' : 'text-gray-500'}`}>{description}</div>
    {selected && (
      <span className="absolute top-3 left-3 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
        <IconCheck />
      </span>
    )}
  </button>
)

// ── Main view ─────────────────────────────────────────────────────────────────
export interface EnhanceViewProps {
  isSubmitting: boolean
  onQueueEnhanceJob: (formData: FormData) => Promise<void>
}

const MAX_FILE_MB = 50
const ALLOWED_EXTS = ['.pdf', '.pptx']

export const EnhanceView = ({ isSubmitting, onQueueEnhanceJob }: EnhanceViewProps) => {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'recreate' | 'preserve'>('recreate')
  const [prompt, setPrompt] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (f: File): string | null => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) return `Unsupported file type. Please upload a .pdf or .pptx file.`
    if (f.size > MAX_FILE_MB * 1024 * 1024) return `File too large. Maximum size is ${MAX_FILE_MB} MB.`
    return null
  }

  const acceptFile = (f: File) => {
    const err = validateFile(f)
    if (err) { setError(err); return }
    setError(null)
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) acceptFile(dropped)
  }, [])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) acceptFile(f)
    e.target.value = ''
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('Please select a file to enhance.'); return }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    fd.append('enhancePrompt', prompt.trim() || 'Enhance and modernize this presentation.')
    await onQueueEnhanceJob(fd)
  }

  const inputBase = 'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white resize-none'

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-400">
            <IconSparkle />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Enhance Presentation</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Upload your existing PDF or PowerPoint deck and our AI will transform it — polishing content, refreshing visuals, and applying a premium design.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm" id="enhance-form">

        {/* ── File Drop Zone ── */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <span className="text-red-500 text-xs">*</span>
            Upload Presentation
          </label>

          {!file ? (
            <div
              id="enhance-dropzone"
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl px-6 py-10 cursor-pointer transition-all duration-200 select-none ${
                dragOver
                  ? 'border-gray-700 bg-gray-50 scale-[1.01]'
                  : error
                  ? 'border-red-300 bg-red-50/40'
                  : 'border-gray-200 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${dragOver ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                <IconUpload />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">
                  {dragOver ? 'Drop to upload' : 'Drag & drop your file here'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">or <span className="text-gray-700 font-semibold underline underline-offset-2">browse files</span></p>
              </div>
              <p className="text-xs text-gray-400">
                Supports <strong className="text-gray-600">.pdf</strong> and <strong className="text-gray-600">.pptx</strong> · Max {MAX_FILE_MB} MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.pptx"
                className="sr-only"
                onChange={onInputChange}
                id="enhance-file-input"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-gray-50 group">
              <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                <IconFile />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); setError(null) }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors cursor-pointer"
                title="Remove file"
              >
                <IconX />
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>

        {/* ── Enhancement Mode ── */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
            <span className="text-red-500 text-xs">*</span>
            Enhancement Mode
          </label>
          <div className="flex gap-3">
            <ModeCard
              id="recreate"
              selected={mode === 'recreate'}
              onSelect={() => setMode('recreate')}
              badge="Full Redesign"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              }
              title="Full Recreate"
              description="Discard the old design. Get a completely fresh layout, premium color palette, and all-new Unsplash imagery."
            />
            <ModeCard
              id="preserve"
              selected={mode === 'preserve'}
              onSelect={() => setMode('preserve')}
              badge="Keep Structure"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              }
              title="Preserve Format"
              description="Keep the original slide structure and your embedded images. We polish the text, fix contrast, and refine the layout."
            />
          </div>
        </div>

        {/* ── Enhancement Prompt ── */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5" htmlFor="enhance-prompt">
            Enhancement Instructions
            <span className="text-[11px] font-normal text-gray-400 ml-1">(optional)</span>
          </label>
          <textarea
            id="enhance-prompt"
            rows={3}
            className={inputBase}
            placeholder={
              mode === 'recreate'
                ? 'e.g. Redesign as a dark-tech startup pitch with growth charts and bold typography.'
                : 'e.g. Make the bullets more concise and professional. Add a statistics slide.'
            }
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Tell the AI what to focus on — tone, style, sections to improve, or anything specific.
          </p>
        </div>

        {/* ── Preview of what will happen ── */}
        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">What will happen</p>
          <div className="space-y-2">
            {(mode === 'recreate'
              ? [
                  '📄 Your slides will be parsed and all text extracted',
                  '🔍 The AI will research your topic for fresh data & statistics',
                  '🎨 A premium brand palette and typography will be chosen',
                  '🖼️ High-res Unsplash images will be fetched per slide',
                  '🏗️ A completely new PDF will be rendered at 1280×720',
                ]
              : [
                  '📄 Your slides will be parsed and text extracted',
                  '🖼️ Embedded images from your file will be preserved',
                  '✏️ All slide content will be rewritten and polished',
                  '🎨 Layout and contrast will be refined for readability',
                  '🏗️ A new PDF will be rendered preserving your structure',
                ]
            ).map(step => (
              <div key={step} className="flex items-start gap-2 text-xs text-gray-600">
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={isSubmitting || !file}
            id="enhance-submit-btn"
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5"
          >
            {isSubmitting ? <IconLoader /> : <IconSparkle />}
            {isSubmitting ? 'Queuing Enhancement…' : 'Enhance Presentation'}
            {!isSubmitting && <CreditChip amount={1} className="bg-white text-gray-900" />}
          </button>
          {!file && (
            <p className="text-xs text-gray-400 mt-2">Upload a file above to get started.</p>
          )}
        </div>
      </form>
    </div>
  )
}
