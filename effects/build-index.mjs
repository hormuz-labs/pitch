#!/usr/bin/env node
/* Build effects/index.html — the review gallery: every effect's render,
   its catalog description, a link to its code and to the Jitter original. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));
const knownSlugs = new Set(cat.map(c => `${c.familySlug}/${c.slug}`));
for (const fam of fs.readdirSync(ROOT)) {
  if (fam.startsWith('_') || fam.startsWith('.')) continue;
  const fp = path.join(ROOT, fam);
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
let built = 0, rendered = 0;
const cards = cat.map(c => {
  const rel = `${c.familySlug}/${c.slug}`;
  const has = fs.existsSync(path.join(ROOT, rel, 'index.html'));
  const mp4 = fs.existsSync(path.join(ROOT, rel, 'render.mp4'));
  let rj = null; try { rj = JSON.parse(fs.readFileSync(path.join(ROOT, rel, 'render.json'), 'utf8')); } catch {}
  let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(ROOT, rel, 'meta.json'), 'utf8')); } catch {}
  if (has) built++; if (mp4) rendered++;
  const status = !has ? 'todo' : rj && rj.error ? 'fail' : mp4 ? 'ok' : 'unrendered';
  return `<article class="card ${status}" data-fam="${c.familySlug}" data-status="${status}" data-name="${esc((c.name + ' ' + (meta && meta.move ? meta.move + ' ' + (meta.moves || []).join(' ') : '')).toLowerCase())}">
  ${mp4 ? `<video muted loop playsinline preload="none" poster="${rel}/poster.jpg" data-src="${rel}/render.mp4"></video>` : `<div class="ph">${status}</div>`}
  <div class="meta"><h3>${esc(c.name)} <span>${c.seconds}s${rj && rj.duration ? ` → ${rj.duration.toFixed(1)}s` : ''}</span></h3>
  <p>${esc(c.description)}</p>${meta && meta.move ? `<p class="move"><b>${esc(meta.move)}</b>${meta.fidelity && meta.fidelity !== 'faithful' ? ` <i>${esc(meta.fidelity)}</i>` : ''}${meta.libs && meta.libs.length ? ` <small>${esc(meta.libs.join(', '))}</small>` : ''}</p>` : ''}
  <nav>${has ? `<a href="${rel}/index.html" target="_blank">play</a> <a href="${rel}/index.html?render" target="_blank">code</a>` : ''}${c.jitterUrl ? ` <a href="${c.jitterUrl}" target="_blank">jitter</a>` : ''}${rj && rj.errors && rj.errors.length ? ` <b title="${esc(rj.errors.join('\n'))}">⚠ ${rj.errors.length}</b>` : ''}${rj && rj.error ? ` <b>✗ ${esc(rj.error.slice(0, 80))}</b>` : ''}</nav></div>
</article>`;
}).join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>Effects lab</title>
<style>
body{margin:0;font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;background:#f4f4f2;color:#111}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
header input,header select{font:inherit;padding:6px 8px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;padding:16px}
.card{background:#fff;border:1px solid #e2e2e0;border-radius:10px;overflow:hidden}
.card video,.card .ph{width:100%;aspect-ratio:16/9;background:#eee;display:block;object-fit:contain}
.card .ph{display:grid;place-items:center;color:#999;text-transform:uppercase;letter-spacing:.1em}
.card.fail .ph{background:#fbe6e6;color:#a00}
.meta{padding:10px 12px}h3{margin:0 0 4px;font-size:15px}h3 span{color:#888;font-weight:400;font-size:12px}
p{margin:0 0 6px;color:#444}p.move{color:#222}p.move b{font-weight:600}p.move i{color:#b36b00}p.move small{color:#888}nav a{margin-right:10px}nav b{color:#a00;font-weight:500}
.hidden{display:none}
</style>
<header><strong>Effects lab</strong> <span id="count">${built}/${cat.length} built · <button id="btnOk" style="background:#22c55e;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:600">${rendered} rendered</button></span>
<input id="q" placeholder="search"> <select id="fam"><option value="">all families</option>${fams.map(f => `<option>${f}</option>`).join('')}</select>
<select id="st"><option value="">any status</option><option selected>ok</option><option>all</option><option>fail</option><option>unrendered</option><option>todo</option></select></header>
<main>${cards}</main>
<script>
const q=document.getElementById('q'),fam=document.getElementById('fam'),st=document.getElementById('st'),btnOk=document.getElementById('btnOk');
function filt(){
  const s=q.value.toLowerCase();
  const wantSt = (st.value === 'all' || !st.value) ? '' : st.value;
  for(const c of document.querySelectorAll('.card')){
    c.classList.toggle('hidden', (s&&!c.dataset.name.includes(s)) || (fam.value&&c.dataset.fam!==fam.value) || (wantSt&&c.dataset.status!==wantSt));
  }
}
q.oninput=fam.onchange=st.onchange=filt;
if (btnOk) btnOk.onclick = () => { st.value = 'ok'; fam.value = ''; q.value = ''; filt(); };
filt(); // Apply initial filter so rendered cards show immediately
const io=new IntersectionObserver(es=>{for(const e of es){const v=e.target;if(e.isIntersecting){if(!v.src)v.src=v.dataset.src;v.play().catch(()=>{})}else v.pause()}},{rootMargin:'200px'});
document.querySelectorAll('video').forEach(v=>io.observe(v));
</script>`;
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`index.html: ${built}/${cat.length} built, ${rendered} rendered`);
