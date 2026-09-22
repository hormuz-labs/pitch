import { A } from '@solidjs/router'
import { ExternalLink, FileText, Play } from 'lucide-solid'
import { createEffect, createSignal, Match, onCleanup, Show, Switch } from 'solid-js'
import { PitchWordmark } from './brand'
import '../../styles/public-share.css'

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
  'launch-video': 'Launch video',
  'demo-video': 'Product demo',
  deck: 'Pitch deck',
  'recording-edit': 'Edited video',
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))

function ShareHeader() {
  return (
    <header class="share-header">
      <A href="/" class="share-brand" aria-label="Pitch home">
        <PitchWordmark />
      </A>
      <A href="/sign-up" class="share-header-cta">
        Create with Pitch
      </A>
    </header>
  )
}

function ProjectDetails(props: { project: PublicProject; kind: 'video' | 'pdf' }) {
  return (
    <div class="share-details">
      <div class="share-copy">
        <p class="share-kicker">
          {props.kind === 'pdf' ? <FileText size={13} /> : <Play size={12} fill="currentColor" />}
          {KICKER[props.project.flow] ?? (props.kind === 'pdf' ? 'Pitch document' : 'Pitch video')}
        </p>
        <h1 id="shared-project-title">{props.project.title}</h1>
        <p class="share-date">Published {formatDate(props.project.createdAt)}</p>
      </div>
      <div class="share-actions">
        <Show when={props.kind === 'pdf' && props.project.pdfUrl}>
          {url => (
            <a
              class="share-secondary-action"
              href={url()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PDF
              <ExternalLink size={15} />
            </a>
          )}
        </Show>
        <A href="/sign-up" class="share-primary-action">
          Create your own
        </A>
        <span>Made with Pitch</span>
      </div>
    </div>
  )
}

function VideoProject(props: { project: PublicProject }) {
  return (
    <main class="share-main share-video-main">
      <section class="share-video-project" aria-labelledby="shared-project-title">
        <div class="share-video-stage">
          <video
            controls
            playsinline
            preload="metadata"
            poster={props.project.thumbnailUrl ?? undefined}
            src={props.project.videoUrl!}
            aria-label={`${props.project.title} video`}
          />
        </div>
        <ProjectDetails project={props.project} kind="video" />
      </section>
    </main>
  )
}

function PdfProject(props: { project: PublicProject }) {
  return (
    <main class="share-main share-pdf-main">
      <section class="share-pdf-project" aria-labelledby="shared-project-title">
        <ProjectDetails project={props.project} kind="pdf" />
        <div class="share-pdf-stage">
          <iframe src={props.project.pdfUrl!} title={`${props.project.title} PDF`} />
          <noscript>
            <a href={props.project.pdfUrl!}>Open {props.project.title}</a>
          </noscript>
        </div>
      </section>
    </main>
  )
}

function ThumbnailProject(props: { project: PublicProject }) {
  return (
    <main class="share-main share-video-main">
      <section class="share-video-project">
        <div class="share-video-stage share-thumbnail-stage">
          <img
            src={props.project.thumbnailUrl!}
            alt={props.project.title}
            width="1600"
            height="900"
          />
        </div>
        <ProjectDetails project={props.project} kind="video" />
      </section>
    </main>
  )
}

export const PublicDemoView = (props: { slug: string }) => {
  const [project, setProject] = createSignal<PublicProject | null>(null)
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'not-found'>('loading')

  createEffect(() => {
    const slug = props.slug
    const controller = new AbortController()
    setStatus('loading')
    fetch(`${API_URL}/projects/public/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const nextProject = data?.project ?? data
        if (!nextProject) setStatus('not-found')
        else {
          setProject(nextProject)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('not-found')
      })
    onCleanup(() => controller.abort())
  })

  return (
    <div class="share-page">
      <ShareHeader />
      <Switch>
        <Match when={status() === 'loading'}>
          <main class="share-main share-loading" aria-live="polite" aria-label="Loading project">
            <div class="share-loading-stage" />
            <div class="share-loading-copy" />
          </main>
        </Match>
        <Match when={status() === 'not-found'}>
          <main class="share-unavailable">
            <PitchWordmark class="share-unavailable-wordmark" />
            <p class="share-kicker">Public project</p>
            <h1>This project isn’t available</h1>
            <p>It may have been unshared by its owner, or the link may be incorrect.</p>
            <A class="share-primary-action" href="/">
              Go to trypitch.co
            </A>
          </main>
        </Match>
        <Match when={project()}>
          {current => (
            <Switch
              fallback={
                current().thumbnailUrl ? (
                  <ThumbnailProject project={current()} />
                ) : (
                  <main class="share-unavailable">
                    <p class="share-kicker">Public project</p>
                    <h1>Nothing has been published yet</h1>
                    <p>This link is active, but its owner hasn’t published an artifact.</p>
                  </main>
                )
              }
            >
              <Match when={current().videoUrl}>
                <VideoProject project={current()} />
              </Match>
              <Match when={current().pdfUrl}>
                <PdfProject project={current()} />
              </Match>
            </Switch>
          )}
        </Match>
      </Switch>
    </div>
  )
}
