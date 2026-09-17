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
