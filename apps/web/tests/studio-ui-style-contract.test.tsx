import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'apps/web/src/studio/studio.css'), 'utf8')
const shellCss = readFileSync(resolve(process.cwd(), 'apps/web/src/styles/app-shell.css'), 'utf8')
const newProjectCss = readFileSync(
  resolve(process.cwd(), 'apps/web/src/styles/new-project.css'),
  'utf8',
)
const previewCss = readFileSync(
  resolve(process.cwd(), 'apps/web/src/solid/studio/preview-stage.css'),
  'utf8',
)
const appShell = readFileSync(
  resolve(process.cwd(), 'apps/web/src/solid/core/AppShell.tsx'),
  'utf8',
)

describe('Studio UI style contract', () => {
  it('themes the storyboard editor through the shared Studio palette', () => {
    expect(css).toMatch(
      /\.lv-studio \.studio-storyboard-view\s*\{[^}]*background:\s*var\(--paper\);/s,
    )
    expect(css).toMatch(
      /\.lv-studio \.storyboard-editor\s*\{[^}]*--sb-canvas:\s*var\(--paper\);[^}]*--sb-surface:\s*var\(--panel\);[^}]*--sb-surface-raised:\s*var\(--panel-2\);[^}]*--sb-line:\s*var\(--border\);[^}]*--sb-text:\s*var\(--ink\);[^}]*--sb-muted:\s*var\(--muted\);/s,
    )
    expect(css).toMatch(
      /\.lv-studio \.storyboard-editor__header\s*\{[^}]*background:\s*var\(--sb-surface\);/s,
    )
    expect(css).toMatch(
      /\.lv-studio \.storyboard-scenes,[\s\S]*?\.storyboard-inspector\s*\{[^}]*background:\s*var\(--sb-surface\);/s,
    )
    expect(css).toMatch(
      /\.lv-studio \.storyboard-editor :is\(input, textarea, select\)\s*\{[^}]*background:\s*var\(--sb-input\);/s,
    )
    expect(css).toMatch(
      /\.lv-studio \.storyboard-editor\s*\{[^}]*--sb-primary-bg:\s*#18181b;[^}]*--sb-primary-text:\s*#fff;/s,
    )
    expect(css).toMatch(
      /\[data-theme="dark"\] \.lv-studio \.storyboard-editor\s*\{[^}]*--sb-primary-bg:\s*#f1f1ef;[^}]*--sb-primary-text:\s*#111213;/s,
    )
    expect(css).toMatch(
      /\.storyboard-btn--primary[^}]*background:\s*var\(--sb-primary-bg\);[^}]*color:\s*var\(--sb-primary-text\);/s,
    )
  })

  it('opens project conversations without the global sidebar', () => {
    expect(appShell).toContain(
      "window.innerWidth < 1024 || routeKey(location.pathname) === 'studio'",
    )
    expect(appShell).toContain(
      "if (route === 'studio' && previousRoute !== 'studio') setCollapsed(true)",
    )
  })

  it('keeps the shared composer groups flexible at narrow widths', () => {
    expect(css).toContain('.lv-studio .composer-shell__footer')
    expect(css).toContain('.lv-studio .composer-shell__group')
    expect(css).toContain('min-width: 0;')
    expect(css).toContain('@container (max-width: 380px)')
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-composer-footer\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*gap:\s*6px;/s,
    )
    expect(previewCss).toMatch(
      /\.lv-studio \.job-composer-footer\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*gap:\s*5px;/s,
    )
  })

  it('never clips the Studio composer credit balance', () => {
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.composer-credits\s*\{[^}]*min-width:\s*max-content;[^}]*max-width:\s*none;[^}]*overflow:\s*visible;/s,
    )
    expect(css).not.toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.composer-credits\s*\{[^}]*max-width:\s*(?:88|112)px;/s,
    )
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-composer-actions\s*\{[^}]*flex:\s*1 1 auto;[^}]*justify-content:\s*flex-end;[^}]*overflow:\s*hidden;/s,
    )
  })

  it('protects the /new credit balance before secondary mobile actions', () => {
    expect(newProjectCss).toMatch(
      /\.new-project-topnav__credits\s*\{[^}]*flex:\s*none;[^}]*min-width:\s*max-content;[^}]*overflow:\s*visible;/s,
    )
    expect(newProjectCss).toMatch(
      /\.new-project-topnav__credits button > span\s*\{[^}]*min-width:\s*max-content;[^}]*white-space:\s*nowrap;/s,
    )
    expect(newProjectCss).toMatch(
      /@media \(max-width: 380px\)[\s\S]*\.new-project-topnav__secondary-action\s*\{\s*display:\s*none !important;/s,
    )
  })

  it('stops desktop chat resizing before composer controls break', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    expect(view).toContain('Math.max(400, innerWidth * 0.34)')
    expect(view).toContain('Math.max(400, drag.w + e.clientX - drag.x)')
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.edit-sidebar\s*\{[^}]*min-width:\s*400px;/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio:not\(\.new-project-page\) \.edit-sidebar\s*\{[^}]*min-width:\s*0;/s,
    )
  })

  it('uses larger readable chat copy without enlarging activity labels', () => {
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.msg:not\(\.tool\)\s*\{[^}]*font-size:\s*15px;/s,
    )
  })

  it('keeps the studio composer compact on desktop and mobile', () => {
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-composer-box\s*\{[^}]*min-height:\s*104px;[^}]*border-radius:\s*22px;/s,
    )
    expect(previewCss).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-composer-box\s*\{[^}]*min-height:\s*84px;[^}]*gap:\s*4px;[^}]*border-radius:\s*20px;/s,
    )
    expect(previewCss).toMatch(
      /\.lv-studio \.job-composer-box textarea\s*\{[^}]*height:\s*32px;[^}]*min-height:\s*32px;[^}]*max-height:\s*min\(140px, 24dvh\);/s,
    )
  })

  it('uses the full chat-only surface with centered readable content', () => {
    expect(previewCss).toMatch(
      /\.lv-studio:not\(\.new-project-page\)\.is-chat-only \.edit-sidebar\s*\{[^}]*--chat-content-width:\s*600px;[^}]*width:\s*100%;[^}]*max-width:\s*none;/s,
    )
    expect(previewCss).toMatch(
      /\.lv-studio\.is-chat-only \.feed > \.thread\s*\{[^}]*max-width:\s*var\(--chat-content-width\);[^}]*margin-inline:\s*auto;/s,
    )
    expect(previewCss).toMatch(
      /\.lv-studio\.is-chat-only \.studio-composer-dock\s*\{[^}]*max-width:\s*calc\(var\(--chat-content-width\) \+ var\(--chat-inset\) \+ var\(--chat-inset\)\);[^}]*margin-inline:\s*auto;/s,
    )
  })

  it('uses a borderless add icon and a fixed circular send control', () => {
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-attach-plus\s*\{[^}]*width:\s*32px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    )
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-send-round\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;[^}]*max-width:\s*38px;[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%;/s,
    )
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-send-round:disabled\s*\{[^}]*background:\s*#b8b8b6;[^}]*color:\s*#ffffff;/s,
    )
  })

  it('uses the same compact circular geometry for stopping generation', () => {
    expect(css).toMatch(
      /\.lv-studio \.job-stop-task\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;[^}]*max-width:\s*38px;[^}]*border-radius:\s*50%;[^}]*background:\s*#111111;[^}]*color:\s*#ffffff;/s,
    )
    expect(css).not.toMatch(/\.job-send-round\.stop\s*\{[^}]*background:\s*var\(--danger\)/s)
    const composer = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/Composer.tsx'),
      'utf8',
    )
    expect(composer).toContain('aria-label="Stop generation"')
    expect(composer).toContain('class="job-stop-task job-send-round"')
    expect(composer).toContain('<Square size={11} fill="currentColor" aria-hidden="true" />')
    expect(composer).not.toContain('<span>Stop</span>')
  })

  it('keeps Stop in the composer instead of duplicating it in the Studio top bar', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    expect(view).not.toMatch(/class="topbar-btn primary"[^>]*s\.stop/)
    expect(view).not.toContain('>\n                      Stop\n')
  })

  it('shows a loading state instead of the empty composer before the project loads', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    const store = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/useProject.ts'),
      'utf8',
    )
    expect(store).toContain('[initialLoading, setInitialLoading] = createSignal(true)')
    expect(store).toContain('if (live) setInitialLoading(false)')
    expect(view).toContain('when={!s.initialLoading}')
    expect(view).toContain('Opening project…')
    expect(view).not.toContain('class="chat-welcome"')
    expect(view).not.toContain('What do you want to create?')
  })

  it('keeps the portaled model catalog inside the mobile viewport', () => {
    expect(css).toMatch(
      /\.model-menu--catalog\.is-portal\s*\{[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*calc\(100vw - 24px\);[^}]*max-height:\s*min\(520px, calc\(100dvh - 24px\)\);/s,
    )
  })

  it('styles the jump-to-latest affordance as a floating circular control', () => {
    expect(css).toMatch(
      /\.feed-jump-latest\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*calc\(100% \+ 10px\);[^}]*width:\s*40px;[^}]*height:\s*40px;[^}]*border-radius:\s*50%;[^}]*box-shadow:\s*0 3px 10px rgb\(0 0 0 \/ 8%\);/s,
    )
    expect(css).toMatch(/\.studio-composer-dock\s*\{[^}]*position:\s*relative;/s)
  })

  it('shows the jump-to-latest control only while away from the bottom', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    expect(view).toContain('when={showJumpToLatest()}')
    expect(view).toContain('class="studio-composer-dock"')
    expect(view).toContain('setShowJumpToLatest(!followFeed)')
    expect(view).toContain('setShowJumpToLatest(false)')
  })

  it('keeps composer tray chrome transparent inside the outer panel', () => {
    expect(css).toMatch(
      /\.lv-studio:not\(\.new-project-page\) \.job-composer\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    )
  })

  it('uses one inset rounded outer chat panel on mobile', () => {
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio:not\(\.new-project-page\) \.edit-sidebar\s*\{[^}]*margin:\s*0 8px 8px;[^}]*overflow:\s*hidden;[^}]*border-radius:\s*20px;/s,
    )
  })

  it('attaches the expanded mobile chat toggle to the chat panel', () => {
    expect(previewCss).toMatch(
      /\.is-chat-expanded \.edit-sidebar\s*\{[^}]*margin-bottom:\s*0;[^}]*border-radius:\s*20px 20px 0 0;/s,
    )
    expect(previewCss).toMatch(
      /\.is-chat-expanded \.mobile-chat-toggle\s*\{[^}]*flex-basis:\s*42px;[^}]*margin:\s*-8px 8px 0;[^}]*border-top:\s*0;[^}]*border-radius:\s*0 0 20px 20px;/s,
    )
    expect(previewCss).toMatch(
      /\.is-chat-expanded \.mobile-chat-toggle__status,[\s\S]*\.is-chat-expanded \.mobile-chat-toggle > svg:first-child\s*\{\s*display:\s*none;/s,
    )
  })

  it('keeps project metadata out of the Studio title bar', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    const filesControl = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioTopbarFiles.tsx'),
      'utf8',
    )
    expect(view).not.toContain('class="project-kind"')
    expect(view).not.toContain('class={`project-state')
    expect(view).not.toContain('attachmentCount=')
    expect(view).toContain('<StudioTopbarFiles')
    expect(filesControl).toMatch(/Files \(\$\{props\.count\}\)/)
    expect(filesControl).toContain('class="preview-pane-tab__count"')
    expect(view).toContain('<MoreHorizontal class="topbar-more-icon"')
    expect(view).toContain('class="export-row export-row-action mobile-share-action"')
    expect(view).not.toContain('<Link size={14} />')
  })

  it('shows separate Share and Export actions on desktop and More on small screens', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    expect(view).toContain('class="topbar-btn topbar-share"')
    expect(view).toContain('class="topbar-export-label">Export</span>')
    expect(view).toContain('class="topbar-more-label">More</span>')
    expect(css).toMatch(/\.topbar-more-icon,[\s\S]*\.topbar-more-label\s*\{\s*display:\s*none;/)
    expect(css).toMatch(/\.mobile-share-action\s*\{\s*display:\s*none;/)
    expect(css).toMatch(
      /@media \(max-width: 620px\)[\s\S]*\.topbar-share\s*\{\s*display:\s*none;[\s\S]*\.topbar-more-icon\s*\{\s*display:\s*inline-flex;[\s\S]*\.topbar-more-label\s*\{\s*display:\s*none;[\s\S]*\.mobile-share-action\s*\{\s*display:\s*flex;/s,
    )
  })

  it('keeps the export menu readable and clearly sectioned', () => {
    expect(css).toMatch(/\.lv-studio \.export-menu\s*\{[^}]*width:\s*300px;[^}]*padding:\s*8px;/s)
    expect(css).toMatch(/\.lv-studio \.export-row\s*\{[^}]*min-height:\s*52px;/s)
    expect(css).toMatch(/\.export-section-heading--video\s*\{[^}]*border-bottom:/s)
    expect(css).toMatch(/\.export-hint--status\s*\{[^}]*background:\s*var\(--panel-2\);/s)
  })

  it('keeps deck scrollers usable while hiding their scrollbar chrome', () => {
    expect(css).toMatch(
      /\.deck-editor-scrollable[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;/,
    )
    expect(css).toMatch(/\.deck-editor-scrollable::-webkit-scrollbar\s*\{\s*display:\s*none;/)
  })

  it('keeps the active deck selector legible over adaptive slide chrome', () => {
    expect(css).toMatch(
      /\.deck-preview \.preview-inspect-btn\.active,[\s\S]*\.deck-preview \.preview-inspect-btn\.active:hover:not\(:disabled\),[\s\S]*\.deck-preview \.select-toggle\.on,[\s\S]*\.deck-preview \.select-toggle\.on:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--accent\);[^}]*color:\s*#fff;[^}]*border-color:\s*var\(--accent\);/s,
    )
  })

  it('keeps the files count visible while collapsing its label on narrow screens', () => {
    expect(css).toMatch(
      /\.preview-pane-tab__count\s*\{[^}]*background:\s*var\(--ink\);[^}]*color:\s*var\(--panel\);/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 620px\)[\s\S]*\.preview-pane-tab__label\s*\{\s*display:\s*none;/s,
    )
    expect(css).not.toMatch(
      /@media \(max-width: 620px\)[\s\S]*\.preview-pane-tab__count\s*\{\s*display:\s*none;/s,
    )
  })

  it('shows the borderless new-chat shortcut only when the main sidebar is collapsed', () => {
    expect(css).toMatch(
      /\.topbar-new-chat\s*\{[^}]*width:\s*35\.2px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    )
    expect(css).toMatch(
      /\.app-shell-bg:not\(\.is-sidebar-collapsed\)[\s\S]*?\.topbar-new-chat\s*\{\s*display:\s*none;/,
    )
    expect(css).toMatch(
      /\.app-shell-bg\.is-sidebar-collapsed[\s\S]*?\.job-topbar\.job-topbar-split\s*\{\s*padding-left:\s*55px;/,
    )
  })

  it('swaps sidebar completion state for the overflow menu on hover or focus', () => {
    expect(shellCss).toContain('.sidebar-recent-project__state.is-working {')
    expect(shellCss).toContain('.sidebar-recent-project__state.is-ready i')
    expect(shellCss).toMatch(
      /\.sidebar-recent-project:is\(:hover, :focus-within\) \.sidebar-recent-project__actions[^}]*opacity: 1;/s,
    )
    expect(shellCss).toMatch(
      /\.sidebar-recent-project:is\(:hover, :focus-within\) \.sidebar-recent-project__state[^}]*opacity: 0;/s,
    )
    expect(shellCss).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*\.conversation-sidebar \.sidebar-recent-project__actions\s*\{\s*pointer-events: auto;/,
    )
    expect(shellCss).not.toMatch(
      /@media \(pointer: coarse\)[^{]*\{[^}]*\.sidebar-recent-project__actions[^}]*opacity:\s*1;/s,
    )
    expect(shellCss).toMatch(
      /\.sidebar-recent-project__actions\s*\{[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s,
    )
  })

  it('wires the deck editor chrome for deck previews', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    const editor = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/deck/DeckEditor.tsx'),
      'utf8',
    )
    expect(view).toContain('import { DeckEditor }')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: matching the JSX source verbatim
    expect(view).toContain('${src()}&studio=1&edit=1')
    // The owner always gets the editor. The plain, non-saving DeckPreview is
    // only for read-only admin review, and its Match must come first.
    const reviewMatch = view.indexOf("<Match when={kind() === 'deck' && !!src() && s.readOnly}>")
    const editorMatch = view.indexOf("<Match when={kind() === 'deck' && !!src()}>")
    expect(reviewMatch).toBeGreaterThan(-1)
    expect(reviewMatch).toBeLessThan(editorMatch)
    expect(view.match(/<DeckPreview /g)).toHaveLength(1)
    // biome-ignore lint/suspicious/noTemplateCurlyInString: matching the JSX source verbatim
    expect(view).toContain('<DeckPreview store={s} src={`${src()}&studio=1`} />')
    // Deck projects own their slides bar; the tray must not double-render slides.
    expect(view).toContain("description?.preview?.kind === 'deck') return null")
    // The editor keeps the inspect bridge for agent targeting while editing.
    expect(editor).toContain("post({ type: 'deck_edit_mode', enabled: !s.inspectMode })")
    expect(editor).toContain("post({ type: 'studio_toggle_inspect', enabled: s.inspectMode")
    expect(css).toContain('.lv-studio .deck-editor-toolbar {')
    expect(css).toContain('.lv-studio .deck-editor-selbox {')
    expect(css).toContain('.lv-studio .deck-slides-bar {')
    // Thumb iframes are 1280px documents scaled by transform; the flex
    // thumbnail wrapper must not shrink them before the transform applies.
    expect(css).toMatch(/\.lv-studio \.deck-slide-thumb-frame\s*\{[^}]*flex:\s*none;/s)
    // …and the wrapper must not center them either: with transform-origin
    // 0 0 a centered 1280px iframe paints outside the clip box (blank thumb).
    expect(css).toMatch(/\.lv-studio \.deck-slide-thumb\s*\{[^}]*display:\s*block;/s)
    // The stage fits one whole slide on both axes (width AND height).
    expect(editor).toContain('setScale(fitScale(r.width, r.height))')
  })

  it('uses a filled highlight instead of an outlined card for the selected chat', () => {
    expect(shellCss).toMatch(
      /\.sidebar-recent-project\.is-active\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--shell-hover\);/s,
    )
  })

  it('collapses deck preview chrome on mobile when chat is expanded so the conversation is visible', () => {
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio:not\(\.is-chat-expanded\) \.deck-editor\s*\{[^}]*min-height:\s*min\(78dvh, 720px\);/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio\.is-chat-expanded \.deck-editor\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio\.is-chat-expanded \.deck-slides-bar\s*\{[^}]*display:\s*none;/s,
    )
    expect(previewCss).toMatch(
      /\.lv-studio:not\(\.is-chat-expanded\) \.player-stage:has\(\.deck-editor\)\s*\{[^}]*aspect-ratio:\s*auto;/s,
    )
  })

  it('keeps deck formatting toolbar single-row scrollable and banner responsive', () => {
    expect(css).toMatch(
      /\.lv-studio \.deck-editor-toolbar\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s,
    )
    expect(css).toMatch(
      /\.lv-studio \.deck-editor-toolbar-wrap\s*\{[^}]*max-width:\s*calc\(100% - 16px\);/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio \.deck-editor \.select-toggle\s*\{\s*display:\s*none;/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 840px\)[\s\S]*\.lv-studio \.preview-inspect-banner\s*\{[^}]*text-overflow:\s*ellipsis;/s,
    )
  })

  it('adapts deck dialog contrast and styles the first-time showcase tour', () => {
    expect(css).toContain(".lv-studio .deck-preview[data-slide-tone='dark']")
    expect(css).toContain('--deck-chrome-bg: rgba(250, 249, 246, 0.97)')
    expect(css).toMatch(
      /\.lv-studio \.deck-preview :is\([\s\S]*\.deck-editor-toolbar,[\s\S]*\.deck-editor-insert,[\s\S]*\.deck-editor-chart,[\s\S]*\)\s*\{[^}]*background:\s*var\(--deck-chrome-bg\);/s,
    )
    expect(css).toMatch(/\.lv-studio \.deck-slides-add-menu\s*\{[^}]*background:\s*#18191c;/s)
    expect(css).toMatch(
      /\.deck-tour-shade\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/s,
    )
    expect(css).toMatch(
      /\.deck-tour-ring\s*\{[^}]*border:\s*2px solid rgba\(255, 255, 255, 0\.9\);/s,
    )
    expect(css).toMatch(/\.deck-tour-card\s*\{[^}]*border-radius:\s*16px;/s)
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.deck-tour-card\s*\{[^}]*width:\s*calc\(100vw - 32px\);/s,
    )
  })

  it('moves preview and files into the More menu on small screens and hides topbar tabs', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/StudioView.tsx'),
      'utf8',
    )
    expect(css).toMatch(
      /@media \(max-width: 620px\)[\s\S]*\.lv-studio:not\(\.new-project-page\) \.topbar-split-tabs\s*\{\s*display:\s*none;/s,
    )
    expect(view).toContain('span class="export-section-title">View</span>')
    expect(view).toContain('<MonitorPlay size={15} />')
    expect(view).toContain('Files ({s.assets.length})')
  })

  it('centers and scales play preview buttons in the music picker', () => {
    expect(css).toMatch(
      /\.lv-studio \.track-play\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*border-radius:\s*50%;[^}]*width:\s*28px;[^}]*height:\s*28px;/s,
    )
    const picker = readFileSync(
      resolve(process.cwd(), 'apps/web/src/solid/studio/MusicPicker.tsx'),
      'utf8',
    )
    expect(picker).toContain('<Play size={12} fill="currentColor" />')
    expect(picker).toContain('<Pause size={12} fill="currentColor" />')
  })
})
