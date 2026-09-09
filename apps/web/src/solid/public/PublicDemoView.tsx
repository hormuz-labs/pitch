import { A } from '@solidjs/router'
import { createEffect, createSignal, Match, onCleanup, Switch } from 'solid-js'
import { PitchWordmark } from './brand'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'

interface PublicProject {
  title: string
  flow: string
  createdAt: string
  videoUrl?: string | null
  pdfUrl?: string | null
  thumbnailUrl?: string | null
}
const API_URL = import.meta.env.VITE_API_URL || '/api'
const KICKER: Record<string, string> = {
  'launch-video': 'Pitch launch video',
  'demo-video': 'Pitch demo',
  deck: 'Pitch deck',
  'recording-edit': 'Pitch edit',
}
export const PublicDemoView = (props: { slug: string }) => {
  const [project, setProject] = createSignal<PublicProject | null>(null),
    [status, setStatus] = createSignal<'loading' | 'ready' | 'not-found'>('loading')
  createEffect(() => {
    const slug = props.slug,
      controller = new AbortController()
    setStatus('loading')
    fetch(`${API_URL}/projects/public/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const p = data?.project ?? data
        if (!p) setStatus('not-found')
        else {
          setProject(p)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('not-found')
      })
    onCleanup(() => controller.abort())
  })
  return (
    <div
      class="min-h-screen text-gray-900 font-sans flex flex-col overflow-x-hidden"
      style={{
        background: 'radial-gradient(120% 70% at 50% -10%,#F3EFE7 0%,#FAF9F6 45%,#F5F4F1 100%)',
      }}
    >
      <LandingNav />
      <main class="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-20">
        <Switch>
          <Match when={status() === 'loading'}>
            <div class="w-full max-w-4xl">
              <div class="w-full aspect-video rounded-2xl bg-gray-200/70 animate-pulse" />
            </div>
          </Match>
          <Match when={status() === 'not-found'}>
            <div class="text-center max-w-sm py-20">
              <PitchWordmark class="h-6 mx-auto mb-8 text-gray-300" />
              <h1 class="font-serif text-3xl">This project isn't available</h1>
              <p class="text-gray-500 my-6">
                It may have been unshared by its owner, or the link is incorrect.
              </p>
              <A class="inline-flex px-6 py-3 rounded-full bg-gray-900 text-white" href="/">
                Go to trypitch.co
              </A>
            </div>
          </Match>
          <Match when={project()}>
            {p => (
              <div class="w-full max-w-4xl">
                <div class="w-full aspect-video rounded-2xl sm:rounded-[28px] overflow-hidden bg-gray-950 shadow-xl">
                  {p().videoUrl ? (
                    <video
                      controls
                      poster={p().thumbnailUrl ?? undefined}
                      src={p().videoUrl!}
                      class="w-full h-full object-contain"
                    />
                  ) : p().pdfUrl ? (
                    <iframe src={p().pdfUrl!} title={p().title} class="w-full h-full bg-white" />
                  ) : p().thumbnailUrl ? (
                    <img
                      src={p().thumbnailUrl!}
                      alt={p().title}
                      class="w-full h-full object-cover"
                    />
                  ) : (
                    <div class="text-gray-500">Nothing published yet</div>
                  )}
                </div>
                <div class="mt-7 flex justify-between gap-6">
                  <div>
                    <div class="text-[11px] font-bold uppercase text-gray-400">
                      {KICKER[p().flow] ?? 'Pitch project'}
                    </div>
                    <h1 class="font-serif text-3xl">{p().title}</h1>
                    <div class="text-[13px] text-gray-400">
                      {new Date(p().createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <A href="/" class="px-6 py-3 rounded-full bg-gray-900 text-white">
                      Create your own
                    </A>
                    <span class="text-xs text-gray-400">Powered by Pitch</span>
                  </div>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </main>
      <LandingFooter />
    </div>
  )
}
