import { spawn } from 'node:child_process'

// Timestamped MJPEG in Matroska lets FFmpeg hold static frames without a timer
// pumping duplicate JPEGs through IPC. All timestamps are on the capture clock.
function uint(value: number): Buffer {
  let hex = Math.max(0, Math.round(value)).toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return Buffer.from(hex, 'hex')
}

function element(id: string, data: Buffer): Buffer {
  let bytes = 1
  while (data.length >= 2 ** (7 * bytes) - 1) bytes++
  const size = Buffer.alloc(bytes)
  size.writeUIntBE(data.length, 0, bytes)
  size[0] |= 1 << (8 - bytes)
  return Buffer.concat([Buffer.from(id, 'hex'), size, data])
}

const value = (id: string, n: number) => element(id, uint(n))
const text = (id: string, s: string) => element(id, Buffer.from(s))

function jpegSize(data: Buffer): { width: number; height: number } {
  for (let offset = 2; offset + 8 < data.length; ) {
    if (data[offset] !== 0xff) break
    const marker = data[offset + 1]!
    if (marker === 0xff) {
      offset++
      continue
    }
    if (marker === 0xda || marker === 0xd9) break
    const length = data.readUInt16BE(offset + 2)
    if (length < 2) break
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) }
    }
    offset += 2 + length
  }
  throw new Error('Capture frame has no JPEG dimensions')
}

function header(width: number, height: number): Buffer {
  return Buffer.concat([
    element(
      '1a45dfa3',
      Buffer.concat([
        value('4286', 1),
        value('42f7', 1),
        value('42f2', 4),
        value('42f3', 8),
        text('4282', 'matroska'),
        value('4287', 4),
        value('4285', 2),
      ]),
    ),
    Buffer.from('1853806701ffffffffffffff', 'hex'), // Unknown segment size (stream).
    element(
      '1549a966',
      Buffer.concat([value('2ad7b1', 1_000_000), text('4d80', 'Pitch'), text('5741', 'Pitch')]),
    ),
    element(
      '1654ae6b',
      element(
        'ae',
        Buffer.concat([
          value('d7', 1),
          value('73c5', 1),
          value('83', 1),
          text('86', 'V_MJPEG'),
          value('23e383', 33_333_333), // Default frame duration, nanoseconds (30 fps).
          element('e0', Buffer.concat([value('b0', width), value('ba', height)])),
        ]),
      ),
    ),
  ])
}

/** A source-quality master, not the CLI's fixed 1 Mbps VP8 delivery encode. */
export class CaptureEncoder {
  private process
  private completion: Promise<Error | null>
  private last: Buffer | null = null
  private lastTime = 0
  private pending = Promise.resolve()
  private stopped = false
  private failure: Error | null = null

  constructor(
    output: string,
    private width = 1920,
    private height = 1080,
  ) {
    const args = (
      '-hide_banner -loglevel error -nostdin -n ' +
      '-f matroska -fpsprobesize 0 -probesize 32 -analyzeduration 0 -i pipe:0 -an ' +
      '-vf fps=30:round=near -fps_mode cfr -c:v libvpx-vp9 -deadline realtime -cpu-used 4 ' +
      '-row-mt 1 -crf 18 -b:v 0 -threads 2 -pix_fmt yuv420p'
    ).split(' ')
    this.process = spawn('ffmpeg', [...args, output], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    this.process.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk}`.slice(-4096)
    })
    this.process.stdin.on('error', error => {
      this.failure = error
    })
    this.completion = new Promise(resolve => {
      this.process.once('error', error => {
        this.failure = error
        resolve(error)
      })
      this.process.once('close', code => {
        const error = code === 0 ? null : new Error(`Capture encoder exited ${code}: ${stderr}`)
        if (error) this.failure = error
        resolve(error)
      })
    })
    this.process.stdin.write(header(width, height))
  }

  write(jpeg: Buffer, timeMs: number): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('Capture encoder is stopped'))
    const size = jpegSize(jpeg)
    if (size.width !== this.width || size.height !== this.height) {
      return Promise.reject(
        new Error(
          `Capture frame is ${size.width}x${size.height}; expected ${this.width}x${this.height}. Restore the recording viewport.`,
        ),
      )
    }
    this.last = jpeg
    this.lastTime = Math.max(this.lastTime, Math.round(timeMs))
    const cluster = element(
      '1f43b675',
      Buffer.concat([
        value('e7', this.lastTime),
        element('a3', Buffer.concat([Buffer.from([0x81, 0, 0, 0x80]), jpeg])),
      ]),
    )
    this.pending = this.pending.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (this.failure) {
            reject(this.failure)
            return
          }
          this.process.stdin.write(cluster, error => (error ? reject(error) : resolve()))
        }),
    )
    // Surface failures from stop() too, without an unhandled rejection if a page closes.
    void this.pending.catch(error => {
      this.failure = error
    })
    return this.pending
  }

  async stop(durationMs: number): Promise<void> {
    try {
      if (!this.last) throw new Error('Capture produced no video frames')
      await this.write(this.last, Math.max(this.lastTime, durationMs - 1000 / 30))
      this.stopped = true
      this.process.stdin.end()
      const error = await this.completion
      if (error || this.failure) throw error || this.failure
    } catch (error) {
      this.abort()
      throw error
    }
  }

  abort(): void {
    this.stopped = true
    this.process.stdin.destroy()
    if (this.process.exitCode === null) this.process.kill('SIGKILL')
  }
}
