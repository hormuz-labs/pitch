import { describe, expect, it } from 'vitest'
import {
  launchVideoDisplayName,
  mergeLaunchVideoJobs,
} from '../apps/api/src/lib/launch-video/projects'

describe('launch-video project list', () => {
  it('includes an active job before its project directory is ready', () => {
    const result = mergeLaunchVideoJobs(
      [],
      [
        {
          id: 'job-active',
          status: 'PROCESSING',
          parameters: {
            jobType: 'launch-video',
            projectName: 'acme-launch',
          },
        },
      ],
    )

    expect(result).toEqual([
      expect.objectContaining({
        name: 'acme-launch',
        hasVideo: false,
        jobId: 'job-active',
        status: 'PROCESSING',
      }),
    ])
  })

  it('attaches progress routing data to an unfinished on-disk project', () => {
    const result = mergeLaunchVideoJobs(
      [{ name: 'acme-launch', hasVideo: false, videoUrl: null, sceneCount: 3 }],
      [
        {
          id: 'job-active',
          status: 'PENDING',
          parameters: { jobType: 'launch-video', projectName: 'acme-launch' },
        },
      ],
    )

    expect(result[0]).toEqual(
      expect.objectContaining({ jobId: 'job-active', status: 'PENDING', sceneCount: 3 }),
    )
  })

  it('uses only the newest job for a project', () => {
    const result = mergeLaunchVideoJobs(
      [],
      [
        {
          id: 'job-new',
          status: 'PROCESSING',
          parameters: { jobType: 'launch-video', projectName: 'same-name' },
        },
        {
          id: 'job-old',
          status: 'FAILED',
          parameters: { jobType: 'launch-video', projectName: 'same-name' },
        },
      ],
    )

    expect(result).toHaveLength(1)
    expect(result[0].jobId).toBe('job-new')
  })

  it('uses the target website as the project display name', () => {
    expect(launchVideoDisplayName('Make a launch video for siodelhi.org', 'fallback')).toBe(
      'siodelhi.org',
    )
    expect(launchVideoDisplayName('Launch https://www.example.com/pricing today', 'fallback')).toBe(
      'example.com',
    )

    const [project] = mergeLaunchVideoJobs(
      [],
      [
        {
          id: 'job-site',
          status: 'COMPLETED',
          parameters: {
            jobType: 'launch-video',
            projectName: 'make-launch-video-for',
            prompt: 'Make a launch video for siodelhi.org',
          },
        },
      ],
    )
    expect(project.displayName).toBe('siodelhi.org')
  })
})
