import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import express, { Router } from 'express'

const logger = createLogger('api')

export const router = Router()

function unsubscribePage(valid: boolean): string {
  const eyebrow = valid ? 'Email preferences updated' : 'Unsubscribe link not found'
  const title = valid ? 'Sad to see you go.' : 'This link has lost its way.'
  const body = valid
    ? 'You have been removed from Pitch product updates. Your account and transactional emails are not affected.'
    : 'This unsubscribe link is invalid or has expired. You may have already been removed from this list.'
  const detail = valid ? 'unsubscribed' : 'link invalid'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${valid ? 'Unsubscribed' : 'Link not found'} | Pitch</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:#ededed;color:#020202}
    body{font-family:'Geist Variable','Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
    .page{position:relative;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:48px 24px;text-align:center}
    .watermark{position:absolute;left:50%;top:50%;transform:translate(-50%,-54%);font-size:clamp(11rem,38vw,30rem);font-weight:650;line-height:.72;letter-spacing:-.06em;color:#dededc;white-space:nowrap;user-select:none}
    .content{position:relative;z-index:1;display:flex;max-width:560px;flex-direction:column;align-items:center}
    .logo{display:block;width:56px;height:56px;margin:0 0 24px;border-radius:12px}
    .face{display:grid;width:106px;height:106px;margin-bottom:24px;place-items:center;border:2px solid #111;border-radius:50%;background:#ededed;font-family:'Courier New',monospace;font-size:40px;font-weight:700;line-height:1}
    .eyebrow{display:flex;align-items:center;gap:8px;margin:0;color:#77736f;font-family:'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.07em;text-transform:uppercase}
    .eyebrow:before{content:'';width:6px;height:6px;border-radius:50%;background:#111}
    h1{margin:14px 0 0;font-size:clamp(2rem,6vw,3rem);font-weight:450;line-height:1.05;letter-spacing:-.045em;text-wrap:balance}
    .body{max-width:45ch;margin:16px 0 0;color:#3d3a39;font-size:16px;line-height:1.65;text-wrap:pretty}
    .actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:28px}
    .button{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:0 21px;border:1px solid #111;border-radius:999px;background:#111;color:#ededed;font-size:13px;font-weight:600;text-decoration:none}
    .button.secondary{border-color:#b8b3b0;background:transparent;color:#111}
    .button:hover{opacity:.82}.button:focus-visible{outline:2px solid #111;outline-offset:3px}
    .detail{display:flex;gap:14px;margin-top:30px;padding:9px 14px;border:1px solid #d4d4d1;border-radius:8px;background:rgba(250,250,250,.55);color:#77736f;font-family:'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
    .detail b{color:#3d3a39;font-weight:500;text-transform:none}
    @media(max-width:520px){.page{padding:32px 20px}.logo{width:48px;height:48px}.face{width:90px;height:90px;font-size:34px}.detail{font-size:9px}}
  </style>
</head>
<body>
  <main class="page">
    <div class="watermark" aria-hidden="true">BYE</div>
    <section class="content">
      <img class="logo" src="https://trypitch.co/tabLogoB.svg" width="56" height="56" alt="Pitch">
      <div class="face" aria-label="Sad face">:(</div>
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="body">${body}</p>
      <div class="actions">
        <a class="button" href="https://trypitch.co">Back to Pitch</a>
        <a class="button secondary" href="mailto:support@trypitch.co">Contact support</a>
      </div>
      <div class="detail"><span>Status <b>${detail}</b></span><span>List <b>product updates</b></span></div>
    </section>
  </main>
</body>
</html>`
}

/**
 * POST /newsletter/subscribe
 *
 * Saves a new email address to the newsletter subscribers table.
 * Public endpoint (does not require authentication).
 */
router.post('/subscribe', async (req, res) => {
  const { email, firstName } = req.body

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' })
  }

  // Simple email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' })
  }

  try {
    const lowerEmail = email.trim().toLowerCase()

    const normalizedFirstName =
      typeof firstName === 'string' && firstName.trim() ? firstName.trim().slice(0, 100) : undefined

    await db.prisma.newsletterSubscriber.upsert({
      where: { email: lowerEmail },
      create: { email: lowerEmail, firstName: normalizedFirstName, source: 'website' },
      update: {
        ...(normalizedFirstName ? { firstName: normalizedFirstName } : {}),
        status: 'subscribed',
        unsubscribedAt: null,
      },
    })

    res.json({ success: true, message: 'Successfully subscribed to the newsletter!' })
  } catch (error: any) {
    logger.error({ err: error, email }, 'Failed to subscribe to newsletter')
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function unsubscribe(req: express.Request, res: express.Response) {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  res.type('html')
  if (!token) return res.status(400).send(unsubscribePage(false))

  const result = await db.prisma.newsletterSubscriber.updateMany({
    where: { unsubscribeToken: token },
    data: { status: 'unsubscribed', unsubscribedAt: new Date() },
  })
  if (!result.count) return res.status(404).send(unsubscribePage(false))
  return res.send(unsubscribePage(true))
}

// GET supports the footer link; POST supports RFC 8058 one-click unsubscribe.
router.get('/unsubscribe', unsubscribe)
router.post('/unsubscribe', unsubscribe)
