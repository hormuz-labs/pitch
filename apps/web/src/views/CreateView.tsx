import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ContainerTextFlip } from '../components/ContainerTextFlip'
import { CreditChip } from '../components/CreditChip'
import { PlaceholdersAndVanishInput } from '../components/PlaceholdersAndVanishInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/Select'
import { WaveformScrub } from '../components/WaveformScrub'
import { useBrowserProfile } from '../hooks/useBrowserProfile'
import { hostOf, isAuthenticatedFor, prettyHost } from '../lib/authOrigins'

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
const IconInfo = () => (
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
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
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
/*
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
*/
const IconShieldCheck = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)
const IconKey = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
    <path d="m18.5 10.5-7.793 7.793a2.121 2.121 0 0 1-3-3L15.5 7.5" />
    <circle cx="7.5" cy="15.5" r="3.5" />
  </svg>
)
// ── Auth assist: inline, non-blocking hint under the Product URL. ───────────────
// Public sites need nothing; for sites behind a login or bot-wall, it offers a
// jump to /sessions (URL prefilled) and reassures once signed in.
const AuthAssist = ({
  url,
  origins,
  loading,
  dismissedHost,
  onAuthenticate,
  onDismiss,
}: {
  url: string
  origins: string[]
  loading: boolean
  dismissedHost: string | null
  onAuthenticate: () => void
  onDismiss: () => void
}) => {
  const host = hostOf(url)
  if (!host) return null // nothing typed yet — stay out of the way

  const label = prettyHost(url)

  // Don't flash the "needs auth" prompt before we know the saved logins.
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 px-1 text-xs text-gray-400" aria-live="polite">
        <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-gray-200 border-t-gray-400" />
        Checking saved logins…
      </div>
    )
  }

  if (isAuthenticatedFor(url, origins)) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-emerald-800 animate-[fadeIn_240ms_ease-out]">
        <IconShieldCheck size={15} />
        <p className="text-xs leading-snug">
          <span className="font-semibold">Signed in to {label}.</span>{' '}
          <span className="text-emerald-700/80">The agent will reuse your login.</span>
        </p>
      </div>
    )
  }

  if (dismissedHost === host) return null // user said this site is public

  return (
    <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 animate-[fadeIn_240ms_ease-out]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-amber-600">
          <IconKey size={15} />
        </span>
        <p className="text-xs leading-snug text-amber-900">
          Does <span className="font-semibold">{label}</span> need a login or bot check?
        </p>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-[23px]">
        <button
          type="button"
          onClick={onAuthenticate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:opacity-50"
        >
          Authenticate
          <CreditChip amount={2} className="bg-white text-gray-900" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
        >
          No auth needed
        </button>
      </div>
    </div>
  )
}

// ── Label with tooltip ─────────────────────────────────────────────────────────
const FieldLabel = ({
  required,
  label,
  tooltip,
}: {
  required?: boolean
  label: string
  tooltip?: string
}) => (
  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
    {required && <span className="text-red-500 text-xs">*</span>}
    {label}
    {tooltip && (
      <span className="text-gray-400 cursor-help" title={tooltip}>
        <IconInfo />
      </span>
    )}
  </label>
)

const AI_AGENT_PROMPTS = [
  "Go to flipkart.com, search for 'iPhone 15', click the first result, and highlight the key specs for a product review.",
  "Navigate to dodopayments.com, click 'Docs', search for 'Payment Intents', and summarize the integration steps.",
  "Open our startup's landing page, click 'Get Started', fill the signup form, and walk through the onboarding dashboard.",
  "Go to github.com, search for 'React', navigate to 'Issues', and show how to filter for 'good first issues'.",
  "Visit the company intranet, click 'HR Portal', navigate to 'Leave Requests', and submit a time-off application.",
]

// ── Create View ────────────────────────────────────────────────────────────────
interface CreateViewProps {
  isMobile: boolean
  formValues: Record<string, string>
  setFormValues: (v: Record<string, string>) => void
  isSubmitting: boolean
  onQueueJob: (values: any) => Promise<void>
}

