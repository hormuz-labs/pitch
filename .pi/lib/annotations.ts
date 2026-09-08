/**
 * annotations.ts
 *
 * Pure builders for on-screen annotations (circle / box / highlighter /
 * underline / arrow / spotlight). `pitch demo narrate.emphasis` runs the JS returned
 * by `buildAnnotateEvalJs` inside the page via `playwright-cli eval`; it reads
 * the target element's live bounding rect (or an explicit rect) and appends an
 * animated overlay into a fixed `#annotations` layer, so the annotation is
 * captured by the recording and pans/zooms with the page.
 *
 * No @opencode-ai/plugin or Node imports — pure and unit-testable.
 */

export type AnnotationStyle =
  | 'box'
  | 'circle'
  | 'underline'
  | 'highlighter'
  | 'arrow'
  | 'spotlight'
  | 'pulse'
  | 'bracket'

export const ANNOTATION_STYLES: AnnotationStyle[] = [
  'box',
  'circle',
  'underline',
  'highlighter',
  'arrow',
  'spotlight',
  'pulse',
  'bracket',
]

export interface AnnotateOptions {
  style: AnnotationStyle
  color?: string
  /** Optional element ref for the annotation target (e.g. "e53"). */
  ref?: string
  /** Explicit rect in percent of viewport; used when no ref is given. */
  rect?: { leftPct: number; topPct: number; widthPct: number; heightPct: number }
}

const DEFAULT_COLOR = '#ff3b6b'
const DEFAULT_HIGHLIGHTER = '#ffe14d'

/** Only allow safe CSS color literals so nothing can break out of the CSS/JS. */
export function sanitizeColor(color: string | undefined, style: AnnotationStyle): string {
  const fallback = style === 'highlighter' ? DEFAULT_HIGHLIGHTER : DEFAULT_COLOR
  if (!color) return fallback
  const c = color.trim()
  const ok =
    /^#[0-9a-fA-F]{3,8}$/.test(c) ||
    /^rgba?\(\s*[\d.\s,%/]+\)$/.test(c) ||
    /^hsla?\(\s*[\d.\s,%/]+\)$/.test(c) ||
    /^[a-zA-Z]{3,20}$/.test(c)
  return ok ? c : fallback
}

/** Padding (px) the overlay wrapper adds around the target rect, per style. */
export function padForStyle(style: AnnotationStyle): number {
  switch (style) {
    case 'circle':
      return 10
    case 'box':
      return 8
    case 'spotlight':
      return 6
    case 'highlighter':
      return 2
    case 'pulse':
    case 'bracket':
      return 8
    default:
      return 0
  }
}

/** CSS injected once into the page; drives all annotation animations. */
export function annotationStyleCss(): string {
  return [
    '.pitch-ann{position:fixed;pointer-events:none;animation:pitchAnnIn .25s ease-out both}',
    '@keyframes pitchAnnIn{from{opacity:0}to{opacity:1}}',
    '.pitch-ann-box{position:absolute;inset:0;border:3px solid var(--c);border-radius:10px;box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 22%,transparent),0 0 22px color-mix(in srgb,var(--c) 45%,transparent);animation:pitchPop .32s cubic-bezier(.2,.8,.3,1.25) both}',
    '@keyframes pitchPop{from{transform:scale(1.08);opacity:0}to{transform:scale(1);opacity:1}}',
    '.pitch-ann svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.pitch-ann-ellipse{fill:none;stroke:var(--c);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:340;stroke-dashoffset:340;animation:pitchDraw .6s ease-out forwards}',
    '@keyframes pitchDraw{to{stroke-dashoffset:0}}',
    '.pitch-ann-underline{fill:none;stroke:var(--c);stroke-width:5;stroke-linecap:round;stroke-dasharray:220;stroke-dashoffset:220;animation:pitchDraw .45s ease-out forwards}',
    '.pitch-ann-hl{position:absolute;inset:0;background:var(--c);opacity:.38;mix-blend-mode:multiply;border-radius:4px;transform-origin:left center;transform:scaleX(0);animation:pitchSwipe .4s ease-out forwards}',
    '@keyframes pitchSwipe{to{transform:scaleX(1)}}',
    '.pitch-ann-spot{position:absolute;inset:0;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,10,16,.0);animation:pitchSpot .35s ease-out forwards}',
    '@keyframes pitchSpot{to{box-shadow:0 0 0 9999px rgba(8,10,16,.62)}}',
    '.pitch-ann-arrow line,.pitch-ann-arrow polyline{fill:none;stroke:var(--c);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}',
    '.pitch-ann-arrow{animation:pitchArrowIn .35s cubic-bezier(.2,.8,.3,1.2) both}',
    '@keyframes pitchArrowIn{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}',
    '.pitch-ann-pulse{position:absolute;inset:0;border:3px solid var(--c);border-radius:14px;box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 55%,transparent);animation:pitchPulse .75s ease-out 2 both}',
    '@keyframes pitchPulse{0%{transform:scale(.94);opacity:0;box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 55%,transparent)}45%{opacity:1}100%{transform:scale(1.08);opacity:.8;box-shadow:0 0 0 14px transparent}}',
    '.pitch-ann-bracket{fill:none;stroke:var(--c);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:240;stroke-dashoffset:240;animation:pitchDraw .55s ease-out forwards}',
  ].join('')
}

