import { ChevronDown, MessageCirclePlus, Pencil, Pin, Trash2 } from 'lucide-solid'
import { StudioMenu } from '../account/StudioMenu'

export function StudioProjectControls(props: {
  title?: string
  pinned: boolean
  onNew: () => void
  onRename: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const title = () => props.title || 'Untitled project'
  return (
    <>
      <button
        type="button"
        class="topbar-new-chat"
        aria-label="New chat"
        title="New chat"
        onClick={props.onNew}
      >
        <MessageCirclePlus size={19} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <StudioMenu
        label={`Actions for ${title()}`}
        align="start"
        width={200}
        triggerClass="topbar-project-menu"
        trigger={
          <>
            <span class="editor-project" title={props.title}>
              {props.title ?? '…'}
            </span>
            <ChevronDown size={14} />
          </>
        }
      >
        <button type="button" role="menuitem" onClick={props.onTogglePin}>
          <Pin />
          <span>{props.pinned ? 'Unpin from top' : 'Pin to top'}</span>
        </button>
        <button type="button" role="menuitem" onClick={props.onRename}>
          <Pencil />
          <span>Edit name</span>
        </button>
        <div class="menu-separator" />
        <button type="button" role="menuitem" class="menu-danger" onClick={props.onDelete}>
          <Trash2 />
          <span>Delete</span>
        </button>
      </StudioMenu>
    </>
  )
}
