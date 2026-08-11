import { describe, expect, it } from 'vitest'
import { buildLaunchVideoMediaUrl } from '../apps/web/src/launch-video/api'

describe('launch-video media URLs', () => {
  it('does not leak the Clerk token to public object-storage URLs', () => {
    expect(
      buildLaunchVideoMediaUrl(
        'https://s3.trypitch.co/pitch-videos/render.mp4',
        'clerk-secret-token',
        3,
      ),
    ).toBe('https://s3.trypitch.co/pitch-videos/render.mp4?v=3')
  })

  it('authenticates API-hosted render URLs', () => {
    expect(
      buildLaunchVideoMediaUrl(
        '/launch-video/files/videos/user--project-launch.mp4',
        'clerk token',
        2,
      ),
    ).toBe('/api/launch-video/files/videos/user--project-launch.mp4?v=2&token=clerk+token')
  })

  it('can render public media before a Clerk token is available', () => {
    expect(buildLaunchVideoMediaUrl('https://s3.trypitch.co/pitch-videos/render.mp4', null)).toBe(
      'https://s3.trypitch.co/pitch-videos/render.mp4',
    )
    expect(buildLaunchVideoMediaUrl('/launch-video/files/videos/render.mp4', null)).toBeNull()
  })
})
