import { useNavigate, useSearchParams } from '@solidjs/router'
import { Play } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { DECK_TEMPLATES, type DeckTemplateInfo } from '../../lib/deckTemplates'
import { createProject } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { CreditChip } from './credits'

export function TemplatesView(props: {
  onDetailModeChange?: (detail: boolean) => void
  onClearSelectionReady?: (clear: (() => void) | null) => void
  onNotice?: (message: string, type: 'error') => void
}) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initial = DECK_TEMPLATES.find(item => item.id === params.t) ?? null
  const [selected, setSelected] = createSignal<DeckTemplateInfo | null>(initial)
  const [topic, setTopic] = createSignal('')
  const [slideCount, setSlideCount] = createSignal(10)
  const [headings, setHeadings] = createSignal<string[]>(Array(20).fill(''))
  const [showHeadings, setShowHeadings] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal('')
  const words = createMemo(() => (topic().trim() ? topic().trim().split(/\s+/).length : 0))
  createEffect(() => {
    const id = typeof params.t === 'string' ? params.t : params.t?.[0]
    setSelected(DECK_TEMPLATES.find(item => item.id === id) ?? null)
    props.onDetailModeChange?.(Boolean(id))
  })
  const clear = () => {
    setSelected(null)
    setParams({})
    props.onDetailModeChange?.(false)
  }
  props.onClearSelectionReady?.(clear)
  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const template = selected()
    if (!template) return
    if (!topic().trim() || words() > 30) {
      setError(words() > 30 ? 'Topic cannot exceed 30 words' : 'Please enter a presentation topic')
      return
    }
    setSubmitting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const project = await createProject(token, {
        prompt: topic().trim(),
        options: {
          topic: topic().trim(),
          slideCount: slideCount(),
          headings: headings().slice(0, slideCount()).filter(Boolean),
          template: template.id,
        },
      })
      window.dispatchEvent(new Event('credits-changed'))
      navigate(`/p/${project.id}`)
    } catch (reason) {
      props.onNotice?.(
        reason instanceof Error ? reason.message : 'Could not create the deck',
        'error',
      )
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div class="min-h-full bg-[#f7f7f5] px-4 py-6 sm:px-6 lg:px-10">
      <div class="mx-auto max-w-[1160px]">
        <Show
          when={selected()}
          fallback={
            <>
              <header class="mb-7 border-b border-[#e2e1de] pb-7">
                <p class="text-[11px] uppercase tracking-[.16em] text-[#85817c]">
                  Presentation templates
                </p>
                <h1 class="text-[34px] font-semibold tracking-[-.04em]">
                  Start with a visual point of view.
                </h1>
                <p class="mt-2 text-sm text-[#706c67]">
                  Pick a design direction, add your topic, and refine every slide in the studio.
                </p>
              </header>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <For each={DECK_TEMPLATES}>
                  {template => (
                    <button
                      class="group overflow-hidden rounded-[14px] border border-[#dededb] bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                      onClick={() => {
                        setSelected(template)
                        props.onDetailModeChange?.(true)
                      }}
                    >
                      <div
                        class="relative aspect-[16/10] p-8"
                        style={{ background: template.swatch[0], color: template.swatch[1] }}
                      >
                        <div
                          class="h-full border-4 p-5"
                          style={{ 'border-color': template.swatch[2] }}
                        >
                          <b class="text-2xl">{template.name}</b>
                        </div>
                      </div>
                      <div class="p-5">
                        <h3 class="font-semibold">{template.name}</h3>
                        <p class="mt-1.5 text-xs text-[#77736e]">{template.blurb}</p>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </>
          }
        >
          {template => (
            <>
              <button class="mb-4 text-sm text-gray-500" onClick={clear}>
                ← All templates
              </button>
              <header class="mb-7 border-b pb-6">
                <p class="text-[11px] uppercase tracking-[.16em] text-gray-500">Template setup</p>
                <h1 class="text-3xl font-semibold">{template().name}</h1>
                <p class="mt-1 text-sm text-gray-500">{template().blurb}</p>
              </header>
              <div class="grid gap-8 lg:grid-cols-12">
                <div class="lg:col-span-5">
                  <div
                    class="aspect-video overflow-hidden rounded-xl p-8 shadow-md"
                    style={{ background: template().swatch[0], color: template().swatch[1] }}
                  >
                    <div
                      class="flex h-full items-center border-4 p-5"
                      style={{ 'border-color': template().swatch[2] }}
                    >
                      <h2 class="text-3xl font-black">{topic() || template().name}</h2>
                    </div>
                  </div>
                </div>
                <form
                  class="space-y-6 rounded-2xl border bg-white p-6 lg:col-span-7"
                  onSubmit={submit}
                >
                  <label class="block text-sm font-semibold">
                    Presentation topic{' '}
                    <span class={words() > 30 ? 'text-red-500' : 'text-gray-400'}>
                      {words()} / 30
                    </span>
                    <textarea
                      rows={3}
                      class="mt-2 w-full rounded-lg border p-3 font-normal"
                      value={topic()}
                      onInput={event => {
                        setTopic(event.currentTarget.value)
                        setError('')
                      }}
                    />
                  </label>
                  <label class="block text-sm font-semibold">
                    Slide count: {slideCount()}
                    <input
                      class="mt-3 w-full accent-gray-900"
                      type="range"
                      min="5"
                      max="20"
                      value={slideCount()}
                      onInput={event => setSlideCount(Number(event.currentTarget.value))}
                    />
                  </label>
                  <button
                    type="button"
                    class="text-sm font-semibold"
                    onClick={() => setShowHeadings(value => !value)}
                  >
                    Custom slide headings (optional)
                  </button>
                  <Show when={showHeadings()}>
                    <div class="max-h-56 space-y-2 overflow-auto">
                      <For each={Array.from({ length: slideCount() })}>
                        {(_, index) => (
                          <input
                            class="w-full rounded-lg border p-2 text-sm"
                            placeholder={`Slide ${index() + 1} heading`}
                            value={headings()[index()]}
                            onInput={event =>
                              setHeadings(items =>
                                items.map((value, i) =>
                                  i === index() ? event.currentTarget.value : value,
                                ),
                              )
                            }
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={error()}>
                    <p class="text-xs text-red-500">{error()}</p>
                  </Show>
                  <button
                    type="submit"
                    disabled={submitting() || words() > 30}
                    class="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Play size={14} />
                    {submitting() ? 'Creating deck...' : 'Create deck in studio'}
                    <Show when={!submitting()}>
                      <CreditChip amount={1} class="bg-white text-gray-900" />
                    </Show>
                  </button>
                </form>
              </div>
            </>
          )}
        </Show>
      </div>
    </div>
  )
}
