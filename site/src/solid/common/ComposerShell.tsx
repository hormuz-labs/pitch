import type { JSX } from 'solid-js'

export function ComposerShell(props: {
  children: JSX.Element
  leading: JSX.Element
  trailing: JSX.Element
  class?: string
  footerClass?: string
  leadingClass?: string
  trailingClass?: string
  invalid?: boolean
}) {
  return (
    <div
      class={`composer-shell${props.class ? ` ${props.class}` : ''}`}
      classList={{ invalid: props.invalid }}
    >
      <div class="composer-shell__content">{props.children}</div>
      <div class={`composer-shell__footer${props.footerClass ? ` ${props.footerClass}` : ''}`}>
        <div
          class={`composer-shell__group composer-shell__leading${props.leadingClass ? ` ${props.leadingClass}` : ''}`}
        >
          {props.leading}
        </div>
        <div
          class={`composer-shell__group composer-shell__trailing${props.trailingClass ? ` ${props.trailingClass}` : ''}`}
        >
          {props.trailing}
        </div>
      </div>
    </div>
  )
}
