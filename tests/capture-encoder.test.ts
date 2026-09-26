import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CaptureEncoder } from '../apps/api/src/render/utils/capture-encoder.ts'
import { MEDIA_TEST_TIMEOUT_MS } from './media-timeouts.js'

describe('high-quality capture master', () => {
  it(
    'encodes a native-size H.264 master and preserves a long static hold on the capture clock',
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'pitch-capture-'))
      const file = path.join(dir, 'capture.mkv')
      const encoder = new CaptureEncoder(file)
      try {
        const frame = (color: string) =>
          execFileSync('ffmpeg', [
            ...'-v error -f lavfi -i'.split(' '),
            `color=${color}:s=1920x1080`,
            '-vf',
            'drawbox=x=1900:y=1060:w=20:h=20:color=white:t=fill',
            ...'-frames:v 1 -c:v mjpeg -q:v 1 -f image2pipe pipe:1'.split(' '),
          ])
        await encoder.write(frame('red'), 0)
        await encoder.write(frame('blue'), 2000)
        await encoder.stop(3000)
        const probe = JSON.parse(
          execFileSync(
            'ffprobe',
            ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
            { encoding: 'utf8' },
          ),
        )
        expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080 })
        expect(encoder.fallbackReason).toBeNull()
        expect(existsSync(`${file}.capture.mkv`)).toBe(false)
        expect(Number(probe.format.duration)).toBeCloseTo(3, 1)
        const pixel = (time: string) =>
          execFileSync('ffmpeg', [
            '-v',
            'error',
            '-i',
            file,
            '-ss',
            time,
            ...'-frames:v 1 -vf crop=2:2:10:10,format=rgb24 -f rawvideo pipe:1'.split(' '),
          ])
        expect(pixel('1.5')[0]).toBeGreaterThan(200)
        expect(pixel('2.5')[2]).toBeGreaterThan(200)
        const bottom = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          ...'-ss 1.5 -frames:v 1 -vf crop=2:2:1908:1068,format=rgb24 -f rawvideo pipe:1'.split(
            ' ',
          ),
        ])
        expect([...bottom.subarray(0, 3)].every(channel => channel > 230)).toBe(true)
      } finally {
        encoder.abort()
        rmSync(dir, { recursive: true, force: true })
      }
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it('reports encoder failure rather than silently returning a broken recording', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pitch-empty-capture-'))
    const encoder = new CaptureEncoder(path.join(dir, 'empty.mkv'))
    try {
      await expect(encoder.stop(1000)).rejects.toThrow('no video frames')
    } finally {
      encoder.abort()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('continues journaling real frames after the compression process dies', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pitch-capture-crash-'))
    const file = path.join(dir, 'capture.mkv')
    const encoder = new CaptureEncoder(file, 320, 180)
    const frame = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=320x180',
      '-frames:v',
      '1',
      '-c:v',
      'mjpeg',
      '-f',
      'image2pipe',
      'pipe:1',
    ])
    try {
      await encoder.write(frame, 0)
      const child = (encoder as any).process
      const exited = new Promise(resolve => child.once('close', resolve))
      child.kill('SIGKILL')
      await exited
      await encoder.write(frame, 1000)
      await encoder.write(frame, 2000)
      await encoder.stop(3000)
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
          { encoding: 'utf8' },
        ),
      )
      expect(probe.streams[0]).toMatchObject({ codec_name: 'mjpeg', nb_read_frames: '4' })
      expect(Number(probe.format.duration)).toBeCloseTo(3, 3)
    } finally {
      encoder.abort()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each([
    { finishTimeoutMs: 10000, maxQueuedBytes: 0 },
    { finishTimeoutMs: 0, maxQueuedBytes: 32 * 1024 * 1024 },
  ])(
    'preserves every captured frame when live encoding stalls: %j',
    async limits => {
      const dir = mkdtempSync(path.join(tmpdir(), 'pitch-capture-fallback-'))
      const file = path.join(dir, 'capture.mkv')
      const encoder = new CaptureEncoder(file, 320, 180, limits)
      try {
        for (const [time, color] of [
          [0, 'red'],
          [1000, 'green'],
          [2000, 'blue'],
        ] as const) {
          const frame = execFileSync('ffmpeg', [
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            `color=${color}:s=320x180`,
            '-frames:v',
            '1',
            '-c:v',
            'mjpeg',
            '-q:v',
            '1',
            '-f',
            'image2pipe',
            'pipe:1',
          ])
          await encoder.write(frame, time)
        }
        await encoder.stop(3000)
        expect(encoder.fallbackReason).toBeTruthy()
        const probe = JSON.parse(
          execFileSync(
            'ffprobe',
            ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
            { encoding: 'utf8' },
          ),
        )
        expect(probe.streams[0]).toMatchObject({ codec_name: 'mjpeg', nb_read_frames: '4' })
        expect(Number(probe.format.duration)).toBeCloseTo(3, 3)
        // Decode the fallback as source assembly does: the last result and static
        // handles survive even though no compressed master could finish.
        const pixel = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-ss',
          '2.5',
          '-vf',
          'fps=30,crop=2:2:10:10,format=rgb24',
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          'pipe:1',
        ])
        expect(pixel[2]).toBeGreaterThan(200)
        expect(existsSync(`${file}.capture.mkv`)).toBe(false)
      } finally {
        encoder.abort()
        rmSync(dir, { recursive: true, force: true })
      }
    },
    MEDIA_TEST_TIMEOUT_MS,
  )
})
