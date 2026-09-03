import { Resend } from 'resend'
import { embedSocialIcons } from './social-assets.js'

export type JobEmailKind = 'demo' | 'recording-edit' | 'launch-video' | 'pdf' | 'enhancement'

type Detail = { label: string; value: string }

export type TransactionalEmailContent = {
  subject: string
  preheader: string
  eyebrow: string
  title: string
  intro: string
  badge?: string
  badgeTone?: 'success' | 'danger' | 'neutral'
  details?: Detail[]
  ctaLabel?: string
  ctaUrl?: string
  note?: string
}

const APP_URL = () => (process.env.APP_URL || 'https://trypitch.co').replace(/\/$/, '')

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : '#'
  } catch {
    return '#'
  }
}

function greeting(firstName?: string | null): string {
  return firstName?.trim() ? `Hey ${firstName.trim()},` : 'Hey there,'
}

function jobLabel(kind: JobEmailKind): string {
  return {
    demo: 'demo video',
    'recording-edit': 'recording edit',
    'launch-video': 'launch video',
    pdf: 'presentation',
    enhancement: 'presentation enhancement',
  }[kind]
}

/** Responsive, client-safe email shell shared by every Pitch transactional email. */
export function renderTransactionalEmail(
  content: TransactionalEmailContent,
  firstName?: string | null,
): { html: string; text: string } {
  const logoUrl = safeUrl(process.env.NEWSLETTER_LOGO_URL || `${APP_URL()}/tabLogoB.svg`)
  const safeCtaUrl = content.ctaUrl ? safeUrl(content.ctaUrl) : undefined
  const badgeColors = {
    success: { background: '#ecfdf3', border: '#bbf7d0', color: '#166534' },
    danger: { background: '#fff1f2', border: '#fecdd3', color: '#9f1239' },
    neutral: { background: '#f4f4f5', border: '#e4e4e7', color: '#3f3f46' },
  }[content.badgeTone || 'neutral']
  const details = content.details?.filter(item => item.value)
  const safeGreeting = escapeHtml(greeting(firstName))

  const detailsHtml = details?.length
    ? `<tr><td class="mobile-pad" style="padding:0 40px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:12px;background:#fafafa">${details
        .map(
          item =>
            `<tr><td style="padding:12px 16px;border-bottom:1px solid #eeeeee;color:#737373;font-size:12px;width:34%">${escapeHtml(item.label)}</td><td style="padding:12px 16px;border-bottom:1px solid #eeeeee;color:#171717;font-size:12px;font-weight:600;word-break:break-word">${escapeHtml(item.value)}</td></tr>`,
        )
        .join('')}</table></td></tr>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:12px!important}.card{border-radius:12px!important}.mobile-pad{padding-left:22px!important;padding-right:22px!important}.hero-pad{padding:22px!important}.hero-title{font-size:27px!important;line-height:32px!important}.cta{display:block!important;text-align:center!important}.footer-links{display:block!important;margin-top:8px!important}}@media (prefers-color-scheme:dark){.force-light{background:#fff!important;color:#171717!important}}</style></head>
<body class="force-light" style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#171717;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5"><tr><td class="outer" align="center" style="padding:32px 16px">
<table role="presentation" class="card force-light" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #dedede;border-radius:16px;overflow:hidden">
<tr><td style="height:6px;background:#111;font-size:0">&nbsp;</td></tr>
<tr><td class="mobile-pad" style="padding:28px 40px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px"><img src="${logoUrl}" width="34" height="34" alt="Pitch" style="display:block;border:0;width:34px;height:34px"></td><td style="font-size:21px;font-weight:750;letter-spacing:-.5px;color:#111">Pitch</td></tr></table></td></tr>
<tr><td class="mobile-pad" style="padding:8px 40px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:14px"><tr><td class="hero-pad" style="padding:30px"><p style="margin:0 0 16px;color:#bdbdbd;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">${escapeHtml(content.eyebrow)}</p><h1 class="hero-title" style="margin:0;color:#fff;font-size:34px;line-height:39px;letter-spacing:-1.1px;font-weight:760">${escapeHtml(content.title)}</h1><p style="margin:16px 0 0;color:#a3a3a3;font-size:12px;line-height:19px">Made with care by Pitch.</p></td></tr></table></td></tr>
<tr><td class="mobile-pad" style="padding:10px 40px 18px"><p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#262626">${safeGreeting}</p><p style="margin:0;font-size:15px;line-height:24px;color:#525252">${escapeHtml(content.intro)}</p></td></tr>
${content.badge ? `<tr><td class="mobile-pad" style="padding:0 40px 22px"><span style="display:inline-block;padding:6px 11px;border-radius:999px;background:${badgeColors.background};border:1px solid ${badgeColors.border};color:${badgeColors.color};font-size:12px;font-weight:700">${escapeHtml(content.badge)}</span></td></tr>` : ''}
${detailsHtml}
${safeCtaUrl && content.ctaLabel ? `<tr><td class="mobile-pad" style="padding:0 40px 28px"><a class="cta" href="${safeCtaUrl}" target="_blank" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-size:14px;font-weight:700">${escapeHtml(content.ctaLabel)}</a></td></tr>` : ''}
${content.note ? `<tr><td class="mobile-pad" style="padding:0 40px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;border-left:3px solid #171717"><tr><td style="padding:13px 15px;color:#626262;font-size:12px;line-height:19px">${escapeHtml(content.note)}</td></tr></table></td></tr>` : ''}
<tr><td class="mobile-pad" style="padding:24px 40px;border-top:1px solid #e8e8e8"><p style="margin:0 0 5px;color:#333;font-size:12px;font-weight:700">Adnan</p><p style="margin:0;color:#8a8a8a;font-size:11px;line-height:18px">Co-founder, Pitch</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr><td style="padding-right:9px"><a href="https://x.com/trypitchdotco" aria-label="Pitch on X"><img src="https://trypitch.co/email/social/x.png" width="30" height="30" alt="X" style="display:block;width:30px;height:30px;border:0"></a></td><td style="padding-right:9px"><a href="https://www.instagram.com/trypitch.co" aria-label="Pitch on Instagram"><img src="https://trypitch.co/email/social/instagram.png" width="30" height="30" alt="Instagram" style="display:block;width:30px;height:30px;border:0"></a></td><td style="padding-right:9px"><a href="https://www.linkedin.com/company/trypitchdotco/" aria-label="Pitch on LinkedIn"><img src="https://trypitch.co/email/social/linkedin.png" width="30" height="30" alt="LinkedIn" style="display:block;width:30px;height:30px;border:0"></a></td><td style="padding-right:9px"><a href="https://discord.gg/a4SBW36mD" aria-label="Pitch on Discord"><img src="https://trypitch.co/email/social/discord.png" width="30" height="30" alt="Discord" style="display:block;width:30px;height:30px;border:0"></a></td><td><a href="https://www.youtube.com/@trypitchdotco" aria-label="Pitch on YouTube"><img src="https://trypitch.co/email/social/youtube.png" width="30" height="30" alt="YouTube" style="display:block;width:30px;height:30px;border:0"></a></td></tr></table><p style="margin:14px 0 0;color:#a3a3a3;font-size:10px;line-height:17px">This is an account or service email from Pitch. Need help? <a href="mailto:support@trypitch.co" style="color:#525252">support@trypitch.co</a></p></td></tr>
</table></td></tr></table></body></html>`

  const textDetails = details?.map(item => `${item.label}: ${item.value}`).join('\n')
  const text = [
    greeting(firstName),
    '',
    content.title,
    content.intro,
    content.badge,
    textDetails,
    content.ctaLabel && content.ctaUrl ? `${content.ctaLabel}: ${content.ctaUrl}` : undefined,
    content.note,
    '',
    'Adnan',
    'Co-founder, Pitch',
    'X: https://x.com/trypitchdotco',
    'Instagram: https://www.instagram.com/trypitch.co',
    'LinkedIn: https://www.linkedin.com/company/trypitchdotco/',
    'Discord: https://discord.gg/a4SBW36mD',
    'YouTube: https://www.youtube.com/@trypitchdotco',
    'Support: support@trypitch.co',
  ]
    .filter(value => value !== undefined)
    .join('\n')

  return { html, text }
}

async function sendTransactional(
  to: string,
  content: TransactionalEmailContent,
  options?: { firstName?: string | null; idempotencyKey?: string },
): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY is not configured, skipping transactional email')
    return { error: 'RESEND_API_KEY is not configured' }
  }
  const rendered = renderTransactionalEmail(content, options?.firstName)
  const embedded = embedSocialIcons(rendered.html)
  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send(
    {
      from: process.env.TRANSACTIONAL_EMAIL_FROM || 'Pitch <noreply@trypitch.co>',
      to,
      replyTo: process.env.EMAIL_REPLY_TO || 'support@trypitch.co',
      subject: content.subject,
      html: embedded.html,
      text: rendered.text,
      attachments: embedded.attachments,
      headers: { Precedence: 'transactional', 'X-Mailer': 'Pitch/1.0 Resend' },
    },
    options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
  )
  if (error) {
    console.warn(`[Email] Transactional email to ${to} failed: ${error.message}`)
    return { error: error.message }
  }
  return { id: data?.id }
}

export function sendWelcomeEmail(input: {
  to: string
  firstName?: string | null
  credits: number
  userId: string
}) {
  return sendTransactional(
    input.to,
    {
      subject: 'Welcome to Pitch',
      preheader: 'Your Pitch workspace is ready.',
      eyebrow: 'Welcome to Pitch',
      title: 'Your first great video starts here.',
      intro:
        'I am glad you are here. Pitch helps you turn a product, recording, or idea into a polished video without wrestling with a timeline. Bring us the story and we will help with the making.',
      badge: `${input.credits} credits added to your account`,
      badgeTone: 'success',
      ctaLabel: 'Create your first video',
      ctaUrl: `${APP_URL()}/new`,
      note: 'You can also connect your AI agents to Pitch through MCP and create videos from your own workflows.',
    },
    { firstName: input.firstName, idempotencyKey: `welcome-${input.userId}` },
  )
}

export function sendJobCompletedEmail(input: {
  to: string
  firstName?: string | null
  jobId: string
  kind: JobEmailKind
  outputUrl: string
  title?: string
}) {
  const label = jobLabel(input.kind)
  const cta =
    input.kind === 'pdf' || input.kind === 'enhancement' ? 'Open presentation' : 'Watch video'
  return sendTransactional(
    input.to,
    {
      subject: `Your ${label} is ready`,
      preheader: `Pitch finished your ${label}.`,
      eyebrow: 'Ready in Pitch',
      title: `Your ${label} is ready.`,
      intro: `It is ready. We finished your ${label} and gave it the final polish. Take a look, download it, or send it straight to your team.`,
      badge: 'Completed',
      badgeTone: 'success',
      details: [
        ...(input.title ? [{ label: 'Project', value: input.title }] : []),
        { label: 'Job ID', value: input.jobId },
      ],
      ctaLabel: cta,
      ctaUrl: input.outputUrl,
    },
    { firstName: input.firstName, idempotencyKey: `job-completed-${input.jobId}` },
  )
}

export function sendJobFailedEmail(input: {
  to: string
  firstName?: string | null
  jobId: string
  kind: JobEmailKind
  error?: string
  refundedCredits?: number
}) {
  const label = jobLabel(input.kind)
  return sendTransactional(
    input.to,
    {
      subject: `We could not finish your ${label}`,
      preheader: `There was a problem with your ${label}.`,
      eyebrow: 'Action needed',
      title: `Your ${label} needs another try.`,
      intro:
        'Something went wrong while Pitch was processing your job. We saved the details so our team can investigate, and you can try again whenever you are ready.',
      badge: input.refundedCredits ? `${input.refundedCredits} credits refunded` : 'Job failed',
      badgeTone: 'danger',
      details: [
        { label: 'Job ID', value: input.jobId },
        ...(input.error ? [{ label: 'What happened', value: input.error.slice(0, 240) }] : []),
      ],
      ctaLabel: 'Return to Pitch',
      ctaUrl: `${APP_URL()}/dashboard`,
      note: 'If this happens again, reply to this email and include the job ID. We will help you sort it out.',
    },
    { firstName: input.firstName, idempotencyKey: `job-failed-${input.jobId}` },
  )
}

export function sendBillingEmail(input: {
  to: string
  firstName?: string | null
  event: 'subscription-started' | 'subscription-renewed' | 'subscription-cancelled' | 'topup'
  referenceId: string
  plan?: string
  credits?: number
  amount?: string
  periodEnd?: string
}) {
  const variants = {
    'subscription-started': {
      subject: 'Your Pitch subscription is active',
      eyebrow: 'Subscription confirmed',
      title: 'You are all set.',
      intro: 'Your Pitch subscription is active and your credits are ready to use.',
      badge: 'Subscription active',
      tone: 'success' as const,
    },
    'subscription-renewed': {
      subject: 'Your Pitch subscription renewed',
      eyebrow: 'Billing update',
      title: 'Your subscription has renewed.',
      intro:
        'Your next set of Pitch credits has been added and your subscription continues normally.',
      badge: 'Renewed',
      tone: 'success' as const,
    },
    'subscription-cancelled': {
      subject: 'Your Pitch subscription was cancelled',
      eyebrow: 'Subscription update',
      title: 'Your subscription is cancelled.',
      intro:
        'We have recorded your cancellation. You can still use Pitch according to the access shown in your billing settings.',
      badge: 'Cancelled',
      tone: 'neutral' as const,
    },
    topup: {
      subject: 'Receipt for your Pitch credit purchase',
      eyebrow: 'Payment receipt',
      title: 'Your credits have arrived.',
      intro:
        'Your payment was successful and the purchased credits are now available in your Pitch account.',
      badge: 'Payment successful',
      tone: 'success' as const,
    },
  }[input.event]
  return sendTransactional(
    input.to,
    {
      subject: variants.subject,
      preheader: variants.intro,
      eyebrow: variants.eyebrow,
      title: variants.title,
      intro: variants.intro,
      badge: variants.badge,
      badgeTone: variants.tone,
      details: [
        ...(input.plan ? [{ label: 'Plan', value: input.plan }] : []),
        ...(input.credits ? [{ label: 'Credits', value: String(input.credits) }] : []),
        ...(input.amount ? [{ label: 'Amount', value: input.amount }] : []),
        ...(input.periodEnd ? [{ label: 'Next billing date', value: input.periodEnd }] : []),
        { label: 'Reference', value: input.referenceId },
      ],
      ctaLabel: 'View billing',
      ctaUrl: `${APP_URL()}/settings`,
      note:
        input.event === 'topup'
          ? 'This email confirms your Pitch purchase. Your payment provider may also send its own tax receipt.'
          : undefined,
    },
    {
      firstName: input.firstName,
      idempotencyKey: `billing-${input.event}-${input.referenceId}`,
    },
  )
}
