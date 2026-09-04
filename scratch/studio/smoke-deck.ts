/**
 * Deck-flow smoke test: seed a pdf job whose HTML is a data: URL, then ask the
 * agent to inspect slide 1 (deck_render) — proves the pi → host-action bridge
 * and the sandbox hydration without touching object storage.
 */
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') })

const db = await import('@saas/db')
const { registerDeckFlow, promptDeck } = await import('../../apps/api/src/lib/studio/flows/deck.ts')
const { subscribe } = await import('../../apps/api/src/lib/studio/session.ts')
const { workspaceFor } = await import('../../apps/api/src/lib/studio/paths.ts')

const userId = 'user_smoke'
const html = `<!DOCTYPE html><html><head><style>.slide{width:1280px;height:720px;background:#123;color:#fff;font:64px sans-serif;display:flex;align-items:center;justify-content:center}</style></head><body><section class="slide"><h1 class="main-title">Quarterly Review</h1></section><section class="slide"><h1 class="main-title">Revenue up 40%</h1></section></body></html>`
const htmlUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`
await db.upsertUser({ id: userId, email: 'smoke@example.com', firstName: 'Smoke', lastName: 'Test' } as any).catch(() => undefined)
const job = await db.createJob({ userId, parameters: { jobType: 'pdf', topic: 'smoke', htmlUrl } }, { id: userId })
await db.updateJob(job.id, { status: 'COMPLETED' as any })
console.log('job', job.id)

await registerDeckFlow()
const ws = workspaceFor('pdf', userId, job.id)
const started = Date.now()
const { unsubscribe } = await subscribe(ws, ev => {
  const t = ((Date.now() - started) / 1000).toFixed(1)
  if (ev.type === 'delta') return
  if (ev.type === 'entry') console.log(`[${t}s] ${ev.entry.role}: ${ev.entry.text.slice(0, 160)}`)
  else if (ev.type === 'update') console.log(`[${t}s] tool ${ev.entry.tool?.status}: ${ev.entry.text.slice(0, 120)}`)
  else console.log(`[${t}s] ${ev.type}`)
  if (ev.type === 'idle' || ev.type === 'error') {
    setTimeout(() => {
      unsubscribe()
      process.exit(0)
    }, 1500)
  }
})
await promptDeck(userId, job.id, 'Render slide 1 with deck_render, look at the PNG, and tell me the exact headline text. Do not publish.', {
  slide: 1,
  targets: [{ slide: 1, tagName: 'h1', className: 'main-title', text: 'Quarterly Review' }],
})
console.log('prompt sent')
