import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PitchWordmark } from './PitchWordmark'
import '../styles/onboarding-survey.css'

type Answers = {
  creationGoal: string
  role: string
  teamSize: string
  monthlyVolume: string
  discoverySource: string
}

type Question = {
  key: keyof Answers
  title: string
  options: { value: string; label: string }[]
}

const QUESTIONS: Question[] = [
  {
    key: 'creationGoal',
    title: 'What do you want to create?',
    options: [
      { value: 'product-demos', label: 'Product demos' },
      { value: 'launch-videos', label: 'Product launch videos' },
      { value: 'onboarding', label: 'Training or onboarding' },
      { value: 'pitch-decks', label: 'Pitch decks' },
      { value: 'explainers', label: 'Explainers or tutorials' },
      { value: 'social-clips', label: 'Short-form social clips' },
      { value: 'investor-updates', label: 'Investor updates' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    key: 'role',
    title: 'What best describes you?',
    options: [
      { value: 'founder', label: 'Founder' },
      { value: 'product-manager', label: 'Product manager' },
      { value: 'marketer', label: 'Marketing or growth' },
      { value: 'designer', label: 'Designer' },
      { value: 'developer', label: 'Developer' },
      { value: 'sales-success', label: 'Sales or customer success' },
      { value: 'agency-freelancer', label: 'Agency or freelancer' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    key: 'teamSize',
    title: 'How big is your team?',
    options: [
      { value: 'just-me', label: 'Just me' },
      { value: '2-10', label: '2–10' },
      { value: '11-50', label: '11–50' },
      { value: '51-200', label: '51–200' },
      { value: '201-1000', label: '201–1,000' },
      { value: '1000-plus', label: '1,000+' },
    ],
  },
  {
    key: 'monthlyVolume',
    title: 'How many videos do you make?',
    options: [
      { value: '1-2', label: '1–2 per month' },
      { value: '3-5', label: '3–5 per month' },
      { value: '6-10', label: '6–10 per month' },
      { value: '11-25', label: '11–25 per month' },
      { value: '26-50', label: '26–50 per month' },
      { value: '50-plus', label: '50+ per month' },
    ],
  },
  {
    key: 'discoverySource',
    title: 'How did you find Pitch?',
    options: [
      { value: 'google', label: 'Google search' },
      { value: 'x-twitter', label: 'X / Twitter' },
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'chatgpt', label: 'ChatGPT' },
      { value: 'claude', label: 'Claude' },
      { value: 'friend-teammate', label: 'Friend or teammate' },
      { value: 'community', label: 'Community or event' },
      { value: 'other', label: 'Other' },
    ],
  },
]

const EMPTY_ANSWERS: Answers = {
  creationGoal: '',
  role: '',
  teamSize: '',
  monthlyVolume: '',
  discoverySource: '',
}

export const OnboardingSurvey = () => {
  const { getToken } = useAuth()
  const [required, setRequired] = useState(false)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const question = QUESTIONS[step]
  const selected = answers[question.key]

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const token = await getToken()
        if (!token) return
        const result = await api.get<{ completed: boolean }>('/users/onboarding', token)
        if (!cancelled) setRequired(!result.completed)
      } catch {
        // Do not lock the application during a transient status-check failure.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  if (!required) return null

  const continueSurvey = async () => {
    if (!selected) return
    if (step < QUESTIONS.length - 1) {
      setStep(current => current + 1)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Your session expired. Please sign in again.')
      await api.post('/users/onboarding', token, answers)
      setRequired(false)
    } catch (submissionError: any) {
      if (submissionError?.status === 409) setRequired(false)
      else setError('We could not save your answers. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="onboarding-survey" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-survey-card">
        <div className="onboarding-survey-brand"><PitchWordmark /></div>
        <p className="onboarding-survey-kicker">Welcome to Pitch</p>
        <div className="onboarding-survey-progress" aria-label={`Step ${step + 1} of ${QUESTIONS.length}`}>
          <span style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </div>

        <h1 id="onboarding-title">{question.title}</h1>
        <div className="onboarding-survey-options">
          {question.options.map(option => (
            <button
              key={option.value}
              type="button"
              className={selected === option.value ? 'is-selected' : ''}
              aria-pressed={selected === option.value}
              onClick={() => setAnswers(current => ({ ...current, [question.key]: option.value }))}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && <p className="onboarding-survey-error" role="alert">{error}</p>}
        <div className="onboarding-survey-actions">
          {step > 0 && <button type="button" className="is-back" onClick={() => setStep(current => current - 1)}>Back</button>}
          <button type="button" className="is-continue" disabled={!selected || submitting} onClick={continueSurvey}>
            {submitting ? 'Saving…' : step === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
          </button>
        </div>
        <p className="onboarding-survey-note">Your answers help us improve Pitch. They are visible only to the Pitch admin team.</p>
      </div>
    </div>
  )
}
