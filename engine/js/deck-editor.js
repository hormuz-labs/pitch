/**
 * Studio deck editor — in-iframe bridge. Injected into deck.html when the
 * studio serves it with ?studio=1&edit=1. The SolidJS parent renders all
 * chrome (toolbar, panels, selection overlay handles); this script owns every
 * DOM mutation inside the deck document and talks to the parent over
 * postMessage (any origin, known types only).
 *
 *   → { type: "deck_ready" }
 *   → { type: "deck_select", sel }            sel null on deselect
 *   → { type: "deck_selbox", rect }           rect follows scroll/resize/mutations
 *   → { type: "deck_dirty" }                  after every mutation
 *   → { type: "deck_slides", slides }         after structural changes (with thumbs)
 *   → { type: "deck_active_slide", index }    rAF-throttled scroll tracking
 *   → { type: "deck_chart", chart }           on chart select / deck_chart_get / deck_chart_set
 *   → { type: "deck_html", html, slides }     reply to deck_serialize
 *   → { type: "deck_slides", slides }         reply to deck_capture_slides
 *
 *   ← deck_edit_mode / deck_exec / deck_style / deck_insert_html /
 *     deck_insert_slide / deck_slide_op / deck_layer / deck_delete_el /
 *     deck_replace_image / deck_chart_get / deck_chart_set / deck_serialize /
 *     deck_capture_slides / deck_scroll_to / deck_drag / deck_resize / deck_rotate
 *
 * Slide indices in every message are 1-based; slide ids are slide-node-<n>
 * (DeckEditorLib.retagSlides convention). deck_drag/deck_resize deltas are
 * unscaled document px, cumulative from the phase:"start" point. Pure logic
 * (color normalisation, save cleaning, slide retagging, chart-script rewrites)
 * lives in deck-editor-lib.js, loaded as window.DeckEditorLib from a <script>
 * derived from this script's own URL.
 */
