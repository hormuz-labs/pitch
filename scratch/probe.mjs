import { createServer } from 'node:http'
import fs from 'node:fs'; import path from 'node:path'
import { chromium } from 'playwright'
const dist = process.argv[2]
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4','.json':'application/json'}
const server=createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.join(dist,p)
 if(!f.startsWith(dist)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(dist,'index.html')
 res.writeHead(200,{'content-type':MIME[path.extname(f)]??'application/octet-stream'});fs.createReadStream(f).pipe(res)})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`
const b=await chromium.launch(); const page=await b.newPage()
page.on('pageerror',e=>console.log('PAGE-ERR:',String(e).slice(0,300)))
page.on('console',m=>console.log('['+m.type()+']',m.text().slice(0,180)))
await page.goto(base+'/',{waitUntil:'load',timeout:60000})
for (const ms of [500,1500,3000,5000,8000]) {
  await page.waitForTimeout(ms===500?500:ms - (ms===1500?500:ms===3000?1500:ms===5000?3000:5000))
  const s = await page.evaluate(()=>({
    rootLen: document.getElementById('root')?.innerHTML.length ?? -1,
    text: (document.getElementById('root')?.innerText||'').trim().slice(0,60),
    fcp: performance.getEntriesByType('paint').map(e=>e.name+':'+Math.round(e.startTime)).join(' '),
  }))
  console.log(ms+'ms', JSON.stringify(s))
}
await page.screenshot({path:'/home/adnan/Documents/pitch/scratch/shot.png'})
await b.close(); server.close()
