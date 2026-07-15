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
const IconVideo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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
const IconScissors = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

// ── Main view ─────────────────────────────────────────────────────────────────
export interface EditRecordingViewProps {
  isSubmitting: boolean
  onQueueEditJob: (formData: FormData) => Promise<void>
}

const MAX_FILE_MB = 500
const ALLOWED_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.avi']

export const EditRecordingView = ({ isSubmitting, onQueueEditJob }: EditRecordingViewProps) => {
  const [file, setFile] = useState<File | null>(null)
  const [productName, setProductName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (f: File): string | null => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) return `Unsupported file type. Please upload a video (${ALLOWED_EXTS.join(', ')}).`
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
    if (!file) { setError('Please select a recording to edit.'); return }

    const fd = new FormData()
    fd.append('file', file)
    if (productName.trim()) fd.append('productName', productName.trim())
    if (productUrl.trim()) fd.append('productUrl', productUrl.trim())
    if (instructions.trim()) fd.append('instructions', instructions.trim())
    await onQueueEditJob(fd)
  }

  const inputBase = 'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white resize-none'

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-400">
            <IconScissors />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Edit My Recording</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Upload a narrated screen recording and our AI will re-cut it into a cinematic product demo —
          camera zooms on every key action, dead air trimmed, intro &amp; outro cards added. Your original voiceover is kept.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm" id="edit-form">

        {/* ── File Drop Zone ── */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <span className="text-red-500 text-xs">*</span>
            Upload Recording
          </label>

          {!file ? (
            <div
              id="edit-dropzone"
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
                  {dragOver ? 'Drop to upload' : 'Drag & drop your recording here'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">or <span className="text-gray-700 font-semibold underline underline-offset-2">browse files</span></p>
              </div>
              <p className="text-xs text-gray-400">
                Supports <strong className="text-gray-600">.mp4</strong>, <strong className="text-gray-600">.webm</strong>, <strong className="text-gray-600">.mov</strong>, <strong className="text-gray-600">.mkv</strong> · Max {MAX_FILE_MB} MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.webm,.mov,.mkv,.avi,video/*"
                className="sr-only"
                onChange={onInputChange}
                id="edit-file-input"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-gray-50 group">
              <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                <IconVideo />
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

        {/* ── Product details ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5" htmlFor="edit-product-name">
              Product Name
              <span className="text-[11px] font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <input
              id="edit-product-name"
              type="text"
              className={inputBase}
              placeholder="e.g. MealPe"
              value={productName}
              onChange={e => setProductName(e.target.value)}
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5" htmlFor="edit-product-url">
              Product URL
              <span className="text-[11px] font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <input
              id="edit-product-url"
              type="text"
              className={inputBase}
              placeholder="e.g. https://mealpe.app"
              value={productUrl}
              onChange={e => setProductUrl(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-4">Shown on the intro &amp; outro cards. Falls back to the file name.</p>

        {/* ── Instructions ── */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5" htmlFor="edit-instructions">
            Editing Instructions
            <span className="text-[11px] font-normal text-gray-400 ml-1">(optional)</span>
          </label>
          <textarea
            id="edit-instructions"
            rows={3}
            className={inputBase}
            placeholder="e.g. Emphasize the onboarding flow, skip the settings page, keep it under a minute."
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
          />
        </div>

        {/* ── Preview of what will happen ── */}
        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">What will happen</p>
          <div className="space-y-2">
            {[
              '🎙️ Your narration is transcribed locally (Whisper) with word-level timestamps',
              '🎬 The AI correlates what you said with what changed on screen to find every key action',
              '🔍 Gemini Vision verifies each moment and pinpoints where to zoom',
              '📹 A cinematic camera pans & zooms through your actions — dead air trimmed away',
              '🃏 Intro & outro cards added, your original voiceover kept in sync',
            ].map(step => (
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
            id="edit-submit-btn"
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5"
          >
            {isSubmitting ? <IconLoader /> : <IconScissors />}
            {isSubmitting ? 'Queuing Edit…' : 'Edit Recording'}
            {!isSubmitting && <CreditChip amount={2} className="bg-white text-gray-900" />}
          </button>
          {!file && (
            <p className="text-xs text-gray-400 mt-2">Upload a recording above to get started.</p>
          )}
        </div>
      </form>
    </div>
  )
}