/** Inner markup for the overlay wrapper, per style. */
export function overlayInnerHtml(style: AnnotationStyle): string {
  switch (style) {
    case 'box':
      return '<div class="pitch-ann-box"></div>'
    case 'spotlight':
      return '<div class="pitch-ann-spot"></div>'
    case 'highlighter':
      return '<div class="pitch-ann-hl"></div>'
    case 'circle':
      return '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse class="pitch-ann-ellipse" cx="50" cy="50" rx="46" ry="43"/></svg>'
    case 'underline':
      return '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><line class="pitch-ann-underline" x1="3" y1="90" x2="97" y2="90"/></svg>'
    case 'arrow':
      return '<svg class="pitch-ann-arrow" viewBox="0 0 120 40" preserveAspectRatio="none"><line x1="6" y1="20" x2="96" y2="20"/><polyline points="80,8 100,20 80,32"/></svg>'
    case 'pulse':
      return '<div class="pitch-ann-pulse"></div>'
    case 'bracket':
      return '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="pitch-ann-bracket" d="M18 4H4V96H18 M82 4H96V96H82"/></svg>'
  }
}

/**
 * Build the JS to run via `playwright-cli eval`. For a ref target the emitted
 * function takes the element (`el => {...}`); for an explicit rect it takes no
 * args and derives px from the viewport. Uses string concatenation (no template
 * literals) so it survives shell escaping cleanly.
 */
export function buildAnnotateEvalJs(opts: AnnotateOptions): string {
  const style = opts.style
  const color = sanitizeColor(opts.color, style)
  const pad = padForStyle(style)
  const css = annotationStyleCss()
  const markup = overlayInnerHtml(style)

  // Shared body operating on a `rect` variable already in scope.
  const body =
    'var css=' +
    JSON.stringify(css) +
    ';' +
    "if(!document.getElementById('pitch-ann-style')){var st=document.createElement('style');st.id='pitch-ann-style';st.textContent=css;document.head.appendChild(st);}" +
    "var layer=document.getElementById('annotations');" +
    "if(!layer){layer=document.createElement('div');layer.id='annotations';layer.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none';document.body.appendChild(layer);}" +
    'var pad=' +
    pad +
    ';var st2=' +
    JSON.stringify(style) +
    ';var L,T,W,H;' +
    "if(st2==='arrow'){L=rect.left-124;T=rect.top+rect.height/2-20;W=120;H=40;}" +
    'else{L=rect.left-pad;T=rect.top-pad;W=rect.width+pad*2;H=rect.height+pad*2;}' +
    "var w=document.createElement('div');w.className='pitch-ann';" +
    "w.style.cssText='position:fixed;left:'+L+'px;top:'+T+'px;width:'+W+'px;height:'+H+'px';" +
    "w.style.setProperty('--c'," +
    JSON.stringify(color) +
    ');w.innerHTML=' +
    JSON.stringify(markup) +
    ';layer.appendChild(w);' +
    'return {ok:true,left:L,top:T,width:W,height:H};'

  if (opts.rect) {
    const r = opts.rect
    return (
      '() => { var vw=window.innerWidth, vh=window.innerHeight;' +
      'var rect={left:' +
      r.leftPct +
      '/100*vw,top:' +
      r.topPct +
      '/100*vh,width:' +
      r.widthPct +
      '/100*vw,height:' +
      r.heightPct +
      '/100*vh};' +
      body +
      ' }'
    )
  }
  return (
    "el => { if(!el) return {ok:false,error:'no element'};" +
    // Refuse to draw on a target that isn't actually visible on the current
    // slide (a stale ref from another, now-hidden slide). Otherwise the overlay
    // would land at the hidden element's coordinates over the wrong slide.
    'var cs=getComputedStyle(el);' +
    "if(cs.visibility==='hidden'||cs.display==='none'||!el.getClientRects().length){" +
    "return {ok:false,error:'target not visible on the current slide — re-snapshot and annotate a ref from the visible slide'};}" +
    'var rect=el.getBoundingClientRect();' +
    body +
    ' }'
  )
}

/** JS to clear all annotations from the page. */
export function buildClearAnnotationsJs(): string {
  return "() => { var a=document.getElementById('annotations'); if(a){a.innerHTML='';} return {ok:true}; }"
}
