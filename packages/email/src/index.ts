import { Resend } from 'resend'

export {
  type JobEmailKind,
  renderTransactionalEmail,
  sendBillingEmail,
  sendJobCompletedEmail,
  sendJobFailedEmail,
  sendWelcomeEmail,
  type TransactionalEmailContent,
} from './transactional.js'

import { embedSocialIcons } from './social-assets.js'
import { sendJobCompletedEmail } from './transactional.js'

// ─── Clerk: fetch user email ──────────────────────────────────────────────────

/**
 * Fetches the primary email address for a Clerk userId.
 * Uses the Clerk Backend API — requires CLERK_SECRET_KEY in env.
 */
export async function getClerkUserEmail(userId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.warn('[Email] CLERK_SECRET_KEY not set — cannot fetch user email')
    return null
  }

  const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    console.warn(`[Email] Clerk API returned ${res.status} for user ${userId}`)
    return null
  }

  const user = (await res.json()) as {
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id: string
  }

  const primary = user.email_addresses.find(e => e.id === user.primary_email_address_id)

  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null
}

// ─── Resend client ────────────────────────────────────────────────────────────

function createResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }
  return new Resend(apiKey)
}

// ─── Email templates ──────────────────────────────────────────────────────────

/**
 * Anti-spam design principles applied:
 *
 * 1. TABLE-BASED LAYOUT  — Gmail strips CSS classes/flexbox; tables render correctly everywhere.
 * 2. INLINE STYLES ONLY  — External/embedded stylesheets are stripped by many clients.
 * 3. PLAIN-TEXT PARITY   — A full text alternative is sent alongside HTML (required by RFC 2822 & Gmail policy).
 * 4. REAL SENDER ADDRESS — `from` uses noreply@trypitch.co with verified Resend domain.
 * 5. SINGLE CTA LINK     — Multiple raw URLs trigger spam filters; one prominent button + one fallback.
 * 6. NO SPAM TRIGGER WORDS — No "FREE", "CLICK NOW", "URGENT", "WINNER", exclamation overuse, etc.
 * 7. PROPER PREHEADER    — Hidden preheader text shows in inbox preview before the subject.
 * 8. UNSUBSCRIBE / PHYSICAL ADDRESS — Google's Bulk Sender policy (enforced Feb 2024) requires
 *    a one-click unsubscribe header AND a visible postal address for bulk senders.
 *    Add List-Unsubscribe headers via `headers` field (see sendJobCompleteEmail).
 * 9. TEXT-TO-IMAGE RATIO — No images used; pure text/color keeps the ratio well above 60 %.
 * 10. CONSISTENT BRANDING — Sender name matches the from address; builds domain reputation.
 *
 * Design: matches the Pitch dashboard — dark navy (#1a1a2e) brand color, white card,
 * light gray outer bg (#f0f0f0), green "Ready" status badge, dark CTA button.
 */
