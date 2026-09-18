import { type JSX, Show, splitProps } from 'solid-js'

export interface GenerateButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  isGenerating?: boolean
  isReady?: boolean
}

export function GenerateButton(props: GenerateButtonProps) {
  const [local, buttonProps] = splitProps(props, ['isGenerating', 'isReady', 'class', 'children'])

  return (
    <>
      <style>{`
        .generate-button {
          width: 40px; height: 40px; flex: none; display: grid; place-items: center;
          padding: 0; border: 0; border-radius: 50%; background: #111; color: #fff;
          cursor: pointer; transition: background-color 140ms ease, transform 140ms ease;
        }
        .generate-button:hover:not(:disabled) { background: #000; transform: translateY(-1px); }
        .generate-button:active:not(:disabled) { transform: translateY(0); }
        .generate-button[data-ready="false"] { background: #d7d7d7; color: #fff; }
        .generate-button:disabled { cursor: not-allowed; }
        .generate-button[data-generating="true"] { background: #111; cursor: progress; }
        .generate-button svg {
          width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2;
          stroke-linecap: round; stroke-linejoin: round;
        }
        .generate-button__spinner {
          width: 16px; height: 16px; border: 2px solid rgb(255 255 255 / 40%);
          border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite;
        }
      `}</style>
      <button
        type="button"
        aria-label={local.isGenerating ? 'Generating' : 'Generate'}
        aria-busy={local.isGenerating ?? false}
        {...buttonProps}
        class={`generate-button${local.class ? ` ${local.class}` : ''}`}
        data-ready={local.isReady ?? false}
        data-generating={local.isGenerating ?? false}
      >
        <Show
          when={!local.isGenerating}
          fallback={<span class="generate-button__spinner" aria-hidden="true" />}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
        </Show>
      </button>
    </>
  )
}

export default GenerateButton
