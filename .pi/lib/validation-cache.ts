import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

/** Cache successful browser checks by content, not workspace mtimes. Output
 * fingerprints matter too: a scoped review overwrites the full review's sheets.
 */
export function fingerprint(paths: string[]): string {
  const hash = createHash('sha256')
  const directories = new Set<string>()
  const chunk = Buffer.alloc(64 * 1024)
  const visit = (file: string) => {
    hash.update(JSON.stringify(file))
    if (!existsSync(file)) {
      hash.update('missing')
      return
    }
    const stat = statSync(file)
    if (stat.isDirectory()) {
      const real = realpathSync(file)
      if (directories.has(real)) return
      directories.add(real)
      for (const name of readdirSync(file).sort()) visit(join(file, name))
    } else {
      hash.update(`file:${stat.size}:`)
      const fd = openSync(file, 'r')
      try {
        let n = readSync(fd, chunk, 0, chunk.length, null)
        while (n > 0) {
          hash.update(chunk.subarray(0, n))
          n = readSync(fd, chunk, 0, chunk.length, null)
        }
      } finally {
        closeSync(fd)
      }
    }
  }
  for (const file of paths) visit(file)
  return hash.digest('hex')
}

export async function cachedValidation(opts: {
  workspace: string
  key: string
  inputs: string[]
  outputs: string[]
  run: () => Promise<string>
}): Promise<string> {
  const file = join(
    opts.workspace,
    '.motion-validation',
    `${createHash('sha256').update(opts.key).digest('hex')}.json`,
  )
  const before = fingerprint(opts.inputs)
  try {
    const cached = JSON.parse(readFileSync(file, 'utf8'))
    if (
      cached.inputs === before &&
      cached.outputs === fingerprint(opts.outputs) &&
      Date.now() - cached.at < 10 * 60 * 1000
    ) {
      return `Reused successful validation: inputs and output frames are unchanged. No browser capture needed.\n${cached.report}`
    }
  } catch {
    /* First run or invalidated cache. */
  }
  const report = await opts.run()
  // Failed results and edits during capture must never become a passing cache.
  if (!report.includes('❌') && before === fingerprint(opts.inputs)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify({
        inputs: before,
        outputs: fingerprint(opts.outputs),
        at: Date.now(),
        report,
      }),
    )
  }
  return report
}
