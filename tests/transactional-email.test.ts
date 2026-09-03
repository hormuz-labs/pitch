import { describe, expect, it } from 'vitest'
import { renderTransactionalEmail } from '../packages/email/src/transactional.js'

describe('transactional email rendering', () => {
  it('renders a responsive monochrome email with a safe CTA', () => {
    const result = renderTransactionalEmail(
      {
        subject: 'Your demo is ready',
        preheader: 'Ready to watch',
        eyebrow: 'Ready in Pitch',
        title: 'Your demo video is ready.',
        intro: 'We finished your video.',
        badge: 'Completed',
        badgeTone: 'success',
        details: [{ label: 'Project', value: '<script>alert(1)</script>' }],
        ctaLabel: 'Watch video',
        ctaUrl: 'https://trypitch.co/demo/123',
      },
      'Adnan',
    )

    expect(result.html).toContain('@media only screen and (max-width:600px)')
    expect(result.html).toContain('max-width:600px')
    expect(result.html).toContain('background:#111')
    expect(result.html).toContain('Hey Adnan,')
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.html).not.toContain('<script>alert(1)</script>')
    expect(result.html).not.toContain('→')
    expect(result.html).toContain('https://www.youtube.com/@trypitchdotco')
    expect(result.text).toContain('Watch video: https://trypitch.co/demo/123')
  })

  it('blocks unsafe action URLs', () => {
    const result = renderTransactionalEmail({
      subject: 'Test',
      preheader: 'Test',
      eyebrow: 'Test',
      title: 'Test',
      intro: 'Test',
      ctaLabel: 'Open',
      ctaUrl: 'javascript:alert(1)',
    })

    expect(result.html).toContain('href="#"')
    expect(result.html).not.toContain('href="javascript:')
  })
})
