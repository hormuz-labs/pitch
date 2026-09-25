import { A } from '@solidjs/router'
import { ArrowLeft, ChevronDown, Download, Eye } from 'lucide-solid'
import { createSignal, Show } from 'solid-js'
import { saveBlob } from '../../lib/save-blob'
import { StudioMenu } from '../account/StudioMenu'
import { adminStudio, type ProjectOwner, type ReviewDownload } from './client'
import './admin-review.css'

export function ownerLabel(owner: ProjectOwner | null): string {
  if (!owner) return 'Unknown owner'
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim()
  return owner.email || name || owner.id
}

const FALLBACK_NAME: Record<ReviewDownload, string> = {
  chat: 'chat.md',
  'chat-json': 'chat.json',
  logs: 'logs.json',
}

/**
 * The studio topbar when an administrator is reviewing someone else's
 * project: whose it is, that nothing here can change it, and the chat/log
 * downloads.
 */
export function AdminReviewBar(props: {
  projectId: string
  title?: string
  owner: ProjectOwner | null
  getToken: () => Promise<string>
}) {
  const [pending, setPending] = createSignal<ReviewDownload | null>(null),
    [error, setError] = createSignal<string | null>(null)
  const download = async (kind: ReviewDownload) => {
    if (pending()) return
    setPending(kind)
    setError(null)
    try {
      const { blob, filename } = await adminStudio.download(
        await props.getToken(),
        props.projectId,
        kind,
      )
      saveBlob(blob, filename ?? `pitch-${props.projectId}-${FALLBACK_NAME[kind]}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setPending(null)
    }
  }
  return (
    <div class="admin-review-bar">
      <A href="/admin" class="admin-review-back" aria-label="Back to admin" title="Back to admin">
        <ArrowLeft size={16} />
      </A>
      <span class="admin-review-badge" title="Read-only: nothing here changes the project">
        <Eye size={13} />
        <span>Admin view</span>
      </span>
      <span class="admin-review-titles">
        <span class="editor-project" title={props.title}>
          {props.title || 'Untitled project'}
        </span>
        <small class="admin-review-owner" title={props.owner?.id}>
          {ownerLabel(props.owner)}
        </small>
      </span>
      <StudioMenu
        label="Download for review"
        align="start"
        width={220}
        triggerClass="topbar-btn admin-review-download"
        trigger={
          <>
            <Download size={14} />
            <span>{pending() ? 'Preparing…' : 'Download'}</span>
            <ChevronDown size={13} />
          </>
        }
      >
        <button type="button" role="menuitem" onClick={() => void download('chat')}>
          <Download />
          <span>Chat (Markdown)</span>
        </button>
        <button type="button" role="menuitem" onClick={() => void download('chat-json')}>
          <Download />
          <span>Chat (JSON)</span>
        </button>
        <button type="button" role="menuitem" onClick={() => void download('logs')}>
          <Download />
          <span>Full logs (JSON)</span>
        </button>
      </StudioMenu>
      <Show when={error()}>
        <span class="admin-review-error" role="alert">
          {error()}
        </span>
      </Show>
    </div>
  )
}
