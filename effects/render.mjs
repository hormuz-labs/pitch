#!/usr/bin/env node
/* Render effects to MP4 + poster, frame by frame, deterministically.
 *
 *   node effects/render.mjs text/bold-text-snap [more dirs...]
 *   node effects/render.mjs --all            every <family>/<slug>/index.html
 *   node effects/render.mjs --missing        only those without render.mp4
 *   node effects/render.mjs --family text    one family
 *   options: --fps 30  --jobs 4  --force
 *
 * Each effect page must register window.__fx (see _lib/fx.js). Size comes
 * from <meta name="fx" content="w=1280 h=720"> (default 1280x720). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FPS = +opt('--fps', 30);
const JOBS = +opt('--jobs', 4);
const FORCE = args.includes('--force');

function listAll() {
  const out = [];
  for (const fam of fs.readdirSync(ROOT)) {
    if (fam.startsWith('_') || fam.startsWith('.')) continue;
    const fp = path.join(ROOT, fam);
    if (!fs.statSync(fp).isDirectory()) continue;
    for (const slug of fs.readdirSync(fp)) {
      if (fs.existsSync(path.join(fp, slug, 'index.html'))) out.push(`${fam}/${slug}`);
    }
  }
  return out.sort();
}

let targets;
if (args.includes('--all')) targets = listAll();
else if (args.includes('--missing')) targets = listAll().filter(t => !fs.existsSync(path.join(ROOT, t, 'render.mp4')));
else if (args.includes('--family')) targets = listAll().filter(t => t.startsWith(opt('--family') + '/'));
else targets = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a) && a.includes('/'));
if (!targets.length) { console.error('nothing to render'); process.exit(1); }

function ffmpeg(outMp4, w, h) {
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'png', '-i', '-',
    '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', outMp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  return p;
}

async function renderOne(browser, rel) {
  const dir = path.join(ROOT, rel);
  const html = path.join(dir, 'index.html');
  const src = fs.readFileSync(html, 'utf8');
  const meta = /<meta\s+name="fx"\s+content="([^"]*)"/.exec(src);
  const kv = Object.fromEntries((meta ? meta[1] : '').split(/\s+/).filter(Boolean).map(s => s.split('=')));
  const w = +(kv.w || 1280), h = +(kv.h || 720);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  try {
    await page.goto('file://' + html + '?render', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__fx && window.__fx.ready === true, null, { timeout: 20000 });
    const duration = await page.evaluate(() => window.__fx.duration);
    if (!(duration > 0) || duration > 30) throw new Error(`bad duration ${duration}`);
    const frames = Math.round(duration * FPS);
    const mp4 = path.join(dir, 'render.mp4');
    const enc = ffmpeg(mp4, w, h);
    const done = new Promise((res, rej) => enc.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
    let poster = null;
    const posterAt = Math.floor(frames * 0.45);
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await page.evaluate(t => window.__fx.seek(t), t);
      const buf = await page.screenshot({ type: 'png', caret: 'hide', animations: 'allow', timeout: 15000 });
      if (i === posterAt) poster = buf;
      if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r));
    }
    enc.stdin.end();
    await done;
    if (poster) {
      const jp = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', '-', '-vf', 'scale=640:-2', '-q:v', '4', path.join(dir, 'poster.jpg')], { stdio: ['pipe', 'inherit', 'inherit'] });
      jp.stdin.end(poster);
      await new Promise(r => jp.on('close', r));
    }
    // contact strip: 8 frames across the duration
    const strip = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', `select='not(mod(n\\,${Math.max(1, Math.floor(frames / 8))}))',scale=320:-2,tile=8x1`, '-frames:v', '1', path.join(dir, 'strip.jpg')], { stdio: 'inherit' });
    await new Promise(r => strip.on('close', r));
    fs.writeFileSync(path.join(dir, 'render.json'), JSON.stringify({ duration, fps: FPS, frames, w, h, renderedAt: new Date().toISOString(), errors }, null, 1));
    console.log(`ok   ${rel}  ${duration}s ${w}x${h}  ${((Date.now() - t0) / 1000).toFixed(1)}s${errors.length ? '  ⚠ ' + errors.length + ' console errors' : ''}`);
  } catch (e) {
    console.log(`FAIL ${rel}: ${e.message.split('\n')[0]}${errors.length ? ' | ' + errors[0] : ''}`);
    fs.writeFileSync(path.join(dir, 'render.json'), JSON.stringify({ error: e.message, errors, renderedAt: new Date().toISOString() }, null, 1));
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const queue = targets.filter(t => FORCE || !fs.existsSync(path.join(ROOT, t, 'render.mp4')) || !targets.length || true);
let idx = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (idx < queue.length) { const t = queue[idx++]; await renderOne(browser, t); }
}));
await browser.close();
