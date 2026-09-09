import { A } from '@solidjs/router'
import { onCleanup, onMount, Show } from 'solid-js'
import { Seo } from '../core/Seo'
import { PitchAsciiMark } from './brand'
import '../../styles/status.css'
export type StatusVariant = 'not-found' | 'offline'
export interface StatusViewProps {
  variant?: StatusVariant
  onRetry?: () => void
  retrying?: boolean
}
const COPY = {
  'not-found': {
    code: '404',
    eyebrow: 'Error 404 · Page not found',
    title: (
      <>
        This one never made <em>the cut</em>.
      </>
    ),
    body: 'The page you asked for does not exist, or it moved. Nothing is broken on our side — the link just points nowhere.',
    seo: 'Page not found',
  },
  offline: {
    code: '503',
    eyebrow: 'Error 503 · Service unreachable',
    title: (
      <>
        The studio is <em>off the air</em>.
      </>
    ),
    body: 'We cannot reach the Pitch backend right now. Your projects and renders are safe — this is a connection problem, not a data one. The page retries on its own.',
    seo: 'Service unavailable',
  },
}
export const StatusView = (props: StatusViewProps) => {
  const variant = () => props.variant ?? 'not-found',
    copy = () => COPY[variant()]
  onMount(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex'
    document.head.append(tag)
    onCleanup(() => tag.remove())
  })
  return (
    <div class="status-root" data-variant={variant()}>
      <Seo
        title={`Pitch — ${copy().seo}`}
        description={copy().body}
        path={variant() === 'not-found' ? '/404' : '/503'}
      />
      <div class="status-watermark">{copy().code}</div>
      <PitchAsciiMark size={260} class="status-mark" />
      <div class="status-copy">
        <p class="status-eyebrow">{copy().eyebrow}</p>
        <h1 class="status-title">{copy().title}</h1>
        <p class="status-body">{copy().body}</p>
        <div class="status-actions">
          <Show
            when={variant() === 'offline'}
            fallback={
              <>
                <A class="status-cta" href="/">
                  Back to home
                </A>
                <A class="status-ghost" href="/blog">
                  Read the blog
                </A>
              </>
            }
          >
            <button class="status-cta" onClick={props.onRetry} disabled={props.retrying}>
              {props.retrying ? 'Reconnecting…' : 'Try again'}
            </button>
            <a class="status-ghost" href="mailto:support@trypitch.co">
              Contact support
            </a>
          </Show>
        </div>
      </div>
      <div class="status-detail">
        <span>
          Status <b>{copy().code}</b>
        </span>
        <span>
          Path <b>{location.pathname}</b>
        </span>
      </div>
      <nav class="status-links">
        <A href="/">Home</A>
        <A href="/pricing">Pricing</A>
        <A href="/blog">Blog</A>
        <A href="/docs">Docs</A>
        <a href="mailto:support@trypitch.co">Support</a>
      </nav>
    </div>
  )
}
export const NotFoundView = () => <StatusView variant="not-found" />
