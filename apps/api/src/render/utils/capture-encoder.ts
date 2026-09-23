import { spawn } from 'node:child_process'
import { close, closeSync, existsSync, fsync, openSync, write, writeSync } from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { promisify } from 'node:util'

const writeAsync = promisify(write)
const closeAsync = promisify(close)
const syncAsync = promisify(fsync)
const durationElement = element('4489', Buffer.alloc(8))

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
      Buffer.concat([
        value('2ad7b1', 1_000_000),
        durationElement,
        text('4d80', 'Pitch'),
        text('5741', 'Pitch'),
      ]),
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

/** Durable frame journal plus a lightweight H.264 master. Encoding is best-effort:
 * if it falls behind or cannot finish, the complete MJPEG journal becomes the
 * master. Both are Matroska; source assembly decodes either in its existing pass. */
export class CaptureEncoder {
  private process
  private completion: Promise<Error | null>
  private last: Buffer | null = null
  private lastTime = 0
  private encodePending = Promise.resolve()
  private journalPending = Promise.resolve()
  private journalFd: number | null
  private journalPath: string
  private durationOffset: number
  private queuedBytes = 0
  private encoderDisabled = false
  private stopped = false
  private failure: Error | null = null
  private stopPromise: Promise<void> | null = null
  fallbackReason: string | null = null

  constructor(
    private output: string,
    private width = 1920,
    private height = 1080,
    private limits = { finishTimeoutMs: 10_000, maxQueuedBytes: 32 * 1024 * 1024 },
  ) {
    if (existsSync(output)) throw new Error(`Capture output already exists: ${output}`)
    const metadata = header(width, height)
    this.journalPath = `${output}.capture.mkv`
    this.journalFd = openSync(this.journalPath, 'wx')
    this.durationOffset = metadata.indexOf(durationElement) + durationElement.length - 8
    let written = 0
    try {
      while (written < metadata.length) {
        const count = writeSync(this.journalFd, metadata, written)
        if (!count) throw new Error('Capture header write made no progress')
        written += count
      }
    } catch (error) {
      closeSync(this.journalFd)
      this.journalFd = null
      throw error
    }
    const args = (
      '-hide_banner -loglevel error -nostdin -n ' +
      '-f matroska -fpsprobesize 0 -probesize 32 -analyzeduration 0 -i pipe:0 -an ' +
      '-vf fps=30:round=near -fps_mode cfr -c:v libx264 -preset ultrafast -tune zerolatency ' +
      '-crf 16 -threads 2 -pix_fmt yuv420p -f matroska'
    ).split(' ')
    this.process = spawn('ffmpeg', [...args, output], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    this.process.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk}`.slice(-4096)
    })
    this.process.stdin.on('error', error => {
      this.disableEncoder(error)
    })
    this.completion = new Promise(resolve => {
      this.process.once('error', error => {
        this.disableEncoder(error)
        resolve(error)
      })
      this.process.once('close', code => {
        const error = code === 0 ? null : new Error(`Capture encoder exited ${code}: ${stderr}`)
        if (error) this.disableEncoder(error)
        resolve(error)
      })
    })
    this.process.stdin.write(metadata)
  }

  write(jpeg: Buffer, timeMs: number): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('Capture encoder is stopped'))
    if (this.failure) return Promise.reject(this.failure)
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
    this.journalPending = this.journalPending.then(async () => {
      let offset = 0
      while (offset < cluster.length) {
        const result = await writeAsync(
          this.journalFd!,
          cluster,
          offset,
          cluster.length - offset,
          null,
        )
        if (!result.bytesWritten) throw new Error('Capture journal write made no progress')
        offset += result.bytesWritten
      }
    })
    void this.journalPending.catch(error => {
      this.failure = error
    })
    if (!this.encoderDisabled) {
      if (this.queuedBytes + cluster.length > this.limits.maxQueuedBytes) {
        this.disableEncoder(new Error('Live encoder fell behind; preserving the frame journal'))
      } else {
        this.queuedBytes += cluster.length
        this.encodePending = this.encodePending
          .then(async () => {
            if (this.encoderDisabled) return
            await new Promise<void>((resolve, reject) => {
              this.process.stdin.write(cluster, error => (error ? reject(error) : resolve()))
            })
          })
          .catch(error => this.disableEncoder(error))
          .finally(() => {
            this.queuedBytes -= cluster.length
          })
      }
    }
    // Browser input is backpressured by disk durability, never by compression.
    return this.journalPending
  }

  private disableEncoder(error: Error): void {
    if (this.encoderDisabled) return
    this.encoderDisabled = true
    this.fallbackReason = error.message
    this.process.stdin.destroy()
    if (this.process.exitCode === null) this.process.kill('SIGKILL')
  }

  private async finishJournal(durationMs: number): Promise<void> {
    try {
      await this.journalPending
    } catch (error) {
      if (this.journalFd !== null) {
        const fd = this.journalFd
        this.journalFd = null
        await closeAsync(fd).catch(() => {})
      }
      throw error
    }
    if (this.journalFd === null) return
    const fd = this.journalFd
    this.journalFd = null
    try {
      const duration = Buffer.alloc(8)
      duration.writeDoubleBE(durationMs) // Matroska duration uses the 1ms timecode scale.
      let offset = 0
      while (offset < duration.length) {
        const result = await writeAsync(
          fd,
          duration,
          offset,
          duration.length - offset,
          this.durationOffset + offset,
        )
        if (!result.bytesWritten) throw new Error('Capture duration write made no progress')
        offset += result.bytesWritten
      }
      await syncAsync(fd)
    } finally {
      await closeAsync(fd)
    }
  }

  stop(durationMs: number): Promise<void> {
    this.stopPromise ??= this.finish(durationMs)
    return this.stopPromise
  }

  private async finish(durationMs: number): Promise<void> {
    try {
      if (!this.last) throw new Error('Capture produced no video frames')
      await this.write(this.last, Math.max(this.lastTime, durationMs - 1000 / 30))
      this.stopped = true
      await this.finishJournal(durationMs)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          (async () => {
            await this.encodePending
            if (this.encoderDisabled) throw new Error(this.fallbackReason!)
            this.process.stdin.end()
            const error = await this.completion
            if (error) throw error
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Encoder finalization stalled; using complete frame journal')),
              this.limits.finishTimeoutMs,
            )
          }),
        ])
        await unlink(this.journalPath).catch(error =>
          console.warn('[Capture] Keeping frame journal:', error.message),
        )
      } catch (error) {
        this.disableEncoder(error instanceof Error ? error : new Error(String(error)))
        await this.completion
        await rename(this.journalPath, this.output)
        console.warn(
          `[Capture] ${this.fallbackReason}; source assembly will encode the durable master`,
        )
      } finally {
        if (timer) clearTimeout(timer)
      }
    } catch (error) {
      this.stopped = true
      this.disableEncoder(error instanceof Error ? error : new Error(String(error)))
      await this.finishJournal(this.lastTime + 1000 / 30).catch(() => {})
      throw error
    }
  }

  abort(): void {
    if (this.stopped) return
    this.stopped = true
    this.disableEncoder(new Error('Capture interrupted'))
    void this.finishJournal(this.lastTime + 1000 / 30).catch(() => {})
  }
}
