/**
 * slideshow.ts
 *
 * Pure HTML generator for the demo slideshow. Turns rendered PDF pages / images
 * (plus their word-derived regions) into a premium, full-screen 1920x1080 page
 * where every region is a transparent, ARIA-labelled hotspot. Because each
 * hotspot is a real `role="button"` element, the existing zoom_in + cursor +
 * annotate machinery can target it exactly like an element on a live website.
 *
 * No @opencode-ai/plugin or Node-runtime imports — kept pure so it is
 * unit-testable and safe to import anywhere.
 */

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
}

export interface SlideshowOptions {
  /** Optional big title card shown as the first slide. */
  title?: string
  /** Auto-advance interval in ms (0/undefined = manual navigation only). */
  durationMs?: number
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
  if (/^(file|https?):\/\//i.test(p)) return p
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

function renderSlide(slide: Slide, index: number, active: boolean): string {
  const src = escapeHtml(toFileUrl(slide.image))
  const hotspots = (slide.regions ?? []).map(renderHotspot).join('')
  return `<div class="slide${active ? ' active' : ''}" data-index="${index}">
      <div class="page">
        <img src="${src}" alt="Slide ${index + 1}" draggable="false" />
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.title || 'Demo')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1920px; height: 1080px; overflow: hidden;
      background: radial-gradient(circle at 50% 30%, #1b2233 0%, #0a0d14 70%);
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
      padding: 72px 96px 96px;
    }
    .slide.active { opacity: 1; visibility: visible; z-index: 1; }
    /* .page shrinks to the contained image so hotspot %s map onto the image
       with no JS measurement; hotspots + image scale together. */
    .page {
      position: relative; display: flex;
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 24px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
    }
    /* Cap to the stage minus .slide padding (1920-96*2 x 1080-72-96) so the
       page is contained deterministically; .page then shrinks to the image and
       hotspot %s map onto it exactly. Percentage max-height can't be used here
       because .page has auto height. */
    .page img {
      display: block; max-width: 1728px; max-height: 912px;
      object-fit: contain; user-select: none; -webkit-user-drag: none;
    }
    .hotspots { position: absolute; inset: 0; }
    .hotspot {
      position: absolute; background: transparent; border: 0; padding: 0;
      pointer-events: none; /* targets for zoom/annotate, never steal nav clicks */
    }
    .title-slide { padding: 0; }
    .title-card {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%; padding: 120px;
    }
    .title-card h1 {
      color: #f4f6fb; font-size: 84px; font-weight: 700; line-height: 1.1;
      text-align: center; letter-spacing: -0.02em; max-width: 1400px;
      text-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    #progress {
      position: absolute; top: 0; left: 0; height: 4px; z-index: 20;
      background: linear-gradient(90deg, #6ea8fe, #a78bfa);
      transition: width 400ms ease; border-radius: 0 3px 3px 0;
    }
    #counter {
      position: absolute; bottom: 32px; left: 40px; z-index: 20;
      color: #e8ecf5; font-size: 15px; font-weight: 500;
      background: rgba(20,24,34,0.72); padding: 8px 14px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(6px);
    }
    #nav {
      position: absolute; bottom: 28px; right: 40px; z-index: 20;
      display: flex; gap: 10px;
    }
    #nav button {
      background: rgba(20,24,34,0.72); color: #e8ecf5;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
      padding: 9px 18px; font-size: 14px; font-weight: 500; cursor: pointer;
      backdrop-filter: blur(6px); transition: background 150ms ease;
    }
    #nav button:hover { background: rgba(40,48,66,0.9); }
    /* Injected annotation overlays live here (drawn by the annotate tool). */
    #annotations { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
  </style>
</head>
<body>
  <div id="app" data-total="${total}">
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
