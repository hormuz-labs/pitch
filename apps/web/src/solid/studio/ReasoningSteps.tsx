import { Check, ChevronDown, Circle, X } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import type { Entry } from './types'

type Step = {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
}

function stepLabel(entry: Entry): string {
  const name = entry.tool?.name ?? ''
  const text = entry.text.toLowerCase()
  if (name === 'read') return 'Reviewing project material'
  if (name === 'write' || name === 'edit') return 'Updating the project'
  if (name === 'bash') {
    if (text.includes('motion scaffold')) return 'Preparing the video structure'
    if (text.includes('motion check')) return 'Checking the motion build'
    if (text.includes('motion recon') || text.includes('screenshot')) return 'Reviewing the product'
    return 'Preparing project files'
  }
  if (/render|publish|build/.test(name)) return 'Building the preview'
  if (/recon|search|scrape|probe|inspect|read|find|grep/.test(name))
    return 'Reviewing source material'
  if (/narrat|voice|speak|tts/.test(name)) return 'Preparing narration'
  return 'Working on the project'
}

export function ReasoningSteps(props: { entries: Entry[]; active?: boolean }) {
  const [open, setOpen] = createSignal(true)
  const steps = createMemo<Step[]>(() => {
    const entries = props.entries
    const tools = entries
      .filter(entry => entry.role === 'tool' && entry.tool)
      .map(entry => ({ id: entry.id, label: stepLabel(entry), status: entry.tool!.status }))
      .filter((step, index, list) => index === 0 || step.label !== list[index - 1].label)
    const hasReasoning = entries.some(entry => entry.role === 'thinking')
    if (!tools.length && hasReasoning)
      return [
        {
          id: 'reasoning',
          label: 'Planning the approach',
          status: props.active ? 'running' : 'done',
        },
      ]
    const recent = tools.slice(-4)
    if (props.active && !recent.some(step => step.status === 'running'))
      recent.push({ id: 'reasoning', label: 'Planning the next step', status: 'running' })
    return recent
  })
  const running = createMemo(() => steps().find(step => step.status === 'running'))
  const summary = createMemo(
    () => running()?.label ?? steps().at(-1)?.label ?? 'Understanding your request',
  )

  return (
    <Show when={steps().length}>
      <div class="reasoning-steps">
        <button
          type="button"
          class="reasoning-steps__trigger"
          aria-expanded={open()}
          onClick={() => setOpen(value => !value)}
        >
          <span>{summary()}</span>
          <ChevronDown size={14} class={open() ? 'is-open' : ''} />
        </button>
        <Show when={open()}>
          <ol class="reasoning-steps__list">
            <For each={steps()}>
              {step => (
                <li class={`reasoning-step is-${step.status}`}>
                  <span class="reasoning-step__icon" aria-hidden="true">
                    {step.status === 'done' ? (
                      <Check size={12} />
                    ) : step.status === 'error' ? (
                      <X size={12} />
                    ) : (
                      <Circle size={8} fill="currentColor" />
                    )}
                  </span>
                  <span>{step.label}</span>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </div>
    </Show>
  )
}
