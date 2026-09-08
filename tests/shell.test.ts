/**
 * The thin shell and the per-type files it loads: one custom type per file,
 * linked by motion_check, so a change to one type is never a rewrite of all.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GSAP_PLUGINS,
  projectFiles,
  REWRITE_LIMIT,
  refreshShell,
  rewriteBlock,
  rewriteReason,
  SHELL_MARK,
  shellHtml,
  shellState,
  writeShell,
} from '../.pi/lib/shell'

let ws: string
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'shell-'))
})
afterEach(() => {
  rmSync(ws, { recursive: true, force: true })
})

describe('shellHtml', () => {
  it('loads the vendor set, the engine and the project files in the one order that works', () => {
    const html = shellHtml({
      title: 'Box <b>',
      files: { styles: ['css/shots/a.css'], scripts: ['js/shots/a.js', 'js/shots/b.js'] },
    })
    expect(html).toContain(SHELL_MARK)
    expect(html).toContain('<title>Box b</title>')
    const order = [
      'engine/css/shots.css',
      'css/shots/a.css',
      'gsap.min.js',
      'shots.js',
      'factories.js',
      'js/shots/a.js',
      'js/shots/b.js',
      'compiler.js',
    ]
    const at = order.map(s => html.indexOf(s))
    expect(at.every(i => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).not.toContain('rive.js')
    expect(shellHtml({ title: 't', rive: true, files: { styles: [], scripts: [] } })).toContain(
      'assets/rive/rive.js',
    )
    expect(html).not.toContain('p5.min.js')
    expect(shellHtml({ title: 't', p5: true, files: { styles: [], scripts: [] } })).toContain(
      'assets/p5/p5.min.js',
    )
    expect(GSAP_PLUGINS.length).toBe(23)
  })

  it('reads its own state back', () => {
    const html = shellHtml({
      title: 'Film',
      rive: true,
      files: { styles: ['css/custom.css'], scripts: ['js/shots/x.js', 'js/shots.custom.js'] },
    })
    expect(shellState(html)).toEqual({
      ours: true,
      title: 'Film',
      rive: true,
      p5: false,
      styles: ['css/custom.css'],
      scripts: ['js/shots/x.js', 'js/shots.custom.js'],
    })
    expect(shellState('<html><title>hand</title></html>').ours).toBe(false)
  })
})

describe('projectFiles and refreshShell', () => {
  it('finds per-type files in name order, then the legacy single files', () => {
    mkdirSync(join(ws, 'js', 'shots'), { recursive: true })
    mkdirSync(join(ws, 'css', 'shots'), { recursive: true })
    writeFileSync(join(ws, 'js', 'shots', 'route.js'), '')
    writeFileSync(join(ws, 'js', 'shots', 'hook.js'), '')
    writeFileSync(join(ws, 'js', 'shots', '.tmp.js'), '')
    writeFileSync(join(ws, 'js', 'shots.custom.js'), '')
    writeFileSync(join(ws, 'css', 'shots', 'route.css'), '')
    expect(projectFiles(ws)).toEqual({
      styles: ['css/shots/route.css'],
      scripts: ['js/shots/hook.js', 'js/shots/route.js', 'js/shots.custom.js'],
    })
  })

  it('links a new type file into a shell it wrote, and leaves a hand-written shell alone', () => {
    const files = writeShell(ws, { title: 'Film' })
    expect(files).toEqual({ styles: [], scripts: [] })
    expect(refreshShell(ws)).toEqual([])
    writeFileSync(join(ws, 'js', 'shots', 'hook.js'), '')
    writeFileSync(join(ws, 'css', 'shots', 'hook.css'), '')
    expect(refreshShell(ws)).toEqual(['index.html now loads css/shots/hook.css, js/shots/hook.js'])
    const html = readFileSync(join(ws, 'index.html'), 'utf8')
    expect(html).toContain('<script src="js/shots/hook.js"></script>')
    expect(html).toContain('<title>Film</title>')
    expect(refreshShell(ws)).toEqual([])
    rmSync(join(ws, 'js', 'shots', 'hook.js'))
    expect(refreshShell(ws)).toEqual(['index.html no longer loads js/shots/hook.js (file gone)'])

    writeFileSync(
      join(ws, 'index.html'),
      '<html><head><title>mine</title></head><body></body></html>',
    )
    writeFileSync(join(ws, 'js', 'shots', 'other.js'), '')
    expect(refreshShell(ws)).toEqual([])
    expect(readFileSync(join(ws, 'index.html'), 'utf8')).toContain('<title>mine</title>')
  })
})

describe('rewriteBlock', () => {
  it('refuses only a write over an existing file past the limit', () => {
    writeFileSync(join(ws, 'small.js'), 'x'.repeat(1000))
    writeFileSync(join(ws, 'big.js'), 'x'.repeat(REWRITE_LIMIT + 1))
    expect(rewriteBlock(ws, 'new.js')).toBeNull()
    expect(rewriteBlock(ws, 'small.js')).toBeNull()
    expect(rewriteBlock(ws, 'big.js')).toContain('big.js already exists (12 KB)')
  })

  it('names the file, its size and the two ways out', () => {
    const r = rewriteReason('js/shots.custom.js', 38 * 1024)
    expect(r).toContain('js/shots.custom.js already exists (38 KB)')
    expect(r).toContain('`edit`')
    expect(r).toContain('js/shots/<type>.js')
    expect(REWRITE_LIMIT).toBe(12288)
  })
})
