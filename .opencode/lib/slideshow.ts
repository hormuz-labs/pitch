/**
 * slideshow.ts
 *
 * Pure HTML generator for the demo slideshow. Turns rendered PDF pages / images
 * (plus their word-derived regions) into a responsive, full-screen page
 * where every region is a transparent, ARIA-labelled hotspot. Because each
 * hotspot is a real `role="button"` element, atomic narrated emphasis can use
 * it as deterministic fallback geometry exactly like an element on a website.
 *
 * No @opencode-ai/plugin or Node-runtime imports — kept pure so it is
 * unit-testable and safe to import anywhere.
 */

import { defaultCalloutNoteRect, type StoryboardOverlay, type StoryboardRect } from '@saas/shared'

export interface SlideRegion {
  id: string
  text: string
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export interface Slide {
  /** Absolute path or file:///http(s) URL to the page/image. */
  image: string
  /** Targetable regions on this slide (empty for a plain image). */
  regions?: SlideRegion[]
  /** Persistent visual layers authored in the storyboard review editor. */
  overlays?: StoryboardOverlay[]
}

export interface SlideshowOptions {
  /** Optional big title card shown as the first slide. */
  title?: string
  /** Auto-advance interval in ms (0/undefined = manual navigation only). */
  durationMs?: number
  /** Visual motion used when changing pages. */
  transition?: 'fade' | 'slide' | 'zoom'
}

const MAX_LABEL_LEN = 60

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Absolute filesystem path → file:// URL; pass through anything already a URL. */
export function toFileUrl(p: string): string {
  if (/^(?:file|https?):\/\//i.test(p) || /^data:/i.test(p)) return p
  return `file://${p}`
}

/** Trim + collapse whitespace + cap length for an aria-label. */
export function labelForRegion(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > MAX_LABEL_LEN ? `${clean.slice(0, MAX_LABEL_LEN - 1)}…` : clean
}

function renderHotspot(r: SlideRegion): string {
  const label = escapeHtml(labelForRegion(r.text))
  const style = `left:${r.leftPct}%;top:${r.topPct}%;width:${r.widthPct}%;height:${r.heightPct}%`
  return `<button type="button" class="hotspot" role="button" tabindex="-1" aria-label="${label}" data-region="${escapeHtml(r.id)}" style="${style}"></button>`
}

function rectStyle(rect: StoryboardRect): string {
  return `left:${rect.leftPct}%;top:${rect.topPct}%;width:${rect.widthPct}%;height:${rect.heightPct}%`
}

function renderOverlay(overlay: StoryboardOverlay, id: string, defaultLayer: number): string {
  const overlayStyle = rectStyle(overlay.rect)
  const layerStyle = `z-index:${overlay.layer ?? defaultLayer}`
  if (overlay.kind === 'blur') {
    return `<div class="slide-overlay overlay-blur" aria-hidden="true" style="${overlayStyle};${layerStyle};backdrop-filter:blur(${overlay.strength}px);-webkit-backdrop-filter:blur(${overlay.strength}px)"></div>`
  }
  if (overlay.kind === 'media') {
    const giphyId = overlay.giphyId ? ` data-giphy-id="${escapeHtml(overlay.giphyId)}"` : ''
    return `<img class="slide-overlay overlay-media" src="${escapeHtml(overlay.url)}" alt="${escapeHtml(overlay.alt)}" data-source="${escapeHtml(overlay.source)}"${giphyId} style="${overlayStyle};${layerStyle}" />`
  }
  const noteRect = overlay.noteRect ?? defaultCalloutNoteRect(overlay.rect)
  const targetCenterX = overlay.rect.leftPct + overlay.rect.widthPct / 2
  const targetCenterY = overlay.rect.topPct + overlay.rect.heightPct / 2
  const noteCenterX = noteRect.leftPct + noteRect.widthPct / 2
  const noteCenterY = noteRect.topPct + noteRect.heightPct / 2
  const markerId = `callout-arrow-${id}`
  return `<div class="slide-overlay callout-layer color-${overlay.color}" style="inset:0;${layerStyle}">
          <svg class="callout-connector" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"></path></marker></defs>
            <line x1="${noteCenterX}" y1="${noteCenterY}" x2="${targetCenterX}" y2="${targetCenterY}" marker-end="url(#${markerId})"></line>
          </svg>
          <span class="overlay-callout color-${overlay.color} shape-${overlay.shape}" aria-hidden="true" style="${overlayStyle}"></span>
          <span class="callout-note" role="note" style="${rectStyle(noteRect)}">${escapeHtml(overlay.text)}</span>
        </div>`
}

function renderSlide(slide: Slide, index: number, active: boolean): string {
  const src = escapeHtml(toFileUrl(slide.image))
  const hotspots = (slide.regions ?? []).map(renderHotspot).join('')
  const overlays = (slide.overlays ?? [])
    .map((overlay, overlayIndex) =>
      renderOverlay(overlay, `${index}-${overlayIndex}`, overlayIndex),
    )
    .join('')
  return `<div class="slide${active ? ' active' : ''}" data-index="${index}">
      <div class="page">
        <img src="${src}" alt="Slide ${index + 1}" draggable="false" />
        <div class="slide-overlays">${overlays}</div>
        <div class="hotspots">${hotspots}</div>
      </div>
    </div>`
}

function renderTitleCard(title: string, index: number, active: boolean): string {
  return `<div class="slide title-slide${active ? ' active' : ''}" data-index="${index}">
      <div class="title-card"><h1>${escapeHtml(title)}</h1></div>
    </div>`
}

/**
 * Build the full slideshow HTML document. The first slide is a title card when
 * `opts.title` is set. Slides cross-fade; ArrowRight/Space/click advance;
 * `window.__goToSlide(i)` jumps programmatically.
 */
export function buildSlideshowHtml(slides: Slide[], opts: SlideshowOptions = {}): string {
  const parts: string[] = []
  let idx = 0
  if (opts.title) {
    parts.push(renderTitleCard(opts.title, idx, idx === 0))
    idx++
  }
  for (const slide of slides) {
    parts.push(renderSlide(slide, idx, idx === 0))
    idx++
  }
  const total = idx
  const autoAdvance =
    opts.durationMs && opts.durationMs > 0
      ? `setInterval(() => go(current + 1), ${Math.round(opts.durationMs)});`
      : ''
  const transition = opts.transition ?? 'fade'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.title || 'Demo')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    #app { position: relative; width: 100%; height: 100%; }
    .stage { position: absolute; inset: 0; }
    /* Inactive slides are visibility:hidden (not just opacity:0) so that ONLY
       the active slide's hotspots appear in Playwright's ARIA snapshot. All
       slides are stacked at inset:0; if inactive ones stayed in the a11y tree,
       the agent would see (and could zoom/annotate) another slide's overlapping
       hotspots — landing the highlight on the wrong slide. */
    .slide {
      position: absolute; inset: 0; opacity: 0; visibility: hidden;
      transition: opacity 450ms ease-in-out;
      display: flex; align-items: center; justify-content: center;
      padding: 0;
    }
    .slide.active { opacity: 1; visibility: visible; z-index: 1; }
    .transition-slide .slide { transform: translateX(6%); transition: opacity 450ms ease, transform 450ms cubic-bezier(.2,.8,.2,1); }
    .transition-slide .slide.active { transform: translateX(0); }
    .transition-zoom .slide { transform: scale(.94); transition: opacity 450ms ease, transform 520ms cubic-bezier(.2,.8,.2,1); }
    .transition-zoom .slide.active { transform: scale(1); }
    /* JS sizes .page to the largest uncropped rectangle that fits the live
       viewport. The image and its percentage hotspots then scale together. */
    .page {
      position: relative; display: flex;
      overflow: hidden; background: white;
    }
    .page img {
      display: block; width: 100%; height: 100%;
      user-select: none; -webkit-user-drag: none;
    }
    .hotspots { position: absolute; inset: 0; }
    .hotspot {
      position: absolute; background: transparent; border: 0; padding: 0;
      pointer-events: none; /* targets for zoom/annotate, never steal nav clicks */
    }
    .slide-overlays { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
    .slide-overlay { position: absolute; }
    .overlay-blur {
      overflow: hidden; border-radius: 10px;
      background: rgba(255,255,255,0.08);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
    }
    .overlay-media {
      display: block; object-fit: contain; border-radius: 10px;
      filter: drop-shadow(0 8px 18px rgba(15,23,42,0.22));
    }
    .callout-layer { --callout: #ec4899; }
    .callout-layer.color-blue { --callout: #2563eb; }
    .callout-layer.color-yellow { --callout: #eab308; }
    .callout-layer.color-green { --callout: #16a34a; }
    .overlay-callout {
      position: absolute;
      --callout: #ec4899;
      border: 4px solid var(--callout); border-radius: 10px;
    }
    .overlay-callout.color-blue { --callout: #2563eb; }
    .overlay-callout.color-yellow { --callout: #eab308; }
    .overlay-callout.color-green { --callout: #16a34a; }
    .overlay-callout.shape-circle { border-radius: 999px; }
    .callout-connector { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .callout-connector line { stroke: var(--callout); stroke-width: 3; vector-effect: non-scaling-stroke; }
    .callout-connector marker path { fill: var(--callout); }
    .callout-note {
      position: absolute; display: flex; align-items: center;
      padding: 12px 15px; border: 2px solid var(--callout); border-radius: 12px;
      background: rgba(255,255,255,0.96); color: #111827;
      font-size: clamp(14px, 1.5vw, 25px); font-weight: 650; line-height: 1.25;
      overflow: hidden; overflow-wrap: anywhere;
      box-shadow: 0 10px 28px rgba(15,23,42,0.22);
    }
    .title-slide { padding: 0; }
    .title-card {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%; padding: 120px;
      background: radial-gradient(circle at 50% 30%, #1b2233 0%, #0a0d14 70%);
    }
    .title-card h1 {
      color: #f4f6fb; font-size: 84px; font-weight: 700; line-height: 1.1;
      text-align: center; letter-spacing: -0.02em; max-width: 1400px;
      text-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    #progress {
      display: none;
      position: absolute; top: 0; left: 0; height: 4px; z-index: 20;
      background: linear-gradient(90deg, #6ea8fe, #a78bfa);
      transition: width 400ms ease; border-radius: 0 3px 3px 0;
    }
    #counter {
      display: none;
      position: absolute; bottom: 32px; left: 40px; z-index: 20;
      color: #e8ecf5; font-size: 15px; font-weight: 500;
      background: rgba(20,24,34,0.72); padding: 8px 14px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(6px);
    }
    #nav {
      position: absolute; bottom: 28px; right: 40px; z-index: 20;
      display: none; gap: 10px;
    }
    #nav button {
      background: rgba(20,24,34,0.72); color: #e8ecf5;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
      padding: 9px 18px; font-size: 14px; font-weight: 500; cursor: pointer;
      backdrop-filter: blur(6px); transition: background 150ms ease;
    }
    #nav button:hover { background: rgba(40,48,66,0.9); }
    /* Injected narrated-emphasis overlays live here. */
    #annotations { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
  </style>
</head>
<body>
  <div id="app" class="transition-${transition}" data-total="${total}">
    <div id="progress" style="width:${total > 0 ? (100 / total).toFixed(3) : 0}%"></div>
    <div class="stage">
      ${parts.join('\n      ')}
    </div>
    <div id="counter">1 / ${total}</div>
    <div id="nav">
      <button id="prev" type="button" aria-label="Previous slide">←</button>
      <button id="next" type="button" aria-label="Next slide">Next →</button>
    </div>
    <div id="annotations"></div>
  </div>
  <script>
    (function () {
      var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
      var counter = document.getElementById('counter');
      var progress = document.getElementById('progress');
      var total = slides.length;
      var current = 0;
      function fitPageImage(img) {
        if (!img || !img.naturalWidth || !img.naturalHeight) return;
        var page = img.closest('.page');
        if (!page) return;
        var scale = Math.min(window.innerWidth / img.naturalWidth, window.innerHeight / img.naturalHeight);
        page.style.width = Math.round(img.naturalWidth * scale) + 'px';
        page.style.height = Math.round(img.naturalHeight * scale) + 'px';
      }
      function fitPages() {
        Array.prototype.forEach.call(document.querySelectorAll('.page img'), function (img) {
          if (img.complete) fitPageImage(img);
          else img.addEventListener('load', function () { fitPageImage(img); }, { once: true });
        });
      }
      function go(i) {
        if (total === 0) return;
        var next = Math.max(0, Math.min(total - 1, i));
        if (next === current) return;
        slides[current].classList.remove('active');
        current = next;
        slides[current].classList.add('active');
        counter.textContent = (current + 1) + ' / ' + total;
        progress.style.width = ((current + 1) / total * 100).toFixed(3) + '%';
        var ann = document.getElementById('annotations');
        if (ann) ann.innerHTML = ''; // clear annotations on slide change
      }
      window.__goToSlide = go;
      var nextBtn = document.getElementById('next');
      var prevBtn = document.getElementById('prev');
      if (nextBtn) nextBtn.addEventListener('click', function () { go(current + 1); });
      if (prevBtn) prevBtn.addEventListener('click', function () { go(current - 1); });
      fitPages();
      window.addEventListener('resize', fitPages);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === ' ') go(current + 1);
        if (e.key === 'ArrowLeft') go(current - 1);
      });
      ${autoAdvance}
    })();
  </script>
</body>
</html>`
}