export const CreateView = ({
  formValues,
  setFormValues,
  isSubmitting,
  onQueueJob,
}: CreateViewProps) => {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showAudioPreview, setShowAudioPreview] = useState(false)
  const [headerPairs] = useState<{ key: string; value: string }[]>([])
  const [cookiePairs] = useState<{ key: string; value: string }[]>([])
  // const [curlInput, setCurlInput] = useState('');
  // const [activeAuthTab, setActiveAuthTab] = useState<'quick' | 'manual'>('quick');
  const navigate = useNavigate()
  const { origins, loading: originsLoading } = useBrowserProfile()
  const [dismissedAuthHost, setDismissedAuthHost] = useState<string | null>(null)

  /*
  const handleCurlImport = () => {
    if (!curlInput.trim()) return;

    // 1. Extract URL
    const urlMatch = curlInput.match(/(?:https?:\/\/[^\s'"]+)/);
    if (urlMatch) {
      update('url', urlMatch[0]);
    }

    // 2. Extract Headers
    const headers: { key: string, value: string }[] = [];
    const headerRegex = /-(?:H|-header)\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = headerRegex.exec(curlInput)) !== null) {
      const headerStr = match[1];
      if (!headerStr) continue;
      const splitIdx = headerStr.indexOf(':');
      if (splitIdx === -1) continue;
      const key = headerStr.slice(0, splitIdx).trim();
      const value = headerStr.slice(splitIdx + 1).trim();
      headers.push({ key, value });
    }
    setHeaderPairs(headers);
  };
  */

  const update = (key: string, value: string) => {
    setFormValues({ ...formValues, [key]: value })
    if (key === 'audio') setShowAudioPreview(true)
    if (errors[key])
      setErrors(e => {
        const n = { ...e }
        delete n[key]
        return n
      })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const url = formValues.url?.trim()

    if (!url) {
      errs.url = 'Please enter a URL'
    } else {
      try {
        // First check if it's a validly formatted URL
        new URL(url)
      } catch {
        errs.url = 'Please enter a valid URL (e.g. https://example.com)'
      }
    }

    if (!formValues.instructions?.trim()) errs.instructions = 'Please provide instructions'

    const headersObj: Record<string, string> = {}
    headerPairs.forEach(pair => {
      if (pair.key.trim()) {
        headersObj[pair.key.trim()] = pair.value
      }
    })

    const cookiesObj: Record<string, string> = {}
    cookiePairs.forEach(pair => {
      if (pair.key.trim()) {
        cookiesObj[pair.key.trim()] = pair.value
      }
    })

    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    onQueueJob({
      url: formValues.url,
      subtitles: formValues.subtitles === 'true',
      theme: formValues.theme || 'light',
      audio: formValues.audio ? formValues.audio.replace('.mp3', '') : '',
      instructions:
        formValues.subtitles === 'true'
          ? `${formValues.instructions} (Please ensure subtitles are included in the final video)`
          : formValues.instructions,
      script: formValues.script,
      headers: Object.keys(headersObj).length > 0 ? JSON.stringify(headersObj) : undefined,
      cookies: Object.keys(cookiesObj).length > 0 ? JSON.stringify(cookiesObj) : undefined,
    })
  }

  const inputBase =
    'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white'
  const inputError = 'border-red-300 focus:ring-red-200 focus:border-red-400'

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      {/* Page heading */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center flex-wrap gap-1">
          <span>Generate</span>
          <ContainerTextFlip
            words={['cinematic', 'stunning', 'polished', 'engaging', 'premium']}
            interval={2500}
          />
          <span>demos</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">
          Tell the AI agent what to record, and it will craft a production-ready walkthrough.
        </p>
      </div>

      <div className="w-full">
        {/* ── Form ──────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 shadow-sm"
            id="create-video-form"
          >
            <div className="grid md:grid-cols-2 gap-6">
              {/* Product URL */}
              <div>
                <FieldLabel
                  required
                  label="Product URL"
                  tooltip="The starting point for the AI agent."
                />
                <input
                  id="url-input"
                  type="url"
                  className={`${inputBase} ${errors.url ? inputError : ''}`}
                  placeholder="https://trypitch.co"
                  value={formValues.url || ''}
                  onChange={e => update('url', e.target.value)}
                />
                {errors.url && <p className="text-xs text-red-500 mt-1">{errors.url}</p>}
                <AuthAssist
                  url={formValues.url || ''}
                  origins={origins}
                  loading={originsLoading}
                  dismissedHost={dismissedAuthHost}
                  onAuthenticate={() => {
                    const u = (formValues.url || '').trim()
                    navigate(`/sessions?url=${encodeURIComponent(u)}&from=new`)
                  }}
                  onDismiss={() => setDismissedAuthHost(hostOf(formValues.url || ''))}
                />
              </div>

              {/* Audio Track */}
              <div>
                <FieldLabel
                  label="Background Audio"
                  tooltip="Select an AI generated voice or background track."
                />
                <Select value={formValues.audio || ''} onValueChange={val => update('audio', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an audio track" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-400">
                      Gemini Native Voices
                    </div>
                    <SelectItem value="Orus.mp3">Orus (Deep, professional)</SelectItem>
                    <SelectItem value="Charon.mp3">Charon (Clear, conversational)</SelectItem>
                    <SelectItem value="Fenrir.mp3">Fenrir (Dynamic, excitable)</SelectItem>
                    <SelectItem value="Puck.mp3">Puck (Upbeat, energetic)</SelectItem>
                    <SelectItem value="Aoede.mp3">Aoede (Natural, conversational)</SelectItem>
                    <SelectItem value="Kore.mp3">Kore (Confident, firm)</SelectItem>
                  </SelectContent>
                </Select>

                {formValues.audio && showAudioPreview && (
                  <WaveformScrub
                    fileName={formValues.audio}
                    onConfirm={() => setShowAudioPreview(false)}
                  />
                )}
              </div>
            </div>

            {/* Options Row - Commented out for future use
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-2">
              {/* Subtitles * /}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <Switch
                  id="subtitles-toggle"
                  checked={formValues.subtitles === 'true'}
                  onCheckedChange={(checked) => update('subtitles', checked ? 'true' : 'false')}
                  aria-label="Toggle subtitles"
                />
                <div>
                  <label htmlFor="subtitles-toggle" className="text-sm font-medium text-gray-900 cursor-pointer block">
                    Include Subtitles
                  </label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Overlay AI subtitles.</p>
                </div>
              </div>

              {/* Theme Option * /}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <ThemeSwitch 
                  checked={formValues.theme === 'dark'} 
                  onCheckedChange={(checked) => update('theme', checked ? 'dark' : 'light')} 
                />
                <div>
                  <label className="text-sm font-medium text-gray-900 cursor-pointer block">
                    Video Theme
                  </label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Choose dark or light theme for the video.</p>
                </div>
              </div>
            </div>
            */}

            {/* Instructions */}
            <div className="z-10 relative">
              <FieldLabel
                required
                label="What should the AI agent do?"
                tooltip="Provide step-by-step instructions."
              />
              <div className={errors.instructions ? 'ring-2 ring-red-300 rounded-xl' : ''}>
                <PlaceholdersAndVanishInput
                  placeholders={AI_AGENT_PROMPTS}
                  onChange={e => update('instructions', e.target.value)}
                  value={formValues.instructions || ''}
                />
              </div>
              {errors.instructions && (
                <p className="text-xs text-red-500 mt-1">{errors.instructions}</p>
              )}
            </div>

            {/* Voiceover Script */}
            <div>
              <FieldLabel
                label="Voiceover Script"
                tooltip="Custom narration script for the AI voiceover. If left blank, the AI will generate one automatically."
              />
              <textarea
                id="script-input"
                rows={4}
                className={`${inputBase} resize-none`}
                placeholder="Write the exact words you want the AI to say as it narrates the demo… (optional)"
                value={formValues.script || ''}
                onChange={e => update('script', e.target.value)}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              id="generate-demo-btn"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 flex items-center justify-center gap-2 border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <IconLoader /> : <IconPlay />}
              {isSubmitting ? 'Queuing…' : 'Generate Demo'}
              {!isSubmitting && <CreditChip amount={3} className="bg-white text-gray-900" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
