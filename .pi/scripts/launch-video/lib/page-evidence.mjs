/** Runs in the page; returns bounded text and actual links, not layout instructions. */
export function pageEvidence({ maxChars = 5000, maxLinks = 24 } = {}) {
  const content = document.querySelector('main, [role="main"], article') || document.body;
  const text = (content?.innerText || '').replace(/\n[ \t]*\n+/g, '\n\n').trim();
  const links = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const label = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    let url;
    try { url = new URL(a.href, location.href); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) continue;
    url.hash = '';
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    links.push({ label: label.slice(0, 100), url: url.href });
  }
  const score = link => Number(/product|feature|docs|documentation|guide|how.*works|changelog|integration|developer|use.case/i.test(`${link.label} ${new URL(link.url).pathname}`)) * 2 + Number(new URL(link.url).origin === location.origin);
  links.sort((a, b) => score(b) - score(a));
  return {
    url: location.href,
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    links: links.slice(0, maxLinks),
  };
}

export function formatPageEvidence(evidence) {
  return [
    `# ${evidence.title}\nSource: ${evidence.url}`,
    evidence.description,
    evidence.text,
    evidence.truncated ? '(Page text truncated; inspect a more specific linked page if needed.)' : '',
    '## Links to explore',
    ...evidence.links.map(link => `- ${link.label}: ${link.url}`),
  ].filter(Boolean).join('\n\n');
}

/**
 * Runs in the page; the product's own pictures: its videos (source, or only a
 * poster until played) and its large images, in page order. Logos and icons
 * are recon's; tiny thumbnails are left out.
 */
export function pageMedia({ max = 16 } = {}) {
  const abs = (u) => {
    if (!u || !u.trim()) return ''; // src="" resolves to the page itself
    try {
      const x = new URL(u, location.href);
      return /^https?:$/.test(x.protocol) && x.href !== location.href ? x.href : '';
    } catch { return ''; }
  };
  const stem = (u) => decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || '')
    .replace(/\.[a-z0-9]+$/i, '').replace(/[-_.][A-Za-z0-9_-]{8}$/, '');
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') ||
    el.closest('figure')?.querySelector('figcaption')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const out = [];
  const seen = new Set();
  [...document.querySelectorAll('video')].forEach((v, index) => {
    const src = abs(v.currentSrc || v.getAttribute('src') || v.querySelector('source[src]')?.src || '');
    const poster = abs(v.getAttribute('poster') || '');
    const same = out.find((m) => m.kind === 'video' && ((poster && m.poster === poster) || (src && m.src === src)));
    if (same) { same.src ||= src; return; } // a carousel repeats its items
    if (!src && !poster) return;
    seen.add(src || poster);
    const r = v.getBoundingClientRect();
    out.push({ kind: 'video', src, poster, index, name: label(v) || stem(src || poster), w: Math.round(r.width), h: Math.round(r.height) });
  });
  for (const img of document.querySelectorAll('img')) {
    const src = abs(img.currentSrc || img.getAttribute('src') || '');
    if (!src || seen.has(src)) continue;
    const r = img.getBoundingClientRect();
    if (img.naturalWidth < 480 || r.width < 240 || r.height < 135) continue;
    if (/logo|icon|avatar|favicon|sprite|badge|emoji/i.test(`${src} ${img.className} ${img.alt}`)) continue;
    seen.add(src);
    out.push({ kind: 'image', src, name: label(img) || stem(src), w: img.naturalWidth, h: img.naturalHeight });
  }
  return out.slice(0, max);
}

export function formatPageMedia(media, { sheet, url }) {
  if (!media.length) return '';
  return [
    `## The page's own pictures — read ${sheet}`,
    ...media.map((m, i) => `[${i + 1}] ${m.kind} "${m.name}" ${m.w}×${m.h}${m.kind === 'video' && !m.src ? ' · a poster until played' : ''}`),
    `Real screens and real work make a film no drawn mock can. Save the ones it shows: \`pitch motion inspect ${url} --save 1,4\` (or \`all\`) → recon/media/; a saved video becomes a clip with \`pitch motion footage\`.`,
  ].join('\n');
}
