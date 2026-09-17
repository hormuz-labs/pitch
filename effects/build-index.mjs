#!/usr/bin/env node
/* Build effects/index.html — the review gallery: every effect's render,
   its catalog description, a link to its code and to the Jitter original. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

// The standalone command writes a snapshot; the gallery server calls this on
// each page request so renders added since the last build appear immediately.
export function buildGallery(root = ROOT) {
const cat = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
const knownSlugs = new Set(cat.map(c => `${c.familySlug}/${c.slug}`));
for (const fam of fs.readdirSync(root)) {
  if (fam.startsWith('_') || fam.startsWith('.')) continue;
  const fp = path.join(root, fam);
  if (!fs.statSync(fp).isDirectory()) continue;
  for (const slug of fs.readdirSync(fp)) {
    const rel = `${fam}/${slug}`;
    if (!knownSlugs.has(rel) && fs.existsSync(path.join(fp, slug, 'index.html'))) {
      let meta = null;
      try { meta = JSON.parse(fs.readFileSync(path.join(fp, slug, 'meta.json'), 'utf8')); } catch {}
      cat.unshift({
        name: meta?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        family: meta?.family || fam.charAt(0).toUpperCase() + fam.slice(1),
        familySlug: fam,
        slug: slug,
        seconds: meta?.seconds || 4,
        tags: meta?.moves || ['launch'],
        description: meta?.description || 'Launch video motion effect.',
      });
    }
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fams = [...new Set(cat.map(c => c.familySlug))];
let built = 0;
const cards = cat.map(c => {
  const rel = `${c.familySlug}/${c.slug}`;
  const has = fs.existsSync(path.join(root, rel, 'index.html'));
  let source = ''; try { source = fs.readFileSync(path.join(root, rel, 'index.html'), 'utf8'); } catch {}
  const size = /<meta\s+name=["']fx["']\s+content=["']([^"']*)/.exec(source)?.[1] || '';
  const width = Number(/(?:^|\s)w=(\d+)/.exec(size)?.[1]) || 1280;
  const height = Number(/(?:^|\s)h=(\d+)/.exec(size)?.[1]) || 720;
  let rj = null; try { rj = JSON.parse(fs.readFileSync(path.join(root, rel, 'render.json'), 'utf8')); } catch {}
  let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(root, rel, 'meta.json'), 'utf8')); } catch {}
  if (has) built++;
  const status = has ? 'ok' : 'todo';
  return `<article class="card ${status}" data-fam="${c.familySlug}" data-status="${status}" data-name="${esc((c.name + ' ' + (meta && meta.move ? meta.move + ' ' + (meta.moves || []).join(' ') : '')).toLowerCase())}">
  ${has ? `<div class="live" data-src="${rel}/index.html" data-w="${width}" data-h="${height}" aria-label="Live preview: ${esc(c.name)}"><iframe title="Live preview: ${esc(c.name)}" tabindex="-1"></iframe></div>` : '<div class="ph">todo</div>'}
  <div class="meta"><h3>${esc(c.name)} <span>${c.seconds}s${rj && rj.duration ? ` → ${rj.duration.toFixed(1)}s` : ''}</span></h3>
  <p>${esc(c.description)}</p>${meta && meta.move ? `<p class="move"><b>${esc(meta.move)}</b>${meta.fidelity && meta.fidelity !== 'faithful' ? ` <i>${esc(meta.fidelity)}</i>` : ''}${meta.libs && meta.libs.length ? ` <small>${esc(meta.libs.join(', '))}</small>` : ''}</p>` : ''}
   <nav>${has ? `<a href="${rel}/index.html" target="_blank">open live</a> <a href="${rel}/index.html?render" target="_blank">inspect</a>` : ''}${c.jitterUrl ? ` <a href="${c.jitterUrl}" target="_blank">jitter</a>` : ''}</nav></div>
</article>`;
}).join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>Effects lab</title>
<style>
body{margin:0;font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;background:#f4f4f2;color:#111}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
header input,header select{font:inherit;padding:6px 8px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;padding:16px}
.card{background:#fff;border:1px solid #e2e2e0;border-radius:10px;overflow:hidden}
.card .live,.card .ph{width:100%;aspect-ratio:16/9;background:#e9e9e6;display:block;overflow:hidden;position:relative}
.card .live iframe{position:absolute;left:50%;top:50%;border:0;pointer-events:none;transform-origin:center}
.card .ph{display:grid;place-items:center;color:#999;text-transform:uppercase;letter-spacing:.1em}
.card.fail .ph{background:#fbe6e6;color:#a00}
.meta{padding:10px 12px}h3{margin:0 0 4px;font-size:15px}h3 span{color:#888;font-weight:400;font-size:12px}
p{margin:0 0 6px;color:#444}p.move{color:#222}p.move b{font-weight:600}p.move i{color:#b36b00}p.move small{color:#888}nav a{margin-right:10px}nav b{color:#a00;font-weight:500}
.hidden{display:none}
</style>
<header><strong>Effects lab</strong> <span id="count">${built}/${cat.length} live effects</span>
<input id="q" placeholder="search"> <select id="fam"><option value="">all families</option>${fams.map(f => `<option>${f}</option>`).join('')}</select>
<select id="st"><option value="">all effects</option><option value="todo">not built</option></select></header>
<main>${cards}</main>
<script>
const q=document.getElementById('q'),fam=document.getElementById('fam'),st=document.getElementById('st');
function filt(){
  const s=q.value.toLowerCase();
  const wantSt = (st.value === 'all' || !st.value) ? '' : st.value;
  for(const c of document.querySelectorAll('.card')){
    c.classList.toggle('hidden', (s&&!c.dataset.name.includes(s)) || (fam.value&&c.dataset.fam!==fam.value) || (wantSt&&c.dataset.status!==wantSt));
  }
}
q.oninput=fam.onchange=st.onchange=filt;
filt();
function fit(holder){const f=holder.querySelector('iframe'),w=+holder.dataset.w,h=+holder.dataset.h,s=Math.min(holder.clientWidth/w,holder.clientHeight/h);f.style.width=w+'px';f.style.height=h+'px';f.style.transform='translate(-50%,-50%) scale('+s+')'}
const ro=new ResizeObserver(es=>es.forEach(e=>fit(e.target)));
const io=new IntersectionObserver(es=>{for(const e of es){const holder=e.target,f=holder.querySelector('iframe');if(e.isIntersecting){if(!f.dataset.loaded){f.src=holder.dataset.src;f.dataset.loaded='1'}fit(holder)}else if(f.dataset.loaded){f.src='about:blank';delete f.dataset.loaded}}},{rootMargin:'100px'});
document.querySelectorAll('.live').forEach(holder=>{ro.observe(holder);io.observe(holder)});
</script>`;
return { html, built, total: cat.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, built, total } = buildGallery();
  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  console.log(`index.html: ${built}/${total} live effects`);
}
