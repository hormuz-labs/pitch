import { describe, expect, it } from 'vitest'
import { embedSocialIcons } from '../packages/email/src/social-assets.js'
import {
  renderTransactionalEmail,
  sendJobCompletedEmail,
  sendJobStartedEmail,
  sendVideoReadyEmail,
} from '../packages/email/src/transactional.js'

describe('transactional email rendering', () => {
  it('handles missing RESEND_API_KEY gracefully in transactional helper functions', async () => {
    const started = await sendJobStartedEmail({
      to: 'test@example.com',
      jobId: 'job_1',
      title: 'Demo',
    })
    expect(started.error).toBe('RESEND_API_KEY is not configured')

    const completed = await sendJobCompletedEmail({
      to: 'test@example.com',
      jobId: 'job_1',
      title: 'Demo',
      outputUrl: 'https://example.com/video.mp4',
    })
    expect(completed.error).toBe('RESEND_API_KEY is not configured')

    const videoReady = await sendVideoReadyEmail({
      to: 'test@example.com',
      jobId: 'job_1',
      title: 'Demo',
      videoUrl: 'https://example.com/video.mp4',
      resolution: '1080p',
    })
    expect(videoReady.error).toBe('RESEND_API_KEY is not configured')
  })
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

  it('renders a responsive job-started email template', () => {
    const result = renderTransactionalEmail(
      {
        subject: "We've started working on your project: Acme Launch",
        preheader: 'Pitch is now processing your project.',
        eyebrow: 'Project Started',
        title: "We're bringing your vision to life.",
        intro: 'Your project has started processing.',
        badge: 'In Progress',
        badgeTone: 'neutral',
        details: [
          { label: 'Project', value: 'Acme Launch' },
          { label: 'Job ID', value: 'job_start_123' },
          { label: 'Prompt', value: 'Create a fast-paced launch video' },
        ],
        ctaLabel: 'Open in Pitch Studio',
        ctaUrl: 'https://trypitch.co/projects/job_start_123',
      },
      'Sarah',
    )

    expect(result.html).toContain('Hey Sarah,')
    expect(result.html).toContain('Project Started')
    expect(result.html).toContain('We&#039;re bringing your vision to life.')
    expect(result.html).toContain('In Progress')
    expect(result.html).toContain('Acme Launch')
    expect(result.html).toContain('job_start_123')
    expect(result.html).toContain('href="https://trypitch.co/projects/job_start_123"')
    expect(result.html).toContain('@media only screen and (max-width:600px)')
    expect(result.text).toContain('Project: Acme Launch')
    expect(result.text).toContain('Job ID: job_start_123')
  })

  it('renders a responsive video-ready email template for export', () => {
    const result = renderTransactionalEmail(
      {
        subject: 'Your video is rendered & ready to export: Acme Demo',
        preheader: 'High-definition MP4 render is ready (1080p).',
        eyebrow: 'Render Complete',
        title: 'Your video is ready to export.',
        intro: 'Your video has finished rendering in high definition (1080p).',
        badge: 'Ready to Export',
        badgeTone: 'success',
        details: [
          { label: 'Project', value: 'Acme Demo' },
          { label: 'Resolution', value: '1080p' },
          { label: 'Format', value: 'MP4 Video' },
          { label: 'Job ID', value: 'job_render_456' },
        ],
        ctaLabel: 'Download / Export Video',
        ctaUrl: 'https://storage.trypitch.co/videos/acme-1080p.mp4',
        note: 'You can download your MP4 directly or access all export formats in Studio.',
      },
      'Alex',
    )

    expect(result.html).toContain('Hey Alex,')
    expect(result.html).toContain('Render Complete')
    expect(result.html).toContain('Your video is ready to export.')
    expect(result.html).toContain('Ready to Export')
    expect(result.html).toContain('1080p')
    expect(result.html).toContain('MP4 Video')
    expect(result.html).toContain('href="https://storage.trypitch.co/videos/acme-1080p.mp4"')
    expect(result.text).toContain('Format: MP4 Video')
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

  it('embeds social icons into the email message', () => {
    const embedded = embedSocialIcons(
      '<img src="https://trypitch.co/email/social/youtube.png" alt="YouTube">',
    )

    expect(embedded.html).toContain('src="cid:pitch-social-youtube"')
    expect(embedded.attachments).toHaveLength(5)
    expect(
      embedded.attachments.find(item => item.filename === 'youtube.png')?.content.length,
    ).toBeGreaterThan(0)
  })
})
