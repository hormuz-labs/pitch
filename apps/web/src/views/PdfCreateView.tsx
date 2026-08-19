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

const FieldLabel = ({
  required,
  label,
  tooltip,
}: {
  required?: boolean
  label: string
  tooltip?: string
}) => (
  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
    {required && <span className="text-red-500 text-xs">*</span>}
    {label}
    {tooltip && (
      <span className="text-gray-400 cursor-help" title={tooltip}>
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
      </span>
    )}
  </label>
)

interface PdfCreateViewProps {
  isSubmitting: boolean
  onQueuePdfJob: (values: {
    topic: string
    slideCount: number
    slideHeadings: string[]
  }) => Promise<void>
}

export const PdfCreateView = ({ isSubmitting, onQueuePdfJob }: PdfCreateViewProps) => {
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [headings, setHeadings] = useState<string[]>(Array(20).fill(''))
  const [showHeadings, setShowHeadings] = useState(false)
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

    // Slice headings array to match slideCount
    const jobHeadings = headings
      .slice(0, slideCount)
      .map(h => h.trim())
      .filter(h => h !== '')

    await onQueuePdfJob({
      topic: topic.trim(),
      slideCount,
      slideHeadings: jobHeadings,
    })
  }

  const inputBase =
    'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white'
  const inputError = 'border-red-300 focus:ring-red-200 focus:border-red-400'

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      {/* Page heading */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center flex-wrap gap-2">
          <span>Generate AI PDF Presentation</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">
          Enter a topic and we will generate a high-fidelity PDF slide deck using our PPT generation
          agent.
        </p>
      </div>

      <div className="w-full">
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm"
          id="create-pdf-form"
        >
          {/* Topic Section */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <FieldLabel
                required
                label="Presentation Topic / Title"
                tooltip="What is this presentation about? Max 30 words."
              />
              <span
                className={`text-xs font-semibold ${isWordLimitExceeded ? 'text-red-500 font-bold' : 'text-gray-400'}`}
              >
                {currentWords} / 30 words
              </span>
            </div>
            <textarea
              id="topic-input"
              rows={3}
              className={`${inputBase} resize-none ${errors.topic || isWordLimitExceeded ? inputError : ''}`}
              placeholder="e.g. Clean Energy Initiatives in 2026: Trends, statistics, and policies driving global adoption of solar and wind energy."
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
            <FieldLabel
              label="Number of Slides"
              tooltip="Choose how many slides to generate (1 to 20)."
            />
            <select
              id="slide-count-select"
              value={slideCount}
              onChange={e => setSlideCount(parseInt(e.target.value, 10))}
              className={`${inputBase} cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23a0aec0%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_14px_center] bg-no-repeat`}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                <option key={num} value={num}>
                  {num} {num === 1 ? 'Slide' : 'Slides'}
                </option>
              ))}
            </select>
          </div>

          {/* Collapsible Slide Headings */}
          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
            <button
              type="button"
              onClick={() => setShowHeadings(!showHeadings)}
              className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
            >
              <span>Custom Slide Headings (Optional)</span>
              <span>{showHeadings ? <IconChevronUp /> : <IconChevronDown />}</span>
            </button>

            {showHeadings && (
              <div className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-2 animate-in fade-in slide-in-from-top-1 duration-200">
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
                      placeholder={`e.g. ${idx === 0 ? 'Title Slide' : idx === 1 ? 'Agenda' : `Slide ${idx + 1} Heading`}`}
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
              id="generate-pdf-btn"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 flex items-center justify-center border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <IconLoader /> : <IconPlay />}
              {isSubmitting ? 'Queuing PDF Job…' : 'Generate Presentation'}
              {!isSubmitting && <CreditChip amount={1} className="bg-white text-gray-900" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