function jobCompleteHtml(videoUrl: string, recipientEmail: string, videoTitle?: string): string {
  const year = new Date().getFullYear()
  const preheader = 'Your product demo video has finished generating and is ready to view.'
  const displayTitle = videoTitle ?? 'your-product.com'
  const _unsubUrl = `${process.env.UNSUBSCRIBE_BASE_URL ?? 'https://yourapp.com'}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`
  const date = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!--[if !mso]><!-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <!--<![endif]-->
  <title>Your demo video is ready &mdash; Pitch</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader (hidden inbox preview text) -->
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#ffffff;min-width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;background-color:#ffffff;border-radius:14px;
                      border:1px solid #e8e8e8;overflow:hidden;">

          <!-- Top accent bar — matches dark nav -->
          <tr>
            <td style="height:4px;background-color:#1a1a2e;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Logo header — real Pitch icon + wordmark -->
          <tr>
            <td style="padding:24px 36px 0 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <svg width="32" height="32" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                      <rect width="200" height="200" x="5" y="5" rx="36" fill="#111111"/>
                      <rect fill="#ffffff" x="58" y="50" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="91" y="50" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="124" y="50" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="58" y="73" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="124" y="73" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="58" y="96" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="91" y="96" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="124" y="96" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="58" y="119" width="28" height="18" rx="3"/>
                      <rect fill="#ffffff" x="58" y="142" width="28" height="18" rx="3"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <h1 style="margin:0;font-size:22px;color:#1a1a2e;font-weight:700;letter-spacing:-0.3px;">Pitch</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Video thumbnail block — mimics dashboard card -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#1a1a2e;border-radius:10px;overflow:hidden;">
                <tr>
                  <!-- Play icon cell (centred, fixed height) -->
                  <td align="center" style="padding:36px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center"
                            style="width:52px;height:52px;border-radius:50%;
                                   background-color:rgba(255,255,255,0.15);
                                   font-size:22px;line-height:52px;text-align:center;color:#ffffff;">
                          &#9654;
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:10px;">
                          <span style="font-size:12px;color:rgba(255,255,255,0.55);
                                       letter-spacing:0.03em;">${displayTitle}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Duration badge row -->
                <tr>
                  <td align="right" style="padding:0 12px 10px 12px;">
                    <span style="display:inline-block;background-color:rgba(0,0,0,0.65);
                                 color:#ffffff;font-size:11px;font-weight:600;
                                 padding:3px 8px;border-radius:5px;">0:48</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title + date -->
          <tr>
            <td style="padding:16px 36px 0 36px;">
              <p style="margin:0 0 4px;font-size:19px;font-weight:700;color:#1a1a2e;
                        letter-spacing:-0.01em;line-height:1.3;">
                Your demo video is ready
              </p>
              <p style="margin:0;font-size:13px;color:#888888;">${date}</p>
            </td>
          </tr>

          <!-- Ready badge — matches dashboard status pill -->
          <tr>
            <td style="padding:12px 36px 0 36px;">
              <span style="display:inline-block;background-color:#f0fdf4;
                           border:1px solid #bbf7d0;color:#16a34a;
                           font-size:12px;font-weight:500;
                           padding:4px 14px;border-radius:20px;">
                &#10003;&nbsp; Ready
              </span>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #f0f0f0;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="padding:16px 36px 0 36px;">
              <p style="margin:0;font-size:14px;line-height:1.7;color:#555555;">
                Your product demo video has finished generating. Watch it below or
                share the link with your team.
              </p>
            </td>
          </tr>

          <!-- CTA Button — matches "+ New Video" dark button in app nav -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background-color:#1a1a2e;">
                    <a href="${videoUrl}"
                       target="_blank"
                       rel="noopener noreferrer"
                       style="display:inline-block;padding:11px 24px;
                              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
                              font-size:14px;font-weight:600;color:#ffffff;
                              text-decoration:none;border-radius:8px;
                              background-color:#1a1a2e;">
                      &#9654;&nbsp; Watch your video
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback URL -->
          <tr>
            <td style="padding:10px 36px 0 36px;">
              <p style="margin:0;font-size:11px;color:#aaaaaa;">
                Or copy this link:&nbsp;
                <span style="font-family:'Courier New',Courier,monospace;
                             color:#888888;word-break:break-all;">${videoUrl}</span>
              </p>
            </td>
          </tr>

          <!-- What you can do next — info box -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f7f7f8;border-radius:8px;border:1px solid #ebebeb;">
                <tr>
                  <!-- Share -->
                  <td align="center" width="50%" style="padding:16px 8px;">
                    <a href="${videoUrl}" target="_blank" style="text-decoration:none;">
                      <p style="margin:0 0 4px;font-size:22px;line-height:1;color:#1a1a2e;">
                        &#128279;
                      </p>
                      <p style="margin:0;font-size:11px;color:#888888;">Share link</p>
                    </a>
                  </td>
                  <!-- Divider -->
                  <td style="border-left:1px solid #e8e8e8;padding:0;font-size:0;line-height:0;">&nbsp;</td>
                  <!-- Download -->
                  <td align="center" width="50%" style="padding:16px 8px;">
                    <a href="${videoUrl}" download="demo.mp4" target="_blank" style="text-decoration:none;">
                      <p style="margin:0 0 4px;font-size:22px;line-height:1;color:#1a1a2e;">
                        &#128229;
                      </p>
                      <p style="margin:0;font-size:11px;color:#888888;">Download MP4</p>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Community section -->
          <tr>
            <td style="padding:24px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f7f7f8;border-radius:10px;border:1px solid #ebebeb;">
                <tr>
                  <td align="center" style="padding:20px 20px 16px 20px;">
                    <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#1a1a2e;letter-spacing:-0.01em;">
                      Join the community
                    </p>
                    <p style="margin:0;font-size:12px;color:#888888;">
                      Get updates, share feedback, and connect with other makers.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 12px 16px 12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Discord -->
                        <td align="center" width="33.33%" style="padding:6px;">
                          <a href="https://discord.gg/uMeBrWBW" target="_blank" rel="noopener noreferrer"
                             style="display:block;padding:14px 4px 10px;border-radius:8px;
                                    background-color:#5865F2;color:#ffffff;text-decoration:none;">
                            <span style="display:block;font-size:26px;line-height:1.2;margin-bottom:2px;">&#128293;</span>
                            <span style="display:block;font-size:13px;font-weight:600;">Discord</span>
                            <span style="display:block;font-size:10px;opacity:0.8;margin-top:2px;">Chat with us</span>
                          </a>
                        </td>
                        <!-- X / Twitter -->
                        <td align="center" width="33.33%" style="padding:6px;">
                          <a href="https://x.com/trypitchdotco" target="_blank" rel="noopener noreferrer"
                             style="display:block;padding:14px 4px 10px;border-radius:8px;
                                    background-color:#000000;color:#ffffff;text-decoration:none;">
                            <span style="display:block;font-size:26px;line-height:1.2;margin-bottom:2px;">&#120143;</span>
                            <span style="display:block;font-size:13px;font-weight:600;">X / Twitter</span>
                            <span style="display:block;font-size:10px;opacity:0.8;margin-top:2px;">Follow @trypitchdotco</span>
                          </a>
                        </td>
                        <!-- LinkedIn -->
                        <td align="center" width="33.33%" style="padding:6px;">
                          <a href="https://www.linkedin.com/company/trypitchdotco/" target="_blank" rel="noopener noreferrer"
                             style="display:block;padding:14px 4px 10px;border-radius:8px;
                                    background-color:#0A66C2;color:#ffffff;text-decoration:none;">
                            <span style="display:block;font-size:26px;line-height:1.2;margin-bottom:2px;">&#128188;</span>
                            <span style="display:block;font-size:13px;font-weight:600;">LinkedIn</span>
                            <span style="display:block;font-size:10px;opacity:0.8;margin-top:2px;">Connect with us</span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer spacer -->
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Footer divider -->
          <tr>
            <td style="padding:0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #f0f0f0;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer content -->
          <tr>
            <td align="center" style="padding:16px 36px 28px 36px;">
              <p style="margin:0 0 6px;font-size:11px;color:#bbbbbb;text-align:center;">
                You received this because you have a Pitch account associated with
                <a href="mailto:${recipientEmail}" style="color:#bbbbbb;text-decoration:underline;">${recipientEmail}</a>.
              </p>
              <p style="margin:0 0 6px;font-size:11px;color:#bbbbbb;text-align:center;">
                &copy; ${year} Pitch &mdash; Automated Product Demos
              </p>
              <p style="margin:0;font-size:11px;text-align:center;">
                <a href="mailto:support@trypitch.co?subject=Unsubscribe&body=Please%20unsubscribe%20me." style="color:#bbbbbb;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function jobCompleteText(videoUrl: string, jobId: string): string {
  return `Your demo video is ready — Pitch
==========================================

Your product demo video (Job ID: ${jobId}) has finished generating.

Watch it here:
${videoUrl}

What you can do next:
- Share a link with stakeholders
- Download an MP4 for offline use

Join our community:
- Discord: https://discord.gg/uMeBrWBW
- X / Twitter: https://x.com/trypitchdotco
- LinkedIn: https://www.linkedin.com/company/trypitchdotco/

--
Pitch — Automated Product Demos

To unsubscribe, please email support@trypitch.co
`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendJobCompleteEmail({
  to,
  jobId,
  videoUrl,
  videoTitle,
}: {
  to: string
  jobId: string
  videoUrl: string
  videoTitle?: string // e.g. "razorpay.com" — shown inside the thumbnail block
}): Promise<void> {
  const result = await sendJobCompletedEmail({
    to,
    jobId,
    outputUrl: videoUrl,
    title: videoTitle,
    kind: 'demo',
  })
  if (result.error) {
    console.warn(`[Email] Failed to send job-complete notification to ${to}:`, result.error)
  } else {
    console.log(`[Email] Sent job-complete notification to ${to} for job ${jobId}`)
  }
}

function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export type NewsletterEmailInput = {
  to: string
  firstName?: string | null
  subject: string
  message: string
  unsubscribeUrl: string
  ctaLabel?: string
  ctaUrl?: string
}

function renderNewsletterMessage(message: string): string {
  const blocks: string[] = []
  const codePattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let cursor = 0

  const addProse = (value: string) => {
    for (const paragraph of value.split(/\n\s*\n/)) {
      const content = paragraph.trim()
      if (!content) continue
      blocks.push(
        `<p style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:27px;color:#374151;margin:0 0 20px">${escapeEmailHtml(content).replaceAll('\n', '<br>')}</p>`,
      )
    }
  }

  for (const match of message.matchAll(codePattern)) {
    const index = match.index ?? 0
    addProse(message.slice(cursor, index))
    const language = match[1].trim()
    blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px"><tr><td style="padding:0;background:#111111;border-radius:10px;overflow:hidden">
      ${language ? `<div style="padding:9px 14px;border-bottom:1px solid #303030;color:#a3a3a3;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:10px;line-height:15px;text-transform:uppercase;letter-spacing:.08em">${escapeEmailHtml(language)}</div>` : ''}
      <pre style="margin:0;padding:16px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#f5f5f5;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:12px;line-height:20px"><code>${escapeEmailHtml(match[2].replace(/\n$/, ''))}</code></pre>
    </td></tr></table>`)
    cursor = index + match[0].length
  }
  addProse(message.slice(cursor))
  return blocks.join('')
}

/** Builds the exact HTML and plain-text alternatives sent through Resend. */
export function renderNewsletterEmail({
  firstName,
  subject,
  message,
  unsubscribeUrl,
  ctaLabel,
  ctaUrl,
}: NewsletterEmailInput): { html: string; text: string } {
  const greeting = firstName?.trim() ? `Hi ${firstName.trim()},` : 'Hi there,'
  const safeMessage = renderNewsletterMessage(message)
  const safeSubject = escapeEmailHtml(subject)
  const buttonLabel = escapeEmailHtml(ctaLabel?.trim() || 'See what is new at Pitch')
  const buttonUrl = escapeEmailHtml(
    ctaUrl?.trim() || process.env.NEWSLETTER_CTA_URL || 'https://trypitch.co',
  )
  const logoUrl = escapeEmailHtml(
    process.env.NEWSLETTER_LOGO_URL ?? 'https://trypitch.co/tabLogoB.svg',
  )
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.mobile-pad{padding-left:24px!important;padding-right:24px!important}.hero-title{font-size:30px!important;line-height:36px!important}.outer-pad{padding:16px 8px!important}.cta{display:block!important;text-align:center!important}.footer-link{display:inline-block!important;margin:0 14px 8px 0!important;white-space:nowrap!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;-webkit-text-size-adjust:100%;word-spacing:normal">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(message.slice(0, 120))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f4f6">
  <tr><td class="outer-pad" align="center" style="padding:36px 16px">
    <table class="email-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.10)">
      <tr><td class="mobile-pad" style="padding:26px 40px;background:#ffffff;border-bottom:1px solid #e5e7eb">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle"><img src="${logoUrl}" width="42" height="42" alt="Pitch" style="display:block;width:42px;height:42px;border:0"></td>
          <td valign="middle" align="right" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Product notes</td>
        </tr></table>
      </td></tr>
      <tr><td class="mobile-pad" style="padding:42px 40px 46px;background-color:#111111;background-image:linear-gradient(135deg,#111111 0%,#1f1f1f 60%,#383838 100%);color:#ffffff">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td class="hero-title" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:38px;line-height:44px;font-weight:750;letter-spacing:-1.2px;color:#ffffff">${safeSubject}</td></tr>
          <tr><td style="padding-top:26px"><span style="display:inline-block;width:54px;height:4px;border-radius:4px;background:#ffffff;font-size:0;line-height:0">&nbsp;</span></td></tr>
        </table>
      </td></tr>
      <tr><td class="mobile-pad" style="padding:42px 40px 38px">
        <p style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:18px;line-height:29px;font-weight:700;color:#111827;margin:0 0 20px">${escapeEmailHtml(greeting)}</p>
        ${safeMessage}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px"><tr><td bgcolor="#111111" style="border-radius:10px">
          <a class="cta" href="${buttonUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;line-height:18px;font-weight:700">${buttonLabel}</a>
        </td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:38px"><tr>
          <td width="42" valign="top"><div style="width:38px;height:38px;border-radius:50%;background:#111111;color:#ffffff;text-align:center;line-height:38px;font-size:14px;font-weight:800">A</div></td>
          <td valign="middle" style="padding-left:10px;font-size:13px;line-height:19px;color:#6b7280"><strong style="color:#111827">Adnan</strong><br>Co-founder, Pitch</td>
        </tr></table>
      </td></tr>
      <tr><td class="mobile-pad" style="padding:27px 40px;background:#f9fafb;border-top:1px solid #e5e7eb">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-size:13px;line-height:21px;font-weight:700;color:#111827;padding-bottom:9px">Pitch</td></tr>
          <tr><td style="font-size:12px;line-height:20px;color:#6b7280;padding-bottom:15px">Beautiful product demos, launch videos, and presentations made with AI.</td></tr>
          <tr><td style="font-size:12px;line-height:20px">
            <a class="footer-link" href="https://trypitch.co" style="color:#374151;text-decoration:underline;margin-right:18px">Visit Pitch</a>
            <a class="footer-link" href="mailto:support@trypitch.co" style="color:#374151;text-decoration:underline;margin-right:18px">Contact us</a>
            <a class="footer-link" href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#374151;text-decoration:underline">Unsubscribe</a>
          </td></tr>
          <tr><td style="padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px"><a href="https://x.com/trypitchdotco" aria-label="Pitch on X"><img src="https://trypitch.co/email/social/x.png" width="30" height="30" alt="X" style="display:block;width:30px;height:30px;border:0"></a></td>
            <td style="padding-right:9px"><a href="https://www.instagram.com/trypitch.co" aria-label="Pitch on Instagram"><img src="https://trypitch.co/email/social/instagram.png" width="30" height="30" alt="Instagram" style="display:block;width:30px;height:30px;border:0"></a></td>
            <td style="padding-right:9px"><a href="https://www.linkedin.com/company/trypitchdotco/" aria-label="Pitch on LinkedIn"><img src="https://trypitch.co/email/social/linkedin.png" width="30" height="30" alt="LinkedIn" style="display:block;width:30px;height:30px;border:0"></a></td>
            <td style="padding-right:9px"><a href="https://discord.gg/a4SBW36mD" aria-label="Pitch on Discord"><img src="https://trypitch.co/email/social/discord.png" width="30" height="30" alt="Discord" style="display:block;width:30px;height:30px;border:0"></a></td>
            <td><a href="https://www.youtube.com/@trypitchdotco" aria-label="Pitch on YouTube"><img src="https://trypitch.co/email/social/youtube.png" width="30" height="30" alt="YouTube" style="display:block;width:30px;height:30px;border:0"></a></td>
          </tr></table></td></tr>
          <tr><td style="padding-top:18px;font-size:11px;line-height:18px;color:#9ca3af">You received this email because you signed up for Pitch or joined our updates list.</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  return {
    html,
    text: `${greeting}\n\n${message}\n\nAdnan\nCo-founder, Pitch\n\n${ctaLabel?.trim() || 'See what is new at Pitch'}: ${ctaUrl?.trim() || process.env.NEWSLETTER_CTA_URL || 'https://trypitch.co'}\n\nFollow Pitch:\nX: https://x.com/trypitchdotco\nInstagram: https://www.instagram.com/trypitch.co\nLinkedIn: https://www.linkedin.com/company/trypitchdotco/\nDiscord: https://discord.gg/a4SBW36mD\nYouTube: https://www.youtube.com/@trypitchdotco\n\nUnsubscribe: ${unsubscribeUrl}`,
  }
}

/** Sends one consent-aware product update to a newsletter subscriber. */
export async function sendNewsletterEmail(
  input: NewsletterEmailInput,
): Promise<{ id?: string; error?: string }> {
  const resend = createResend()
  if (!resend) return { error: 'RESEND_API_KEY is not configured' }
  const content = renderNewsletterEmail(input)
  const embedded = embedSocialIcons(content.html)

  const { data, error } = await resend.emails.send({
    from: process.env.NEWSLETTER_FROM ?? 'Adnan from Pitch <noreply@trypitch.co>',
    to: input.to,
    replyTo: 'support@trypitch.co',
    subject: input.subject,
    text: content.text,
    html: embedded.html,
    attachments: embedded.attachments,
    headers: {
      'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      Precedence: 'bulk',
    },
  })

  if (error) return { error: error.message }
  return { id: data?.id }
}
