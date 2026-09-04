/**
 * Studio element inspector — standalone. Loaded into any page the studio
 * previews (a deck, a legacy launch page) so the user can point at elements:
 *
 *   ← { type: "studio_toggle_inspect", enabled, scale }
 *   ← { type: "studio_set_marks", marks: [n, …] }
 *   ← { type: "studio_scroll_to", index }
 *   → { type: "studio_element_selected", element: { sceneId, slide, tagName, className, id, text, selector, html, mark } }
 *
 * `window.STUDIO_INSPECTOR = { container: ".slide" }` (set before this script
 * loads) names the element that groups a page/scene; its 1-based index and id
 * are reported with every pick. The launch engine has its own inspector in
 * compiler.js (it knows shots); this one is for everything else.
 */
(() => {
  if (window.__STUDIO_INSPECTOR__) return;
  window.__STUDIO_INSPECTOR__ = true;
  const cfg = Object.assign({ container: ".slide", accent: "#D97757" }, window.STUDIO_INSPECTOR || {});

  let enabled = false;
  let scale = 1;
  let overlay = null;
  let label = null;
  let markSeq = 0;
  const marks = new Map();
  let markRaf = 0;

  function ensureDOM() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "studio-inspect-overlay";
    overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147483000;border:2px solid ${cfg.accent};background:rgba(217,119,87,0.16);border-radius:4px;display:none;box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,0.25);`;
    label = document.createElement("div");
    label.id = "studio-inspect-label";
    label.style.cssText = `position:absolute;left:0;top:-24px;background:${cfg.accent};color:#fff;font:11px/1.4 ui-monospace,Menlo,monospace;padding:2px 8px;border-radius:3px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;`;
    overlay.appendChild(label);
    document.body.appendChild(overlay);
  }

  function readable(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 4) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(`#${cur.id}`);
        break;
      }
      const cls = typeof cur.className === "string" ? cur.className.split(/\s+/).filter(c => c && !c.startsWith("studio-")).slice(0, 2) : [];
      if (cls.length) s += `.${cls.join(".")}`;
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter(c => c.tagName === cur.tagName);
        if (same.length > 1) s += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function resolveTarget(raw) {
    let el = raw;
    while (el && el !== document.body) {
      if (el.id === "studio-inspect-overlay" || (el.dataset && el.dataset.studioBox)) return null;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !(r.width >= window.innerWidth * 0.98 && r.height >= window.innerHeight * 0.98)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function markBoxFor(id) {
    const box = document.createElement("div");
    box.dataset.studioBox = "1";
    box.style.cssText = `position:fixed;pointer-events:none;z-index:2147482999;border:2px solid ${cfg.accent};border-radius:4px;box-sizing:border-box;`;
    const tag = document.createElement("div");
    tag.style.cssText = `position:absolute;left:-2px;top:-20px;background:${cfg.accent};color:#fff;font:11px/1.4 ui-monospace,Menlo,monospace;padding:1px 6px;border-radius:3px;`;
    tag.textContent = String(id);
    box.appendChild(tag);
    document.body.appendChild(box);
    return { box, tag };
  }

  function layoutMarks() {
    const k = scale > 0 ? 1 / scale : 1;
    marks.forEach(({ el, box, tag }) => {
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;
      box.style.display = visible ? "block" : "none";
      if (!visible) return;
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      box.style.borderWidth = `${Math.max(2, Math.round(2 * k))}px`;
      tag.style.fontSize = `${Math.round(11 * k)}px`;
      tag.style.top = `${-Math.round(20 * k)}px`;
    });
    markRaf = marks.size > 0 ? requestAnimationFrame(layoutMarks) : 0;
  }

  function setMarks(ids) {
    const keep = new Set((ids || []).map(Number));
    marks.forEach((m, id) => {
      if (!keep.has(id)) {
        m.box.remove();
        marks.delete(id);
      }
    });
    keep.forEach(id => {
      if (marks.has(id)) return;
      const el = document.querySelector(`[data-studio-mark="${id}"]`);
      if (el) marks.set(id, { el, ...markBoxFor(id) });
    });
    if (marks.size > 0 && !markRaf) markRaf = requestAnimationFrame(layoutMarks);
  }

  function describe(el) {
    if (!el.dataset.studioMark) el.dataset.studioMark = String(++markSeq);
    const container = cfg.container ? el.closest(cfg.container) : null;
    const containers = cfg.container ? [...document.querySelectorAll(cfg.container)] : [];
    const slide = container ? containers.indexOf(container) + 1 : null;
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 150);
    return {
      sceneId: container ? container.id || (slide ? `slide-${slide}` : null) : null,
      slide,
      tagName: el.tagName.toLowerCase(),
      className: typeof el.className === "string" ? el.className.replace(/studio-[^\s]+/g, "").trim() : "",
      id: el.id || "",
      text,
      selector: readable(el),
      html: el.outerHTML ? el.outerHTML.replace(/\s*data-studio-mark="[^"]*"/g, "").slice(0, 200) : "",
      mark: Number(el.dataset.studioMark),
    };
  }

  function updateOverlay(el) {
    ensureDOM();
    const r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    const cls = typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    label.textContent = `${el.tagName.toLowerCase()}${cls}${text ? ` · "${text}"` : ""}`;
  }

  function setInspect(on, s) {
    enabled = Boolean(on);
    if (s > 0) scale = s;
    ensureDOM();
    const k = scale > 0 ? 1 / scale : 1;
    overlay.style.borderWidth = `${Math.max(2, Math.round(2 * k))}px`;
    label.style.fontSize = `${Math.round(11 * k)}px`;
    label.style.top = `${-Math.round(24 * k)}px`;
    document.body.style.cursor = enabled ? "crosshair" : "";
    if (!enabled) overlay.style.display = "none";
  }

  document.addEventListener("pointermove", e => {
    if (!enabled) return;
    const t = resolveTarget(document.elementFromPoint(e.clientX, e.clientY));
    if (!t) {
      if (overlay) overlay.style.display = "none";
      return;
    }
    updateOverlay(t);
  }, true);

  document.addEventListener("click", e => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const t = resolveTarget(e.target);
    if (!t) return;
    updateOverlay(t);
    const data = describe(t);
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: "studio_element_selected", element: data }, "*");
    } catch (_) {}
  }, true);

  window.addEventListener("message", e => {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "studio_toggle_inspect") setInspect(e.data.enabled, e.data.scale);
    else if (e.data.type === "studio_set_marks") setMarks(e.data.marks);
    else if (e.data.type === "studio_scroll_to" && cfg.container) {
      const c = document.querySelectorAll(cfg.container)[Number(e.data.index) - 1];
      if (c) c.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  window.__SET_INSPECT = setInspect;
})();