(function () {
  'use strict';
  if (window.__deckEditorInit) return;
  window.__deckEditorInit = true;

  var SELF_SRC = document.currentScript && document.currentScript.src ? document.currentScript.src : '';

  var SEL_CLASS = 'selected-for-styling';
  var STYLE_ID = 'pitch-editor-style';
  var CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
  var TEXT_SEL =
    'h1, p, li, .subtitle, .stat-num, .stat-label, .stat-desc, .si-card-heading, .si-card-body, .main-title, .chart-source';
  // Selector used for text inside freshly inserted blocks (old insertHtmlIntoActiveSlide).
  var INSERT_TEXT_SEL = 'h1,h2,h3,h4,p,li,blockquote,span,strong,td,th,.subtitle';
  var THUMB_OVERRIDE_STYLE =
    'html,body{margin:0;padding:0;overflow:hidden;pointer-events:none}.slide{margin:0!important;box-shadow:none!important;border-radius:0!important}';

  var LIB = window.DeckEditorLib || null;
  var state = { editMode: true, selected: null, activeSlide: 1 };
  var dragState = null;
  var scrollRaf = 0;
  var chartLoading = false;
  var chartQueue = [];

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function post(msg) {
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
    } catch (e) {
      /* parent gone */
    }
  }

  function dirty() {
    post({ type: 'deck_dirty' });
  }

  function removeNode(n) {
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }

  // ── lib fallback (only reached if deck-editor-lib.js fails to load) ───────

  function fallbackNormalizeColor(col) {
    if (!col) return '';
    var t = String(col).trim().toLowerCase();
    if (t === 'transparent' || t === 'rgba(0, 0, 0, 0)') return 'transparent';
    if (t.charAt(0) === '#') return t;
    var m = t.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (m) {
      if (m[4] && parseFloat(m[4]) === 0) return 'transparent';
      return '#' + ((1 << 24) + (parseInt(m[1], 10) << 16) + (parseInt(m[2], 10) << 8) + parseInt(m[3], 10)).toString(16).slice(1);
    }
    return t;
  }

  function norm(col) {
    if (LIB && LIB.normalizeColor) return LIB.normalizeColor(col);
    return fallbackNormalizeColor(col);
  }

  // ── slides ────────────────────────────────────────────────────────────────

  function slideEls() {
    return qsa('.slide');
  }

  function slideTitle(slide, n) {
    var h = slide.querySelector('h1, .main-title');
    var title = h && h.textContent ? h.textContent.trim().slice(0, 80) : '';
    return title || 'Slide ' + n;
  }

  // DOM-side rebuildSlidesFromDom: ids follow DeckEditorLib.retagSlides (slide-node-<n>, 1-based).
  function retagDom() {
    var els = slideEls();
    for (var i = 0; i < els.length; i++) els[i].setAttribute('id', 'slide-node-' + (i + 1));
    return els;
  }

  function slideIndexOf(el) {
    var slide = el.closest ? el.closest('.slide') : null;
    if (!slide) return 0;
    var els = slideEls();
    return els.indexOf(slide) + 1;
  }

  function slideMeta() {
    return retagDom().map(function (el, i) {
      return { index: i + 1, title: slideTitle(el, i + 1) };
    });
  }

  function scrollToSlide(index) {
    var el = slideEls()[index - 1];
    if (el) {
      state.activeSlide = index;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── selection ─────────────────────────────────────────────────────────────

  function cmdState(cmd) {
    try {
      return !!document.queryCommandState(cmd);
    } catch (e) {
      return false;
    }
  }

  function isChartEl(el) {
    if (!el || !el.hasAttribute) return false;
    if (el.hasAttribute('data-chart')) return true;
    if (el.tagName === 'CANVAS' && window.Chart && window.Chart.getChart) {
      try {
        return !!window.Chart.getChart(el);
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  function kindOf(el) {
    if (isChartEl(el)) return 'chart';
    if (el.tagName === 'IMG') return 'image';
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return 'text';
    if (el.matches && el.matches(TEXT_SEL)) return 'text';
    return 'block';
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function rgbaOf(value) {
    var m = String(value || '').match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] == null ? 1 : Number(m[4]) };
  }

  function luminance(rgb) {
    function channel(value) {
      value /= 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  // Floating chrome uses the opposite tone from the content beneath it. Walk
  // through transparent ancestors first; image-led slides fall back to their
  // foreground text, which reliably reflects whether the artwork is dark.
  function surfaceToneFor(el) {
    var slide = el && el.closest ? el.closest('.slide') : null;
    var cur = el || slide;
    while (cur) {
      var bg = rgbaOf(window.getComputedStyle(cur).backgroundColor);
      if (bg && bg.a >= 0.5) return luminance(bg) < 0.42 ? 'dark' : 'light';
      if (cur === slide) break;
      cur = cur.parentElement;
    }
    var sample = el || (slide && slide.querySelector(TEXT_SEL)) || slide;
    var fg = sample ? rgbaOf(window.getComputedStyle(sample).color) : null;
    return fg && luminance(fg) > 0.55 ? 'dark' : 'light';
  }

  function postActiveSlide(index) {
    var slide = slideEls()[index - 1];
    post({ type: 'deck_active_slide', index: index, surfaceTone: surfaceToneFor(slide) });
  }

  function buildSel() {
    var el = state.selected;
    if (!el || !el.isConnected) return null;
    var cs = window.getComputedStyle(el);
    var deco = cs.textDecorationLine || cs.textDecoration || '';
    var hasBorder =
      parseFloat(cs.borderLeftWidth) > 0 ||
      parseFloat(cs.borderTopWidth) > 0 ||
      parseFloat(cs.borderRightWidth) > 0 ||
      parseFloat(cs.borderBottomWidth) > 0;
    var styles = {
      color: norm(el.style.color || cs.color),
      fontSize: el.style.fontSize || cs.fontSize,
      bold: (parseInt(cs.fontWeight, 10) || 400) >= 600 || cmdState('bold'),
      italic: cs.fontStyle === 'italic' || cmdState('italic'),
      underline: deco.indexOf('underline') !== -1 || cmdState('underline'),
      strike: deco.indexOf('line-through') !== -1 || cmdState('strikeThrough'),
      align: el.style.textAlign || cs.textAlign || 'left',
      blockTag: el.tagName.toLowerCase(),
      borderColor: hasBorder ? norm(el.style.borderLeftColor || el.style.borderTopColor || cs.borderLeftColor || cs.borderTopColor) : '',
      bulletColor:
        el.tagName === 'LI'
          ? (el.style.getPropertyValue('--primary') || cs.getPropertyValue('--primary') || '').trim()
          : '',
    };
    return {
      kind: kindOf(el),
      rect: rectOf(el),
      slideIndex: slideIndexOf(el),
      surfaceTone: surfaceToneFor(el),
      styles: styles,
    };
  }

  function postSelect() {
    post({ type: 'deck_select', sel: buildSel() });
  }

  function postSelBox() {
    var el = state.selected;
    if (el && el.isConnected) post({ type: 'deck_selbox', rect: rectOf(el) });
  }

  function mutated() {
    dirty();
    postSelBox();
  }

  function clearSelectionClasses() {
    qsa('.' + SEL_CLASS).forEach(function (n) {
      n.classList.remove(SEL_CLASS);
    });
  }

  function selectElement(el) {
    clearSelectionClasses();
    el.classList.add(SEL_CLASS);
    state.selected = el;
    var idx = slideIndexOf(el);
    if (idx) state.activeSlide = idx;
    postSelect();
    if (kindOf(el) === 'chart') postChartData();
  }

  function deselect() {
    clearSelectionClasses();
    state.selected = null;
    post({ type: 'deck_select', sel: null });
  }

  // ── wiring (port of handleIframeLoad) ──────────────────────────────────────

  function injectEditorStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '[contenteditable="true"] {',
      '  transition: box-shadow 0.15s ease, background-color 0.15s ease;',
      '  border-radius: 4px;',
      '  cursor: text;',
      '}',
      '[contenteditable="true"]:hover {',
      '  box-shadow: 0 0 0 1.5px #6366f1 !important;',
      '  background-color: rgba(99, 102, 241, 0.06) !important;',
      '}',
      '[contenteditable="true"]:focus {',
      '  box-shadow: 0 0 0 2px #4f46e5 !important;',
      '  background-color: rgba(99, 102, 241, 0.04) !important;',
      '  outline: none;',
      '}',
      '.selected-for-styling {',
      '  box-shadow: 0 0 0 2px #10b981 !important;',
      '  border-radius: 4px;',
      '}',
      /* The stacked document scrolls inside the preview iframe; hide its
         scrollbar (editor-only stylesheet, never saved into deck.html). */
      'html {',
      '  scrollbar-width: none;',
      '}',
      'html::-webkit-scrollbar {',
      '  display: none;',
      '}',
      'body.deck-edit img, body.deck-edit canvas {',
      '  transition: box-shadow 0.15s ease, opacity 0.15s ease;',
      '}',
      'body.deck-edit img:hover, body.deck-edit canvas:hover {',
      '  box-shadow: 0 0 0 2px #6366f1 !important;',
      '  cursor: pointer;',
      '  opacity: 0.92;',
      '}',
      'html, body {',
      '  background: transparent !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  overflow-x: auto !important;',
      '  overflow-y: auto !important;',
      '  scrollbar-width: none;',
      '  -ms-overflow-style: none;',
      '}',
      'html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }',
      '.slide {',
      '  margin: 0 0 32px 0 !important;',
      '  border-radius: 18px !important;',
      '  overflow: hidden !important;',
      '  box-shadow: 0 1px 2px rgba(16,24,40,0.06), 0 12px 32px rgba(16,24,40,0.12) !important;',
      '}',
      '.slide:last-child { margin-bottom: 0 !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function wireTextEl(el) {
    if (el.__deckWiredText) return;
    el.__deckWiredText = true;
    el.setAttribute('contenteditable', state.editMode ? 'true' : 'false');
    el.setAttribute('spellcheck', 'false');
    el.addEventListener('click', function (e) {
      if (!state.editMode) return;
      e.stopPropagation();
      selectElement(el);
    });
    el.addEventListener('input', function () {
      mutated();
    });
  }

  function wireSelectableEl(el) {
    if (el.__deckWiredSelect) return;
    el.__deckWiredSelect = true;
    el.addEventListener('click', function (e) {
      if (!state.editMode) return;
      e.stopPropagation();
      selectElement(el);
    });
  }

  function wireImageEl(img) {
    if (!img.id) img.id = 'editable-img-' + Math.random().toString(36).slice(2, 9);
    wireSelectableEl(img);
  }

  function wireCanvasEl(canvas) {
    if (!canvas.id) canvas.id = 'chart_' + Math.random().toString(36).slice(2, 9);
    if (canvas.__deckWiredCanvas) return;
    canvas.__deckWiredCanvas = true;
    canvas.addEventListener('click', function (e) {
      if (!state.editMode) return;
      e.stopPropagation();
      // A chart wrapper owns the manipulation; the canvas inside it is passive.
      var wrapper = canvas.closest ? canvas.closest('[data-chart]') : null;
      selectElement(wrapper || canvas);
    });
  }

  function wireSlideEl(slide) {
    if (slide.__deckWiredSlide) return;
    slide.__deckWiredSlide = true;
    slide.addEventListener('click', function () {
      if (!state.editMode) return;
      var idx = slideEls().indexOf(slide) + 1;
      if (idx) {
        state.activeSlide = idx;
        postActiveSlide(idx);
      }
      deselect();
    });
  }

  // Wire a freshly inserted subtree exactly like native slide content.
  function wireSubtree(node) {
    if (node.nodeType !== 1) return;
    if (node.matches && node.matches(TEXT_SEL + ',' + INSERT_TEXT_SEL)) wireTextEl(node);
    qsa(TEXT_SEL + ',' + INSERT_TEXT_SEL, node).forEach(wireTextEl);
    if (node.tagName === 'IMG') wireImageEl(node);
    qsa('img', node).forEach(wireImageEl);
    if (node.tagName === 'CANVAS') wireCanvasEl(node);
    qsa('canvas', node).forEach(wireCanvasEl);
    if (node.matches && node.matches('.slide')) wireSlideEl(node);
    // Container/visual blocks (icon svg, table, list, divider, callout, chart
    // wrapper) are selectable for drag/layer/delete.
    var isText = node.matches && node.matches(TEXT_SEL + ',' + INSERT_TEXT_SEL);
    if (!isText && node.tagName !== 'IMG' && node.tagName !== 'CANVAS' && !(node.matches && node.matches('.slide'))) {
      wireSelectableEl(node);
    }
  }

  // Scripts inside HTML strings inserted via innerHTML are inert (they never
  // execute). Replace each one with a freshly created script node — same
  // attributes, same text — so the browser runs it. Chart init scripts
  // self-poll for window.Chart, so also kick off the lazy Chart.js load when
  // the subtree references Chart.
  function reviveScripts(node) {
    if (!node || node.nodeType !== 1) return;
    var scripts = node.tagName === 'SCRIPT' ? [node] : qsa('script', node);
    var needsChart = node.tagName === 'CANVAS' || !!node.querySelector('canvas');
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var fresh = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) {
        fresh.setAttribute(old.attributes[j].name, old.attributes[j].value);
      }
      fresh.textContent = old.textContent;
      if ((old.textContent || '').indexOf('Chart') !== -1) needsChart = true;
      old.parentNode.replaceChild(fresh, old);
    }
    if (needsChart) {
      ensureChart(function () {
        /* load only: inserted init scripts poll for window.Chart themselves */
      });
    }
  }

  // ── free positioning + layering (port of applyFloating / setLayer) ────────

  function applyFloating(el, mode) {
    var slide = el.closest ? el.closest('.slide') : null;
    if (!slide) return;
    var wasAbsolute = window.getComputedStyle(el).position === 'absolute';
    if (!wasAbsolute) {
      // Capture position relative to the slide (both rects are document coords).
      var slideRect = slide.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      var left = elRect.left - slideRect.left;
      var top = elRect.top - slideRect.top;
      if (el.parentElement !== slide) slide.appendChild(el);
      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(top) + 'px';
      el.style.margin = '0';
    } else if (el.parentElement !== slide) {
      slide.appendChild(el);
    }
    el.style.position = 'absolute';
    el.style.zIndex = mode === 'front' ? '50' : '1'; // .content sits at z-index 10
  }

  function setLayerMode(mode) {
    var el = state.selected;
    if (!el || !el.isConnected) return;
    if (mode === 'inline') {
      var slide = el.closest ? el.closest('.slide') : null;
      var content = slide ? slide.querySelector('.content') || slide : null;
      el.style.position = '';
      el.style.zIndex = '';
      el.style.left = '';
      el.style.top = '';
      el.style.margin = '';
      if (content && el.parentElement !== content) content.appendChild(el);
    } else {
      applyFloating(el, mode);
    }
    mutated();
    postSelect();
  }

  function currentLayerMode(el) {
    var cs = window.getComputedStyle(el);
    if (cs.position === 'absolute') return (parseInt(cs.zIndex, 10) || 0) >= 10 ? 'front' : 'back';
    return 'inline';
  }

  function elSize(el) {
    var r = el.getBoundingClientRect();
    return { w: el.offsetWidth || r.width, h: el.offsetHeight || r.height };
  }

  function currentAngleDeg(el) {
    var m = (el.style.transform || '').match(/rotate\(([-\d.]+)deg\)/);
    return m ? parseFloat(m[1]) : 0;
  }

  // Floating layer + explicit size so the element can be moved/resized freely.
  function ensureFloatingForManip(el) {
    if (window.getComputedStyle(el).position !== 'absolute') {
      applyFloating(el, currentLayerMode(el) === 'back' ? 'back' : 'front');
    }
    var sz = elSize(el);
    if (!el.style.width) el.style.width = Math.round(sz.w) + 'px';
    if (!el.style.height) el.style.height = Math.round(sz.h) + 'px';
  }

  // ── blocks / slides structural ops ─────────────────────────────────────────

  function activeSlideEl() {
    var els = slideEls();
    return els[state.activeSlide - 1] || els[0] || null;
  }

  function insertHtmlIntoActiveSlide(html) {
    if (!html) return;
    var slide = activeSlideEl();
    if (!slide) return;
    var host = slide.querySelector('.content') || slide;
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html).trim();
    var nodes = [];
    while (wrap.firstElementChild) {
      var node = wrap.firstElementChild;
      wrap.removeChild(node);
      host.appendChild(node);
      node.setAttribute('data-pitch-block', '1');
      wireSubtree(node);
      reviveScripts(node);
      nodes.push(node);
    }
    if (!nodes.length) return;
    mutated();
    postSlides();
    requestAnimationFrame(function () {
      nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function insertSlide(html, after) {
    var els = slideEls();
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || '').trim();
    var nodes = [];
    while (wrap.firstElementChild) {
      var node = wrap.firstElementChild;
      wrap.removeChild(node);
      nodes.push(node);
    }
    if (!nodes.length) return;
    var ref = after ? els[after - 1] : null;
    var parent = ref && ref.parentElement ? ref.parentElement : els.length ? els[els.length - 1].parentElement : document.body;
    for (var i = 0; i < nodes.length; i++) {
      if (ref) ref.parentElement.insertBefore(nodes[i], ref.nextSibling);
      else parent.appendChild(nodes[i]);
      if (nodes[i].classList.contains('slide')) wireSlideEl(nodes[i]);
      wireSubtree(nodes[i]);
      reviveScripts(nodes[i]);
    }
    retagDom();
    var newIndex = ref ? after + 1 : slideEls().length;
    state.activeSlide = newIndex;
    mutated();
    postSlides();
    requestAnimationFrame(function () {
      scrollToSlide(newIndex);
    });
  }

  function slideOp(d) {
    var els = slideEls();
    if (d.op === 'reorder') {
      var from = d.from;
      var to = d.to;
      if (from === to) return;
      var moving = els[from - 1];
      var ref = els[to - 1];
      if (!moving || !ref || !moving.parentElement) return;
      if (from < to) ref.parentElement.insertBefore(moving, ref.nextSibling);
      else ref.parentElement.insertBefore(moving, ref);
      state.activeSlide = to;
      mutated();
      postSlides();
      requestAnimationFrame(function () {
        scrollToSlide(to);
      });
    } else if (d.op === 'delete') {
      if (els.length <= 1) return; // never delete the last slide
      var target = els[d.index - 1];
      if (!target || !target.parentElement) return;
      if (state.selected && (state.selected === target || (target.contains && target.contains(state.selected)))) {
        state.selected = null;
        post({ type: 'deck_select', sel: null });
      }
      target.parentElement.removeChild(target);
      var next = Math.min(d.index, els.length - 1);
      state.activeSlide = next;
      mutated();
      postSlides();
      requestAnimationFrame(function () {
        scrollToSlide(next);
      });
    } else if (d.op === 'background') {
      var slide = els[d.index - 1];
      if (!slide) return;
      slide.style.backgroundColor = d.color;
      mutated();
      postSlides();
    }
  }

  function postSlides() {
    post({ type: 'deck_slides', slides: captureSlides() });
  }

  // ── charts ────────────────────────────────────────────────────────────────

  function ensureChart(cb) {
    if (window.Chart) return cb();
    chartQueue.push(cb);
    if (chartLoading) return;
    chartLoading = true;
    var s = document.createElement('script');
    s.src = CHART_CDN;
    s.onload = function () {
      chartLoading = false;
      var q = chartQueue;
      chartQueue = [];
      for (var i = 0; i < q.length; i++) q[i]();
    };
    s.onerror = function () {
      chartLoading = false;
      chartQueue = [];
      console.error('[deck-editor] failed to load Chart.js from ' + CHART_CDN);
    };
    document.head.appendChild(s);
  }

  function selectedCanvas() {
    var el = state.selected;
    if (!el || !el.isConnected) return null;
    if (el.tagName === 'CANVAS') return el;
    return el.querySelector ? el.querySelector('canvas') : null;
  }

  function readChart(canvas) {
    if (!canvas || !window.Chart || !window.Chart.getChart) return null;
    var chart = window.Chart.getChart(canvas);
    if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) return null;
    var ds = chart.data.datasets[0];
    var bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor;
    var bd = Array.isArray(ds.borderColor) ? ds.borderColor[0] : ds.borderColor;
    return {
      labels: (chart.data.labels || []).slice(),
      data: (ds.data || []).slice(),
      backgroundColor: norm(bg || '#3b82f6'),
      borderColor: norm(bd || '#2563eb'),
    };
  }

  function postChartData(attempt) {
    attempt = attempt || 0;
    ensureChart(function () {
      var canvas = selectedCanvas();
      var data = readChart(canvas);
      if (data) {
        post({ type: 'deck_chart', chart: data });
      } else if (canvas && attempt < 20) {
        // Generated chart init scripts poll for window.Chart. The library can
        // finish loading just before that script has constructed its chart.
        setTimeout(function () {
          postChartData(attempt + 1);
        }, 50);
      }
    });
  }

  // Old findChartScript: inline script whose text mentions the canvas id, with
  // an ancestor-sibling walk before .slide as fallback.
  function findChartScript(canvas) {
    if (canvas.id) {
      var scripts = qsa('script:not([src])');
      for (var i = 0; i < scripts.length; i++) {
        if ((scripts[i].textContent || '').indexOf(canvas.id) !== -1) return scripts[i];
      }
    }
    var parent = canvas.parentElement;
    while (parent && !parent.classList.contains('slide')) {
      var sibling = parent.nextElementSibling;
      if (sibling && sibling.tagName === 'SCRIPT') return sibling;
      parent = parent.parentElement;
    }
    return null;
  }

  function persistChart(canvas, chart) {
    if (!LIB || !LIB.updateChartScript) {
      console.error('[deck-editor] DeckEditorLib.updateChartScript unavailable; chart change is not persisted to the markup');
      return;
    }
    var scriptEl = findChartScript(canvas);
    if (!scriptEl) return;
    var ds = chart.data.datasets[0];
    scriptEl.textContent = LIB.updateChartScript(scriptEl.textContent || '', {
      labels: chart.data.labels,
      data: ds.data,
      backgroundColor: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor,
      borderColor: Array.isArray(ds.borderColor) ? ds.borderColor[0] : ds.borderColor,
    });
  }

  function chartSet(patch) {
    ensureChart(function () {
      var canvas = selectedCanvas();
      if (!canvas) return;
      var chart = window.Chart.getChart(canvas);
      if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) return;
      var ds = chart.data.datasets[0];
      var p = patch || {};
      if (p.data) ds.data = p.data.slice();
      if (p.labels) chart.data.labels = p.labels.slice();
      if (p.backgroundColor !== undefined) ds.backgroundColor = p.backgroundColor;
      if (p.borderColor !== undefined) ds.borderColor = p.borderColor;
      chart.update();
      persistChart(canvas, chart);
      mutated();
      var data = readChart(canvas);
      if (data) post({ type: 'deck_chart', chart: data });
    });
  }

  // ── serialize / capture ────────────────────────────────────────────────────

  function isInjectedScript(n) {
    var src = n.getAttribute('src') || '';
    var text = n.textContent || '';
    return src.indexOf('engine/js/') !== -1 || text.indexOf('window.STUDIO_INSPECTOR') !== -1;
  }

  function cleanCloneRoot() {
    retagDom();
    var root = document.documentElement.cloneNode(true);
    removeNode(root.querySelector('#' + STYLE_ID));
    removeNode(root.querySelector('#studio-inspect-overlay'));
    qsa('[data-studio-box]', root).forEach(removeNode);
    // The server-injected inspector/bridge tags (and the dynamically loaded
    // deck-editor-lib.js, whose src is absolute and carries the auth token)
    // must never be written back into deck.html.
    qsa('script', root).forEach(function (n) {
      if (isInjectedScript(n)) removeNode(n);
    });
    qsa('.' + SEL_CLASS, root).forEach(function (n) {
      n.classList.remove(SEL_CLASS);
    });
    qsa('[contenteditable]', root).forEach(function (n) {
      n.removeAttribute('contenteditable');
    });
    qsa('[spellcheck]', root).forEach(function (n) {
      n.removeAttribute('spellcheck');
    });
    qsa('[data-studio-mark]', root).forEach(function (n) {
      n.removeAttribute('data-studio-mark');
    });
    return root;
  }

  function serialize() {
    var root = cleanCloneRoot();
    var html = '<!DOCTYPE html>\n' + root.outerHTML;
    if (LIB && LIB.cleanDeckHtml) html = LIB.cleanDeckHtml(html);
    else console.error('[deck-editor] DeckEditorLib.cleanDeckHtml unavailable; relying on DOM-side cleaning only');
    post({ type: 'deck_html', html: html, slides: slideMeta() });
  }

  function headHtmlForThumbs() {
    var headClone = document.head.cloneNode(true);
    removeNode(headClone.querySelector('#' + STYLE_ID));
    qsa('script', headClone).forEach(removeNode);
    return headClone.innerHTML;
  }

  function captureSlides() {
    var headHtml = headHtmlForThumbs();
    return retagDom().map(function (slide, i) {
      var clone = slide.cloneNode(true);
      clone.classList.remove(SEL_CLASS);
      qsa('.' + SEL_CLASS, clone).forEach(function (n) {
        n.classList.remove(SEL_CLASS);
      });
      qsa('[contenteditable]', clone).forEach(function (n) {
        n.removeAttribute('contenteditable');
      });
      qsa('script', clone).forEach(removeNode);
      return {
        index: i + 1,
        title: slideTitle(slide, i + 1),
        thumbSrcDoc:
          '<!DOCTYPE html><html><head>' +
          headHtml +
          '<style>' +
          THUMB_OVERRIDE_STYLE +
          '</style></head><body>' +
          clone.outerHTML +
          '</body></html>',
      };
    });
  }

  // ── exec / style ──────────────────────────────────────────────────────────

  function replaceBlockTag(value) {
    var el = state.selected;
    var tag = String(value || '').toLowerCase();
    if (!el || !el.isConnected || !/^(p|h1|h2|h3)$/.test(tag)) return false;
    if (!/^(P|H1|H2|H3)$/.test(el.tagName)) return false;
    if (el.tagName.toLowerCase() === tag) {
      postSelect();
      return true;
    }
    var next = document.createElement(tag);
    for (var i = 0; i < el.attributes.length; i++) {
      next.setAttribute(el.attributes[i].name, el.attributes[i].value);
    }
    while (el.firstChild) next.appendChild(el.firstChild);
    el.parentNode.replaceChild(next, el);
    state.selected = next;
    wireTextEl(next);
    mutated();
    postSelect();
    return true;
  }

  function execInline(cmd, value) {
    // Chromium nests a new heading inside a contenteditable heading because
    // that selected element is itself the editing host. Replace the host so
    // the saved deck contains one valid block element.
    if (cmd === 'formatBlock' && replaceBlockTag(value)) return;
    try {
      document.execCommand('styleWithCSS', false, 'true');
    } catch (e) {
      /* not supported */
    }
    try {
      document.execCommand(cmd, false, value);
    } catch (e) {
      console.error('[deck-editor] execCommand failed:', cmd, e);
    }
    mutated();
    postSelect(); // reflect new toggle states (bold/italic/…) in the parent toolbar
  }

  function camelToKebab(k) {
    return k.replace(/[A-Z]/g, function (c) {
      return '-' + c.toLowerCase();
    });
  }

  function applyStyle(style) {
    var el = state.selected;
    if (!el || !el.isConnected || !style) return;
    for (var k in style) {
      if (!Object.prototype.hasOwnProperty.call(style, k)) continue;
      var v = style[k];
      if (v === null || v === undefined) continue;
      if (k === 'borderColor') {
        el.style.setProperty('border-top-color', v);
        el.style.setProperty('border-right-color', v);
        el.style.setProperty('border-bottom-color', v);
        el.style.setProperty('border-left-color', v);
      } else {
        el.style.setProperty(k.indexOf('--') === 0 ? k : camelToKebab(k), String(v));
      }
    }
    mutated();
    postSelect();
  }

  // ── edit mode ─────────────────────────────────────────────────────────────

  function setEditMode(on) {
    state.editMode = !!on;
    if (document.body) document.body.classList.toggle('deck-edit', state.editMode);
    qsa('[contenteditable]').forEach(function (el) {
      el.setAttribute('contenteditable', state.editMode ? 'true' : 'false');
    });
    if (!state.editMode) deselect();
  }

  // ── scroll / resize tracking ───────────────────────────────────────────────

  function onScrollOrResize() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function () {
      scrollRaf = 0;
      var mid = window.innerHeight / 2;
      var els = slideEls();
      var current = 0;
      for (var i = 0; i < els.length; i++) {
        if (els[i].getBoundingClientRect().top <= mid) current = i + 1;
      }
      if (current && current !== state.activeSlide) {
        state.activeSlide = current;
        postActiveSlide(current);
      }
      postSelBox();
    });
  }

  // ── drag / resize (parent sends unscaled document-px deltas, cumulative from start) ──

  function onDrag(d) {
    var el = state.selected;
    if (!el || !el.isConnected) return;
    if (d.phase === 'start') {
      ensureFloatingForManip(el);
      dragState = { kind: 'drag', left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 };
      postSelBox();
    } else if (d.phase === 'move' && dragState && dragState.kind === 'drag') {
      el.style.left = Math.round(dragState.left + (d.dx || 0)) + 'px';
      el.style.top = Math.round(dragState.top + (d.dy || 0)) + 'px';
      postSelBox();
    } else if (d.phase === 'end') {
      dragState = null;
      mutated();
      postSelect();
    }
  }

  function onResize(d) {
    var el = state.selected;
    if (!el || !el.isConnected) return;
    if (d.phase === 'start') {
      ensureFloatingForManip(el);
      var sz = elSize(el);
      var a = (currentAngleDeg(el) * Math.PI) / 180;
      dragState = {
        kind: 'resize',
        handle: d.handle || 'se',
        w: parseFloat(el.style.width) || sz.w,
        h: parseFloat(el.style.height) || sz.h,
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0,
        cos: Math.cos(a),
        sin: Math.sin(a),
      };
      postSelBox();
    } else if (d.phase === 'move' && dragState && dragState.kind === 'resize') {
      var st = dragState;
      var dxs = d.dx || 0;
      var dys = d.dy || 0;
      // Project the delta onto the element's local (rotated) axes.
      var dx = dxs * st.cos + dys * st.sin;
      var dy = -dxs * st.sin + dys * st.cos;
      var w = st.w;
      var h = st.h;
      var left = st.left;
      var top = st.top;
      var dir = st.handle;
      if (dir.indexOf('e') !== -1) w = Math.max(20, st.w + dx);
      if (dir.indexOf('s') !== -1) h = Math.max(20, st.h + dy);
      if (dir.indexOf('w') !== -1) {
        w = Math.max(20, st.w - dx);
        left = st.left + dxs;
      }
      if (dir.indexOf('n') !== -1) {
        h = Math.max(20, st.h - dy);
        top = st.top + dys;
      }
      el.style.width = Math.round(w) + 'px';
      el.style.height = Math.round(h) + 'px';
      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(top) + 'px';
      postSelBox();
    } else if (d.phase === 'end') {
      dragState = null;
      mutated();
      postSelect();
    }
  }

  // ── message protocol ───────────────────────────────────────────────────────

  var EXEC_CMDS = {
    bold: 1,
    italic: 1,
    underline: 1,
    strikeThrough: 1,
    superscript: 1,
    formatBlock: 1,
    insertHTML: 1,
    createLink: 1,
    unlink: 1,
    removeFormat: 1,
    hiliteColor: 1,
    foreColor: 1,
  };

  function onMessage(e) {
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    switch (d.type) {
      case 'deck_edit_mode':
        setEditMode(d.enabled);
        break;
      case 'deck_exec':
        if (state.editMode && EXEC_CMDS[d.cmd]) execInline(d.cmd, d.value);
        break;
      case 'deck_style':
        if (state.editMode) applyStyle(d.style);
        break;
      case 'deck_insert_html':
        if (state.editMode) insertHtmlIntoActiveSlide(d.html);
        break;
      case 'deck_insert_slide':
        if (state.editMode) insertSlide(d.html, d.after);
        break;
      case 'deck_slide_op':
        if (state.editMode) slideOp(d);
        break;
      case 'deck_layer':
        if (state.editMode && (d.mode === 'inline' || d.mode === 'front' || d.mode === 'back')) setLayerMode(d.mode);
        break;
      case 'deck_delete_el':
        if (state.editMode && state.selected && state.selected.isConnected) {
          var el = state.selected;
          deselect();
          removeNode(el);
          mutated();
        }
        break;
      case 'deck_replace_image':
        if (state.editMode && state.selected && state.selected.tagName === 'IMG') {
          state.selected.src = d.src;
          mutated();
        }
        break;
      case 'deck_chart_get':
        postChartData();
        break;
      case 'deck_chart_set':
        if (state.editMode) chartSet(d.patch);
        break;
      case 'deck_serialize':
        serialize();
        break;
      case 'deck_capture_slides':
        postSlides();
        break;
      case 'deck_scroll_to':
        scrollToSlide(d.index);
        break;
      case 'deck_drag':
        if (state.editMode) onDrag(d);
        break;
      case 'deck_resize':
        if (state.editMode) onResize(d);
        break;
      case 'deck_rotate':
        if (state.editMode && state.selected && state.selected.isConnected) {
          ensureFloatingForManip(state.selected);
          state.selected.style.transform = 'rotate(' + (parseFloat(d.deg) || 0) + 'deg)';
          mutated();
          postSelect();
        }
        break;
    }
  }

  // ── init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    injectEditorStyle();
    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    var els = slideEls();
    if (!els.length) {
      // Not a deck (or deck not rendered yet): stay inert but tell the parent we're alive.
      console.warn('[deck-editor] no .slide elements found; editing disabled');
      post({ type: 'deck_ready' });
      return;
    }

    if (state.editMode && document.body) document.body.classList.add('deck-edit');
    retagDom();
    qsa(TEXT_SEL).forEach(wireTextEl);
    els.forEach(wireSlideEl);
    qsa('img').forEach(wireImageEl);
    qsa('canvas').forEach(wireCanvasEl);

    post({ type: 'deck_ready' });
    postActiveSlide(1);
  }

  if (LIB) {
    init();
  } else if (!SELF_SRC) {
    console.error('[deck-editor] cannot locate deck-editor-lib.js: document.currentScript.src is unavailable');
    LIB = { normalizeColor: fallbackNormalizeColor };
    init();
  } else {
    var s = document.createElement('script');
    s.src = SELF_SRC.replace(/deck-editor\.js(\?.*)?$/, 'deck-editor-lib.js$1');
    s.onload = function () {
      LIB = window.DeckEditorLib || null;
      if (!LIB) {
        console.error('[deck-editor] deck-editor-lib.js loaded but window.DeckEditorLib is missing');
        LIB = { normalizeColor: fallbackNormalizeColor };
      }
      init();
    };
    s.onerror = function () {
      console.error('[deck-editor] failed to load deck-editor-lib.js from ' + s.src);
      LIB = { normalizeColor: fallbackNormalizeColor };
      init();
    };
    document.head.appendChild(s);
  }
})();
