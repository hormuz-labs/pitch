import { For, type JSX, splitProps } from 'solid-js'

export interface GenerateButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * The hue value (0-360) for the button's highlight color.
   * Default is 210 (Blue).
   */
  hue?: number
  /**
   * If true, forces the button into its "Generating" state.
   * Driven by the operation's actual loading state.
   */
  isGenerating?: boolean
  /** Animate the ready label while the composer contains a prompt. */
  isReady?: boolean
}

export function GenerateButton(props: GenerateButtonProps) {
  const [local, buttonProps] = splitProps(props, [
    'hue',
    'isGenerating',
    'isReady',
    'class',
    'children',
  ])

  return (
    <div class="generate-button" style={{ '--highlight-color-hue': `${local.hue ?? 210}deg` }}>
      <style>{`
        .generate-button { position: relative; display: inline-flex; flex: none; isolation: isolate; margin: 4px; }
        .generate-button > .gen-btn {
          --border-radius: 24px;
          --padding: 4px;
          --transition: 0.4s;
          --button-color: #101010;

          user-select: none;
          position: relative;
          display: flex;
          justify-content: center;
          padding: 0.5em 0.5em 0.5em 1.1em;
          font-family: var(--font-sans);
          font-size: var(--generate-font-size, 12.5px);
          font-weight: 400;
          line-height: 1.5;
          min-height: 36px;
          align-items: center;
          color: #fff;

          background:
            linear-gradient(145deg, rgba(255,255,255,.08), transparent 42%),
            var(--button-color);

          box-shadow: none;

          border: 0;
          border-radius: var(--border-radius);
          cursor: pointer;

          transition: box-shadow var(--transition), border var(--transition), background-color var(--transition);
        }
        
        .gen-btn::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: inherit;
          pointer-events: none;
          background-image: linear-gradient(
            0deg,
            #fff,
            hsl(var(--highlight-color-hue), 100%, 70%),
            hsla(var(--highlight-color-hue), 100%, 70%, 50%),
            8%,
            transparent
          );
          background-position: 0 0;
          opacity: 0;
          transition: opacity var(--transition), filter var(--transition);
        }

        .gen-btn-letter {
          position: relative;
          display: inline-block;
          color: #fff;
          animation: gen-letter-anim 2s ease-in-out infinite;
          transition: color var(--transition), text-shadow var(--transition), opacity var(--transition);
        }

        @keyframes gen-letter-anim {
          50% {
            text-shadow: 0 0 3px rgba(255,255,255,0.533);
            color: #fff;
          }
        }

        .gen-btn-svg {
          flex: none;
          width: 24px;
          height: 24px;
          margin-right: 0.5rem;
          fill: #e8e8e8;
          animation: gen-flicker 2s linear infinite;
          animation-delay: 0.5s;
          filter: drop-shadow(0 0 2px rgba(255,255,255,0.6));
          transition: fill var(--transition), filter var(--transition), opacity var(--transition);
        }
        
        @keyframes gen-flicker {
          50% { opacity: 0.3; }
        }

        .gen-txt-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          min-width: 6.4em;
        }
        
        .gen-txt-1,
        .gen-txt-2 {
          position: absolute;
          word-spacing: -1em;
        }
        
        .gen-txt-1 {
          animation: gen-appear-anim 1s ease-in-out forwards;
        }
        
        .gen-txt-2 {
          opacity: 0;
        }
        
        @keyframes gen-appear-anim {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        /* Generating (Focus/Active) state */
        .gen-btn[data-generating="true"] .gen-txt-1 {
          animation: gen-opacity-anim 0.3s ease-in-out forwards;
          animation-delay: 1s;
        }
        .gen-btn[data-generating="true"] .gen-txt-2 {
          animation: gen-opacity-anim 0.3s ease-in-out reverse forwards;
          animation-delay: 1s;
        }
        
        @keyframes gen-opacity-anim {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        .gen-btn[data-generating="true"] .gen-btn-letter {
          animation: gen-focused-letter-anim 1s ease-in-out forwards, gen-letter-anim 1.2s ease-in-out infinite;
          animation-delay: 0s, 1s;
        }
        
        @keyframes gen-focused-letter-anim {
          0%, 100% { filter: blur(0px); }
          50% {
            transform: scale(2);
            filter: blur(10px) brightness(150%) drop-shadow(-36px 12px 12px hsl(var(--highlight-color-hue), 100%, 70%));
          }
        }
        
        .gen-btn[data-generating="true"] .gen-btn-svg {
          animation-duration: 1.2s;
          animation-delay: 0.2s;
        }

        .gen-btn[data-generating="true"]::before {
          box-shadow: 0 -8px 12px -6px rgba(255,255,255,0.2) inset,
            0 -16px 16px -8px hsla(var(--highlight-color-hue), 100%, 70%, 20%) inset,
            1px 1px 1px rgba(255,255,255,0.2), 
            2px 2px 2px rgba(255,255,255,0.067), 
            -1px -1px 1px rgba(0,0,0,0.133),
            -2px -2px 2px rgba(0,0,0,0.067);
        }
        
        .gen-btn[data-generating="true"]::after {
          opacity: 0.6;
          mask-image: linear-gradient(0deg, #fff, transparent);
          filter: brightness(100%);
        }

        /* Animation delays for letters */
        .gen-btn-letter:nth-child(1), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(1) { animation-delay: 0s; }
        .gen-btn-letter:nth-child(2), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(2) { animation-delay: 0.08s; }
        .gen-btn-letter:nth-child(3), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(3) { animation-delay: 0.16s; }
        .gen-btn-letter:nth-child(4), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(4) { animation-delay: 0.24s; }
        .gen-btn-letter:nth-child(5), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(5) { animation-delay: 0.32s; }
        .gen-btn-letter:nth-child(6), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(6) { animation-delay: 0.4s; }
        .gen-btn-letter:nth-child(7), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(7) { animation-delay: 0.48s; }
        .gen-btn-letter:nth-child(8), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(8) { animation-delay: 0.56s; }
        .gen-btn-letter:nth-child(9), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(9) { animation-delay: 0.64s; }
        .gen-btn-letter:nth-child(10), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(10) { animation-delay: 0.72s; }
        .gen-btn-letter:nth-child(11), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(11) { animation-delay: 0.8s; }
        .gen-btn-letter:nth-child(12), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(12) { animation-delay: 0.88s; }
        .gen-btn-letter:nth-child(13), .gen-btn[data-generating="true"] .gen-btn-letter:nth-child(13) { animation-delay: 0.96s; }

        /* Hover & Active states */
        .generate-button > .gen-btn:active:not(:disabled) {
          border: 0;
          background-color: hsla(var(--highlight-color-hue), 50%, 20%, 0.5);
        }
        .gen-btn:active::before {
          box-shadow: 0 -8px 12px -6px rgba(255,255,255,0.667) inset,
            0 -16px 16px -8px hsla(var(--highlight-color-hue), 100%, 70%, 80%) inset,
            1px 1px 1px rgba(255,255,255,0.267), 
            2px 2px 2px rgba(255,255,255,0.133), 
            -1px -1px 1px rgba(0,0,0,0.133),
            -2px -2px 2px rgba(0,0,0,0.067);
        }
        .gen-btn:active::after {
          opacity: 1;
          mask-image: linear-gradient(0deg, #fff, transparent);
          filter: brightness(200%);
        }
        .gen-btn:active .gen-btn-letter {
          text-shadow: 0 0 1px hsla(var(--highlight-color-hue), 100%, 90%, 90%);
          animation: none;
        }

        .generate-button > .gen-btn:hover:not(:disabled) {
          border: 0;
          background-color: var(--button-color);
        }
        .gen-btn:hover::before {
          box-shadow: 0 -8px 8px -6px rgba(255,255,255,0.667) inset,
            0 -16px 16px -8px hsla(var(--highlight-color-hue), 100%, 70%, 30%) inset,
            1px 1px 1px rgba(255,255,255,0.133), 
            2px 2px 2px rgba(255,255,255,0.067), 
            -1px -1px 1px rgba(0,0,0,0.133),
            -2px -2px 2px rgba(0,0,0,0.067);
        }
        .gen-btn:hover::after {
          opacity: 1;
          mask-image: linear-gradient(0deg, #fff, transparent);
        }
        .gen-btn:hover .gen-btn-svg {
          fill: #fff;
          filter: drop-shadow(0 0 3px hsl(var(--highlight-color-hue), 100%, 70%)) drop-shadow(0 -4px 6px rgba(0,0,0,0.6));
          animation: none;
        }
        .generate-button > .gen-btn:disabled { cursor: not-allowed; opacity: 1; }
        .gen-btn[data-ready="false"][data-generating="false"] {
          --button-color: #101010;
          color: #8c8c89;
          box-shadow: inset 0 1px rgba(255,255,255,.08);
        }
        .gen-btn[data-ready="false"][data-generating="false"] .gen-btn-svg,
        .gen-btn[data-ready="false"][data-generating="false"] .gen-submit-arrow {
          fill: #8c8c89;
          color: #8c8c89;
          filter: none;
        }
        .generate-button > .gen-btn:disabled[data-generating="true"] { cursor: progress; opacity: 1; }
        .gen-btn:disabled:not([data-generating="true"]) :is(.gen-btn-letter, .gen-btn-svg) { animation: none; }
        .gen-btn:disabled:not([data-generating="true"])::after { opacity: 0; }
        .gen-btn:focus-visible { outline: 2px solid hsl(var(--highlight-color-hue), 100%, 70%); outline-offset: 6px; }
        .gen-btn[data-ready="false"][data-generating="false"] :is(.gen-btn-letter, .gen-btn-svg) { animation: none; }
        .gen-btn[data-ready="true"][data-generating="false"]:not(:disabled) .gen-txt-1 .gen-btn-letter {
          animation-name: gen-ready-letter;
          animation-duration: 1.8s;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .gen-submit-arrow { display: none; width: 17px; height: 17px; color: #fff; fill: none; stroke: currentColor; stroke-width: 2; }
        @media (max-width: 520px) {
          .generate-button { margin: 1px; }
          .generate-button > .gen-btn {
            width: 38px;
            min-width: 38px;
            height: 38px;
            min-height: 38px;
            padding: 0;
            border-radius: 50%;
          }
          .gen-btn-svg, .gen-txt-wrapper { display: none; }
          .gen-submit-arrow { display: block; }
        }
        @keyframes gen-ready-letter {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .generate-button *, .gen-btn::before, .gen-btn::after { animation: none !important; transition: none !important; }
          .gen-btn .gen-btn-letter { color: #fff; }
          .gen-btn[data-generating="true"] .gen-txt-1 { opacity: 0; }
          .gen-btn[data-generating="true"] .gen-txt-2 { opacity: 1; }
        }
      `}</style>

      <button
        type="button"
        aria-label={local.isGenerating ? 'Generating' : 'Generate'}
        aria-busy={local.isGenerating ?? false}
        {...buttonProps}
        class={`gen-btn${local.class ? ` ${local.class}` : ''}`}
        data-generating={local.isGenerating ?? false}
        data-ready={local.isReady ?? false}
      >
        <svg
          class="gen-btn-svg"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>

        <span class="gen-txt-wrapper" aria-hidden="true">
          <span class="gen-txt-1">
            <For each={'Generate'.split('')}>
              {letter => <span class="gen-btn-letter">{letter}</span>}
            </For>
          </span>
          <span class="gen-txt-2">
            <For each={'Generating'.split('')}>
              {letter => <span class="gen-btn-letter">{letter}</span>}
            </For>
          </span>
        </span>
        <svg class="gen-submit-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5m0 0-6 6m6-6 6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  )
}

export default GenerateButton
