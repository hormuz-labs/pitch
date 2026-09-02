// Measure LCP + request waterfall against the built dist/ over a throttled link.
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { chromium } from 'playwright'

const dist = process.argv[2]
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.mp4':'video/mp4', '.json':'application/json' }
// Vercel serves these compressed; measuring raw bytes over a throttled link
// would blame the network for weight the CDN never sends.
const COMPRESSIBLE = new Set(['.html','.js','.css','.svg','.json','.txt','.xml','.md'])
const server = createServer((req,res)=>{
  const p = decodeURIComponent(new URL(req.url,'http://x').pathname)
  let f = path.join(dist,p)
  if(!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist,'index.html')
  const type = MIME[path.extname(f)]??'application/octet-stream'
  if (COMPRESSIBLE.has(path.extname(f)) && /\bgzip\b/.test(req.headers['accept-encoding']||'')) {
    const body = zlib.gzipSync(fs.readFileSync(f))
    res.writeHead(200,{'content-type':type,'content-encoding':'gzip','content-length':body.length})
    res.end(body)
    return
  }
  res.writeHead(200,{'content-type':type})
  fs.createReadStream(f).pipe(res)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE-ERR:',m.text().slice(0,200)) })
page.on('pageerror',e=>console.log('PAGE-ERR:',String(e).slice(0,300)))
// Simulated Fast 3G-ish so the waterfall shape is visible (local disk hides it).
if (!process.env.NOTHROTTLE) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline:false, latency:150, downloadThroughput: 1.6*1024*1024/8, uploadThroughput: 750*1024/8 })
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})
}

await page.addInitScript(() => {
  window.__lcp = { t: 0, el: '' }
  new PerformanceObserver(l => {
    const es = l.getEntries()
    const last = es[es.length - 1]
    if (!last) return
    window.__lcp = {
      t: last.startTime,
      el: last.element ? last.element.tagName.toLowerCase() + (last.element.className ? '.' + String(last.element.className).trim().split(/\s+/).join('.') : '') : '',
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true })
})

const reqs = []
page.on('response', async r => {
  const t = r.request().resourceType()
  if(['script','stylesheet','font','image','media','document'].includes(t)) {
    let len = 0
    try { len = (await r.body()).length } catch {}
    reqs.push({ url: r.url().replace(base,''), type:t, len })
  }
})

await page.goto(base+'/', { waitUntil:'load', timeout:120000 })
await page.waitForTimeout(6000)

const vitals = await page.evaluate(() => {
  const paint = performance.getEntriesByType('paint')
  const lcps = performance.getEntriesByType('largest-contentful-paint')
  const last = lcps[lcps.length - 1]
  return {
    fcp: paint.find(e => e.name === 'first-contentful-paint')?.startTime ?? 0,
    fp: paint.find(e => e.name === 'first-paint')?.startTime ?? 0,
    lcp: window.__lcp?.t ?? 0,
    lcpEl: window.__lcp?.el ?? '',
  }
})

console.log('\n── VITALS ──')
console.log('FP:', Math.round(vitals.fp),'ms   FCP:', Math.round(vitals.fcp),'ms   LCP:', Math.round(vitals.lcp),'ms')
console.log('LCP element:', vitals.lcpEl.slice(0,90))
const by = {}
for(const r of reqs){ by[r.type] = by[r.type]||{n:0,b:0}; by[r.type].n++; by[r.type].b+=r.len }
console.log('\n── BYTES BY TYPE (uncompressed on wire here) ──')
for(const [k,v] of Object.entries(by)) console.log(`${k.padEnd(12)} ${String(v.n).padStart(3)} reqs  ${(v.b/1024).toFixed(0)} KB`)
console.log('\n── TOP 20 REQUESTS ──')
for(const r of reqs.sort((a,b)=>b.len-a.len).slice(0,20)) console.log(`${(r.len/1024).toFixed(0).padStart(6)} KB  ${r.type.padEnd(10)} ${r.url.slice(0,70)}`)
await browser.close(); server.close()
