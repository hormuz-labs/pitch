import { MonitorPlay, Presentation, Rocket, Scissors, X } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'

export const SKILLS = [
  {
    id: 'launch-video',
    label: 'Launch video',
    icon: Rocket,
    prompt: 'Create a cinematic launch video for ',
  },
  {
    id: 'demo-video',
    label: 'Product demo',
    icon: MonitorPlay,
    prompt: 'Create a narrated product demo for ',
  },
  {
    id: 'slide-deck',
    label: 'Slide deck',
    icon: Presentation,
    prompt: 'Create a concise presentation about ',
  },
  {
    id: 'recording-edit',
    label: 'Edit recording',
    icon: Scissors,
    prompt: 'Polish this recording with clean cuts and captions.',
  },
] as const

export type Skill = (typeof SKILLS)[number]['id']

export function SelectedSkillMode(props: { skill: Skill | null; onClear: () => void }) {
  const selected = () => SKILLS.find(item => item.id === props.skill)
  return (
    <Show when={selected()}>
      {item => (
        <button
          type="button"
          class="new-composer-mode"
          data-skill={item().id}
          aria-label={`Clear ${item().label}`}
          title={`Clear ${item().label}`}
          onClick={props.onClear}
        >
          <span class="new-composer-mode__icon" aria-hidden="true">
            <Dynamic component={item().icon} size={16} />
            <span class="new-composer-mode__clear">
              <X size={11} />
            </span>
          </span>
          <span>{item().label}</span>
        </button>
      )}
    </Show>
  )
}

export function SkillPicker(props: {
  skill: Skill | null
  onSelect: (skill: Skill | null) => void
  onFocusComposer?: () => void
}) {
  return (
    <div class="new-skills" aria-label="Project type">
      <For each={SKILLS}>
        {item => (
          <button
            class={`new-skill-pill ${props.skill === item.id ? 'is-active' : ''}`}
            aria-pressed={props.skill === item.id}
            onClick={() => {
              props.onSelect(props.skill === item.id ? null : item.id)
              props.onFocusComposer?.()
            }}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        )}
      </For>
    </div>
  )
}
