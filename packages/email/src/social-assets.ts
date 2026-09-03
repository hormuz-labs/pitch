import { readFileSync } from 'node:fs'

const SOCIAL_ICONS = ['x', 'instagram', 'linkedin', 'discord', 'youtube'] as const

/** Embeds social icons inside the MIME message so email clients never fetch a 404. */
export function embedSocialIcons(html: string): {
  html: string
  attachments: Array<{
    filename: string
    content: Buffer
    contentType: string
    contentId: string
  }>
} {
  const attachments = []
  let embeddedHtml = html

  try {
    for (const name of SOCIAL_ICONS) {
      const contentId = `pitch-social-${name}`
      const filename = `${name}.png`
      const content = readFileSync(
        new URL(`../../../apps/web/public/email/social/${filename}`, import.meta.url),
      )
      embeddedHtml = embeddedHtml.replaceAll(
        `https://trypitch.co/email/social/${filename}`,
        `cid:${contentId}`,
      )
      attachments.push({ filename, content, contentType: 'image/png', contentId })
    }
  } catch (error) {
    console.warn('[Email] Could not embed social icons, using hosted image URLs', error)
    return { html, attachments: [] }
  }

  return { html: embeddedHtml, attachments }
}
