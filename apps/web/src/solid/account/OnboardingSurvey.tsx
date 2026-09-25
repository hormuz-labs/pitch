import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { api } from '../../lib/api'
import { useAuth } from '../core/auth'
import '../../styles/onboarding-survey.css'

const questions = [
  [
    'creationGoal',
    'What do you want to create?',
    [
      'Product demos',
      'Product launch videos',
      'Training or onboarding',
      'Pitch decks',
      'Explainers or tutorials',
      'Short-form social clips',
      'Other',
    ],
  ],
  [
    'role',
    'What best describes you?',
    [
      'Founder',
      'Product manager',
      'Marketing or growth',
      'Designer',
      'Developer',
      'Sales or customer success',
      'Agency or freelancer',
      'Other',
    ],
  ],
  [
    'teamSize',
    'How big is your team?',
    ['Just me', '2-10', '11-50', '51-200', '201-1000', '1000+'],
  ],
  [
    'monthlyVolume',
    'How many videos do you make?',
    [
      '1-2 per month',
      '3-5 per month',
      '6-10 per month',
      '11-25 per month',
      '26-50 per month',
      '50+ per month',
    ],
  ],
  [
    'discoverySource',
    'How did you find Pitch?',
    [
      'Google search',
      'X / Twitter',
      'LinkedIn',
      'YouTube',
      'ChatGPT',
      'Claude',
      'Friend or teammate',
      'Community or event',
      'Other',
    ],
  ],
] as const

const optionValues: Record<string, string> = {
  'Product demos': 'product-demos',
  'Product launch videos': 'launch-videos',
  'Training or onboarding': 'onboarding',
  'Pitch decks': 'pitch-decks',
  'Explainers or tutorials': 'explainers',
  'Short-form social clips': 'social-clips',
  Founder: 'founder',
  'Product manager': 'product-manager',
  'Marketing or growth': 'marketer',
  Designer: 'designer',
  Developer: 'developer',
  'Sales or customer success': 'sales-success',
  'Agency or freelancer': 'agency-freelancer',
  'Just me': 'just-me',
  '1000+': '1000-plus',
  '1-2 per month': '1-2',
  '3-5 per month': '3-5',
  '6-10 per month': '6-10',
  '11-25 per month': '11-25',
  '26-50 per month': '26-50',
  '50+ per month': '50-plus',
  'Google search': 'google',
  'X / Twitter': 'x-twitter',
  LinkedIn: 'linkedin',
  YouTube: 'youtube',
  ChatGPT: 'chatgpt',
  Claude: 'claude',
  'Friend or teammate': 'friend-teammate',
  'Community or event': 'community',
  Other: 'other',
}

export function OnboardingSurvey(props: { enabled?: boolean; onSettled?: () => void }) {
  const { getToken } = useAuth()
  const [required, setRequired] = createSignal(false)
  const [step, setStep] = createSignal(0)
  const [answers, setAnswers] = createSignal<Record<string, string>>({})
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal('')
  const skip = async () => {
    localStorage.setItem('pitch:onboarding-skipped', '1')
    setRequired(false)
    props.onSettled?.()
    try {
      const token = await getToken()
      if (token) await api.post('/users/onboarding/skip', token, {})
    } catch {
      /* best effort */
    }
  }
  onMount(() => {
    if (props.enabled === false || localStorage.getItem('pitch:onboarding-skipped') === '1') {
      props.onSettled?.()
      return
    }
    void (async () => {
      try {
        const token = await getToken()
        if (!token) {
          props.onSettled?.()
          return
        }
        const status = await api.get<{ completed: boolean; skipped: boolean }>(
          '/users/onboarding',
          token,
        )
        const required = !status.completed && !status.skipped
        setRequired(required)
        if (!required) props.onSettled?.()
      } catch {
        /* never gate on status failure */
        props.onSettled?.()
      }
    })()
    const key = (event: KeyboardEvent) => event.key === 'Escape' && void skip()
    window.addEventListener('keydown', key)
    onCleanup(() => window.removeEventListener('keydown', key))
  })
  const next = async () => {
    const question = questions[step()]
    if (!answers()[question[0]]) return
    if (step() < questions.length - 1) {
      setStep(value => value + 1)
      return
    }
    setSubmitting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error()
      await api.post('/users/onboarding', token, answers())
      setRequired(false)
      props.onSettled?.()
    } catch {
      setError('We could not save your answers. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <Show when={required()}>
      <div class="onboarding-survey" role="dialog" aria-modal="true">
        <div class="onboarding-survey-card">
          <div class="onboarding-survey-brand">
            <b>PITCH</b>
          </div>
          <p class="onboarding-survey-kicker">Welcome to Pitch</p>
          <button class="onboarding-survey-skip" onClick={() => void skip()}>
            Skip
          </button>
          <div class="onboarding-survey-progress">
            <span style={{ width: `${((step() + 1) / questions.length) * 100}%` }} />
          </div>
          <h1>{questions[step()][1]}</h1>
          <div class="onboarding-survey-options">
            <For each={questions[step()][2]}>
              {option => {
                const value = optionValues[option] ?? option
                return (
                  <button
                    class={answers()[questions[step()][0]] === value ? 'is-selected' : ''}
                    onClick={() =>
                      setAnswers(current => ({ ...current, [questions[step()][0]]: value }))
                    }
                  >
                    {option}
                  </button>
                )
              }}
            </For>
          </div>
          <Show when={error()}>
            <p class="onboarding-survey-error">{error()}</p>
          </Show>
          <div class="onboarding-survey-actions">
            <Show when={step() > 0}>
              <button class="is-back" onClick={() => setStep(value => value - 1)}>
                Back
              </button>
            </Show>
            <button
              class="is-continue"
              disabled={!answers()[questions[step()][0]] || submitting()}
              onClick={() => void next()}
            >
              {submitting() ? 'Saving...' : step() === questions.length - 1 ? 'Finish' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}
