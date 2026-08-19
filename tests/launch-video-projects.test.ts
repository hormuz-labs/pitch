import { describe, expect, it } from 'vitest'
import {
  launchVideoDisplayName,
  mergeLaunchVideoJobs,
  resolveLaunchVideoProjectDetail,
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

  it('uses the completed job S3 render when the API container has no local project files', () => {
    const jobs = [
      {
        id: 'job-ready',
        status: 'COMPLETED',
        videoUrl: 'https://s3.example.test/pitch/user/acme/videos/render.mp4',
        parameters: {
          jobType: 'launch-video',
          projectName: 'acme-launch',
        },
      },
    ]

    const [project] = mergeLaunchVideoJobs([], jobs)
    expect(project).toEqual(
      expect.objectContaining({
        name: 'acme-launch',
        hasVideo: true,
        videoUrl: jobs[0].videoUrl,
      }),
    )

    expect(resolveLaunchVideoProjectDetail(null, 'acme-launch', jobs)).toEqual(
      expect.objectContaining({
        name: 'acme-launch',
        hasVideo: true,
        videoUrl: jobs[0].videoUrl,
        scenes: [],
        duration: 0,
      }),
    )
  })

  it('prefers the job S3 render over the local API path when both exist', () => {
    const s3Url = 'https://s3.example.test/pitch/user/acme/videos/render.mp4'
    const [project] = mergeLaunchVideoJobs(
      [
        {
          name: 'acme-launch',
          hasVideo: true,
          videoUrl: '/launch-video/files/videos/user--acme-launch.mp4',
          sceneCount: 0,
        },
      ],
      [
        {
          id: 'job-ready',
          status: 'COMPLETED',
          videoUrl: s3Url,
          parameters: { jobType: 'launch-video', projectName: 'acme-launch' },
        },
      ],
    )

    expect(project.videoUrl).toBe(s3Url)
  })

  it('keeps local scene metadata while falling back to the job S3 render', () => {
    const project = {
      name: 'acme-launch',
      hasVideo: false,
      videoUrl: null,
      sceneCount: 1,
      duration: 4,
      scenes: [
        {
          id: 'scene1',
          index: 1,
          start: 0,
          end: 4,
          dur: 4,
          vo: null,
          draftUrl: null,
        },
      ],
    }
    const videoUrl = 'https://s3.example.test/pitch/user/acme/videos/render.mp4'

    expect(
      resolveLaunchVideoProjectDetail(project, 'acme-launch', [
        {
          id: 'job-ready',
          status: 'COMPLETED',
          videoUrl,
          parameters: { jobType: 'launch-video', projectName: 'acme-launch' },
        },
      ]),
    ).toEqual(expect.objectContaining({ videoUrl, hasVideo: true, sceneCount: 1 }))
  })
})
