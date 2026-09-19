/**
 * Deck editor logic — pure, string-based. Loaded by the studio deck editor
 * bridge as `window.DeckEditorLib` and by node tests as a CommonJS module.
 * No DOM APIs: every function takes and returns strings.
 *
 * Ported from the deleted React editor (apps/web/src/views/PdfEditorView.tsx):
 * normalizeColor, the handleSave cleaning, rebuildSlidesFromDom's re-tagging
 * and title extraction, and the findChartScript/updateChartScript rewrites.
 */
(function (root) {
  "use strict";

  // ── colors ─────────────────────────────────────────────────────────────────

  function normalizeColor(col) {
    if (!col) return "";
    var trimmed = String(col).trim().toLowerCase();
    if (trimmed === "transparent" || trimmed === "rgba(0, 0, 0, 0)") return "transparent";
    if (trimmed.charAt(0) === "#") return trimmed;
    var match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (match) {
      var r = parseInt(match[1], 10);
      var g = parseInt(match[2], 10);
      var b = parseInt(match[3], 10);
      var a = match[4] ? parseFloat(match[4]) : 1;
      if (a === 0) return "transparent";
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    return trimmed;
  }

  // ── save-time cleaning (string version of handleSave) ──────────────────────

  var EDITOR_STYLE = /<style\b[^>]*\bid\s*=\s*(["'])pitch-editor-style\1[^>]*>[\s\S]*?<\/style\s*>/gi;
  var PROTECTED_BLOCK = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi;

  // Studio-injected engine scripts (inspector pair, deck-editor bridge, and
  // the dynamically loaded deck-editor-lib.js whose absolute src carries the
  // auth token). These live in the live document while editing and must not
  // persist into a saved deck. Chart init scripts (inline, no src, no
  // STUDIO_INSPECTOR) are kept.
  var ENGINE_SCRIPT =
    /<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*engine\/js\/(?:inspector|deck-editor(?:-lib)?)\.js[^"']*\1[^>]*>\s*<\/script\s*>/gi;
  var INSPECTOR_INLINE = /<script\b[^>]*>\s*window\.STUDIO_INSPECTOR\s*=[\s\S]*?<\/script\s*>/gi;
  var INSPECTOR_RUNTIME =
    /<div\b(?=[^>]*(?:\bid\s*=\s*(["'])studio-inspect-(?:overlay|label)\1|\bdata-studio-box(?:\s*=\s*(["'])[^"']*\2)?))[^>]*>(?:<div\b[^>]*>[\s\S]*?<\/div\s*>)?<\/div\s*>/gi;

  function stripEngineScripts(html) {
    return String(html).replace(ENGINE_SCRIPT, "").replace(INSPECTOR_INLINE, "");
  }

  function stripEditorAttrs(fragment) {
    // Drop the selection marker from class lists; drop the attribute when it
    // becomes (or already was) empty. Other class values are left untouched.
    fragment = fragment.replace(/(\s)class\s*=\s*(["'])([^"']*)\2/gi, function (m, space, quote, value) {
      if (value.indexOf("selected-for-styling") === -1) {
        return value.trim() === "" ? "" : m;
      }
      var kept = value.split(/\s+/).filter(function (c) {
        return c && c !== "selected-for-styling";
      });
      return kept.length ? space + "class=" + quote + kept.join(" ") + quote : "";
    });
    fragment = fragment.replace(/\scontenteditable\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    fragment = fragment.replace(/\sspellcheck\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    fragment = fragment.replace(/\sdata-studio-mark(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
    return fragment;
  }

  /** Apply fn to every part of html that is not inside a <script> or <style>. */
  function mapOutsideProtected(html, fn) {
    var out = "";
    var last = 0;
    var m;
    PROTECTED_BLOCK.lastIndex = 0;
    while ((m = PROTECTED_BLOCK.exec(html))) {
      out += fn(html.slice(last, m.index)) + m[0];
      last = m.index + m[0].length;
    }
    return out + fn(html.slice(last));
  }

  function cleanDeckHtml(html) {
    if (!html) return "";
    html = stripEngineScripts(String(html).replace(EDITOR_STYLE, "")).replace(INSPECTOR_RUNTIME, "");
    return mapOutsideProtected(html, stripEditorAttrs);
  }

  // ── slide re-tagging (string version of rebuildSlidesFromDom) ──────────────

  // Same opening-tag scan as parseSlides in apps/api/src/flows/deck/index.ts.
  var TAG_OPEN = /<([a-z][\w-]*)\b[^>]*?\bclass\s*=\s*(["'])([^"']*)\2[^>]*>/gi;

  function stripTags(html) {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // First <h1> or .main-title element in document order, like the old
  // querySelector('h1, .main-title').
  function slideTitle(chunk, n) {
    var h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(chunk);
    var mt = /<([a-z][\w-]*)\b[^>]*\bclass\s*=\s*(["'])[^"']*\bmain-title\b[^"']*\2[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(chunk);
    var inner = null;
    if (h1 && mt) inner = h1.index <= mt.index ? h1[1] : mt[3];
    else if (h1) inner = h1[1];
    else if (mt) inner = mt[3];
    var title = inner ? stripTags(inner).slice(0, 80) : "";
    return title || "Slide " + n;
  }

  function retagSlideTag(tag, n) {
    var id = "slide-node-" + n;
    if (/\bid\s*=\s*(["'])[^"']*\1/i.test(tag)) {
      return tag.replace(/\bid\s*=\s*(["'])[^"']*\1/i, 'id="' + id + '"');
    }
    return tag.replace(/^(<[a-z][\w-]*)/i, '$1 id="' + id + '"');
  }

  function retagSlides(html) {
    html = String(html == null ? "" : html);
    var matches = [];
    var m;
    TAG_OPEN.lastIndex = 0;
    while ((m = TAG_OPEN.exec(html))) {
      if (m[3].split(/\s+/).indexOf("slide") !== -1) {
        matches.push({ index: m.index, tag: m[0] });
      }
    }
    var slides = [];
    var out = "";
    var last = 0;
    for (var i = 0; i < matches.length; i++) {
      var n = i + 1;
      var end = i + 1 < matches.length ? matches[i + 1].index : html.length;
      slides.push({ index: n, title: slideTitle(html.slice(matches[i].index, end), n) });
      out += html.slice(last, matches[i].index) + retagSlideTag(matches[i].tag, n);
      last = matches[i].index + matches[i].tag.length;
    }
    return { html: out + html.slice(last), slides: slides };
  }

  // ── chart config rewrites ──────────────────────────────────────────────────

  /**
   * Rewrite a Chart.js config inside an inline script. Keys may be quoted or
   * bare; color values may be scalars or arrays. Only the fields present in
   * opts are replaced; values are JSON-stringified, exactly like the old
   * updateChartScript.
   */
  function updateChartScript(scriptText, opts) {
    var text = String(scriptText == null ? "" : scriptText);
    opts = opts || {};
    if (opts.labels !== undefined) {
      text = text.replace(/(["']?labels["']?\s*:\s*\[[^\]]*\])/, '"labels":' + JSON.stringify(opts.labels));
    }
    if (opts.data !== undefined) {
      text = text.replace(/(["']?data["']?\s*:\s*\[[^\]]*\])/, '"data":' + JSON.stringify(opts.data));
    }
    if (opts.backgroundColor !== undefined) {
      text = text.replace(
        /(["']?backgroundColor["']?\s*:\s*(["'][^"']*["']|\[[^\]]*\]))/,
        '"backgroundColor":' + JSON.stringify(opts.backgroundColor),
      );
    }
    if (opts.borderColor !== undefined) {
      text = text.replace(
        /(["']?borderColor["']?\s*:\s*(["'][^"']*["']|\[[^\]]*\]))/,
        '"borderColor":' + JSON.stringify(opts.borderColor),
      );
    }
    return text;
  }

  /**
   * Locate the first inline <script> (no src attribute) whose text mentions
   * canvasId. Returns the whole-element range [start, end) in html plus the
   * script's inner text, or null.
   */
  function findChartScriptText(html, canvasId) {
    if (!html || !canvasId) return null;
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    var m;
    while ((m = re.exec(html))) {
      if (/\bsrc\s*=/i.test(m[1])) continue;
      if (m[2].indexOf(canvasId) === -1) continue;
      return { start: m.index, end: m.index + m[0].length, text: m[2] };
    }
    return null;
  }

  var DeckEditorLib = {
    normalizeColor: normalizeColor,
    cleanDeckHtml: cleanDeckHtml,
    retagSlides: retagSlides,
    updateChartScript: updateChartScript,
    findChartScriptText: findChartScriptText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = DeckEditorLib;
  if (root) root.DeckEditorLib = DeckEditorLib;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
