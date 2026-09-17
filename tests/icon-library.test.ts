import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../.pi/cli/run.ts'
import { importIcons, loadCatalog, searchIcons } from '../.pi/skills/icon-library/scripts/icons.mjs'

const library = path.resolve('assets/icons')
const portable = path.resolve('.pi/skills/icon-library/scripts/icons.mjs')
const dirs: string[] = []
function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pitch-icons-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

describe('offline icon library', () => {
  it('ships every cataloged SVG and license at its recorded checksum', () => {
    const catalog = loadCatalog(library)
    expect(catalog.icons.length).toBeGreaterThan(6000)
    expect(new Set(catalog.icons.map(icon => icon.id)).size).toBe(catalog.icons.length)
    for (const icon of catalog.icons) {
      const bytes = readFileSync(path.join(library, icon.file))
      expect(createHash('sha256').update(bytes).digest('hex'), icon.id).toBe(icon.sha256)
      expect(bytes.toString(), icon.id).toMatch(/<svg\b/)
    }
    for (const [name, source] of Object.entries(catalog.sources) as Array<[string, any]>) {
      expect(source.revision).toMatch(/^[a-f0-9]{40}$/)
      for (const file of source.licenseFiles)
        expect(
          readFileSync(path.join(library, 'licenses', name, file), 'utf8').length,
        ).toBeGreaterThan(100)
    }
  })

  it('finds recognizable brands and scopes general icons without dumping source', () => {
    expect(searchIcons(library, 'slack messaging')[0].id).toBe('svgl/slack')
    const matches = searchIcons(library, 'check', { collection: 'lucide', limit: 3 })
    expect(matches).toHaveLength(3)
    expect(matches[0].id).toBe('lucide/check')
    expect(matches.every(match => match.id.startsWith('lucide/'))).toBe(true)
    expect(JSON.stringify(matches)).not.toContain('<svg')
  })

  it('imports only selected files with licenses and reusable attribution', async () => {
    const dir = workspace()
    const result = await run('icons import --ids svgl/slack,lucide/check', { cwd: dir })
    expect(result.ok).toBe(true)
    const imported = JSON.parse(result.text)
    expect(imported.files.map(file => file.id)).toEqual(['svgl/slack', 'lucide/check'])
    const ledgerPath = path.join(dir, imported.attributions)
    const first = JSON.parse(readFileSync(ledgerPath, 'utf8'))
    expect(first.icons).toHaveLength(2)
    for (const icon of first.icons) {
      expect(readFileSync(path.join(dir, icon.file)).length).toBeGreaterThan(100)
      expect(icon.revision).toMatch(/^[a-f0-9]{40}$/)
      for (const license of icon.licenseFiles)
        expect(readFileSync(path.join(dir, license), 'utf8').length).toBeGreaterThan(100)
    }
    importIcons(library, dir, ['svgl/slack'])
    expect(JSON.parse(readFileSync(ledgerPath, 'utf8')).icons).toHaveLength(2)
  })

  it('renders the actual imported brand and interface SVGs', () => {
    const dir = workspace()
    const imported = importIcons(library, dir, [
      'svgl/slack',
      'lucide/check',
      'simple-icons/github',
    ])
    for (const icon of imported.files) {
      const image = new Resvg(readFileSync(path.join(dir, icon.file)), {
        fitTo: { mode: 'width', value: 128 },
      }).render()
      expect(image.width).toBe(128)
      expect(image.asPng().length).toBeGreaterThan(100)
    }
  })

  it('does not overwrite user-modified icons', () => {
    const dir = workspace()
    const imported = importIcons(library, dir, ['lucide/check'])
    const file = path.join(dir, imported.files[0].file)
    writeFileSync(file, '<svg>user version</svg>')
    expect(() => importIcons(library, dir, ['lucide/check'])).toThrow('Existing file differs')
    expect(readFileSync(file, 'utf8')).toBe('<svg>user version</svg>')
  })

  it('rejects path escapes and unknown IDs', () => {
    const dir = workspace(),
      outside = workspace()
    mkdirSync(path.join(dir, 'assets'))
    symlinkSync(outside, path.join(dir, 'assets/icons'))
    expect(() => importIcons(library, dir, ['lucide/check'])).toThrow('escapes')
    expect(() => importIcons(library, dir, ['lucide/check'], '../escape')).toThrow('escapes')
    expect(() => importIcons(library, outside, ['../../private'])).toThrow('Unknown icon ID')
  })

  it('works outside Pitch with the portable Node script', () => {
    const dir = workspace()
    const output = execFileSync(
      'node',
      [portable, 'import', 'svgl/slack', '--library', library, '--workspace', dir],
      { encoding: 'utf8' },
    )
    expect(JSON.parse(output).files[0].id).toBe('svgl/slack')
  })
})
