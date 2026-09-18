import { FileText, X } from 'lucide-solid'
import { Show } from 'solid-js'
import type { UploadRef } from '../../lib/studio-api'

const imageExtension = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i
const videoExtension = /\.(avi|mkv|mov|mp4|webm)$/i

export function attachmentKind(file: Pick<UploadRef, 'name' | 'type'>) {
  if (file.type.startsWith('image/') || imageExtension.test(file.name)) return 'image'
  if (file.type.startsWith('video/') || videoExtension.test(file.name)) return 'video'
  return 'file'
}

export function NewProjectAttachment(props: {
  file: UploadRef
  reference?: boolean
  onRemove: () => void
}) {
  const kind = () => attachmentKind(props.file)
  return (
    <figure class="new-attachment" title={props.file.name} data-kind={kind()}>
      <Show when={kind() === 'image'}>
        <img src={props.file.url} alt={props.file.name} />
      </Show>
      <Show when={kind() === 'video'}>
        <video src={props.file.url} muted preload="metadata" aria-label={props.file.name} />
      </Show>
      <Show when={kind() === 'file'}>
        <span class="new-attachment__file" aria-label={props.file.name}>
          <FileText size={22} />
          <small>{props.file.name.split('.').pop()?.toUpperCase() || 'FILE'}</small>
        </span>
      </Show>
      <Show when={props.reference}>
        <span class="new-attachment__reference">Reference</span>
      </Show>
      <button type="button" aria-label={`Remove ${props.file.name}`} onClick={props.onRemove}>
        <X size={13} />
      </button>
    </figure>
  )
}
