import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CaptureEncoder } from '../apps/api/src/render/utils/capture-encoder.ts'

describe('high-quality capture master', () => {
  it('encodes native-size VP9 and preserves a long static hold on the capture clock', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pitch-capture-'))
    const file = path.join(dir, 'capture.webm')
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
      expect(probe.streams[0]).toMatchObject({ codec_name: 'vp9', width: 1920, height: 1080 })
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
        ...'-ss 1.5 -frames:v 1 -vf crop=2:2:1908:1068,format=rgb24 -f rawvideo pipe:1'.split(' '),
      ])
      expect([...bottom.subarray(0, 3)].every(channel => channel > 230)).toBe(true)
    } finally {
      encoder.abort()
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it('reports encoder failure rather than silently returning a broken recording', async () => {
    const encoder = new CaptureEncoder('/nonexistent/pitch-capture/no.webm')
    try {
      await expect(encoder.stop(1000)).rejects.toThrow('no video frames')
    } finally {
      encoder.abort()
    }
  })
})
