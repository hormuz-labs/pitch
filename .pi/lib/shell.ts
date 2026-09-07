/**
 * The thin shell — index.html — and the project files it loads.
 *
 * A custom shot type lives in its own file, js/shots/<type>.js (styles in
 * css/shots/<type>.css), and the shell links whatever those folders hold.
 * One file for every type was the expensive shape: the agent rewrote a 38KB
 * js/shots.custom.js three times in one run — a quarter of the run's cost —
 * and then could not edit it because it no longer knew its exact text. The
 * older single files still load when present.
 *
 * `refreshShell` is what lets a new file appear without a scaffold call:
 * motion_check runs it first, so "write js/shots/x.js, then check" is the
 * whole loop.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

export const SHELL_MARK =
  '<!-- studio shell: written by motion_scaffold; motion_check keeps the js/shots and css/shots links current -->'

/** The whole licensed GSAP set; the compiler registers whatever it finds on window. */
export const GSAP_PLUGINS = [
  'gsap.min.js',
  'CustomEase.min.js',
  'CustomWiggle.min.js',
  'CustomBounce.min.js',
  'SplitText.min.js',
  'TextPlugin.min.js',
  'ScrambleTextPlugin.min.js',
  'Physics2DPlugin.min.js',
  'PhysicsPropsPlugin.min.js',
  'MotionPathPlugin.min.js',
  'MorphSVGPlugin.min.js',
  'DrawSVGPlugin.min.js',
  'Flip.min.js',
  'EasePack.min.js',
  'Draggable.min.js',
  'InertiaPlugin.min.js',
  'Observer.min.js',
  'CSSRulePlugin.min.js',
  'EaselPlugin.min.js',
  'PixiPlugin.min.js',
  'ScrollTrigger.min.js',
  'ScrollSmoother.min.js',
  'ScrollToPlugin.min.js',
]

export interface ProjectFiles {
  /** Workspace-relative stylesheets, in load order. */
  styles: string[]
  /** Workspace-relative factory scripts, in load order. */
  scripts: string[]
}

function listed(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith(ext) && !f.startsWith('.'))
    .sort()
}

/** What the workspace holds for the shell to load: per-type files first, the legacy single files after. */
export function projectFiles(ws: string): ProjectFiles {
  const styles = listed(join(ws, 'css', 'shots'), '.css').map(f => `css/shots/${f}`)
  if (existsSync(join(ws, 'css', 'custom.css'))) styles.push('css/custom.css')
  const scripts = listed(join(ws, 'js', 'shots'), '.js').map(f => `js/shots/${f}`)
  if (existsSync(join(ws, 'js', 'shots.custom.js'))) scripts.push('js/shots.custom.js')
  return { styles, scripts }
}

export interface ShellOptions {
  title: string
  rive?: boolean
  files: ProjectFiles
}

/** index.html: the vendor bundle, the engine and the project's files, in the one order that works. */
export function shellHtml({ title, rive = false, files }: ShellOptions): string {
  const safeTitle = String(title).replace(/[<>]/g, '')
  return [
    '<!DOCTYPE html>',
    SHELL_MARK,
    `<html lang="en"><head><meta charset="UTF-8"><title>${safeTitle}</title>`,
    '<link rel="stylesheet" href="../../engine/css/shots.css">',
    ...files.styles.map(f => `<link rel="stylesheet" href="${f}">`),
    '</head>',
    '<body>',
    '  <div id="viewport"><div id="camera"></div></div>',
    ...GSAP_PLUGINS.map(f => `  <script src="../../assets/gsap/${f}"></script>`),
    // three.js ships as an ES module only; a module script runs before
    // DOMContentLoaded, which is when the compiler boots, so window.THREE
    // is there for every factory. Lottie is a classic global. Rive is
    // 3MB and loads on request.
    '  <script type="module">import * as THREE from "../../assets/three/three.module.min.js"; window.THREE = THREE;</script>',
    '  <script src="../../assets/lottie/lottie.min.js"></script>',
    ...(rive ? ['  <script src="../../assets/rive/rive.js"></script>'] : []),
    '  <script src="shots.js"></script>',
    '  <script src="../../engine/js/icons.js"></script>',
    '  <script src="../../engine/js/factories.js"></script>',
    ...files.scripts.map(f => `  <script src="${f}"></script>`),
    '  <script src="../../engine/js/compiler.js"></script>',
    '</body></html>',
    '',
  ].join('\n')
}

/** What an existing shell was written with, so a refresh keeps it. */
export function shellState(html: string): {
  ours: boolean
  title: string
  rive: boolean
  styles: string[]
  scripts: string[]
} {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const styles = [...html.matchAll(/<link rel="stylesheet" href="((?:css\/)[^"]+)">/g)].map(
    m => m[1],
  )
  const scripts = [...html.matchAll(/<script src="((?:js\/)[^"]+)"><\/script>/g)].map(m => m[1])
  return {
    ours: html.includes(SHELL_MARK),
    title,
    rive: /assets\/rive\/rive\.js/.test(html),
    styles,
    scripts,
  }
}

/** Write the shell; the per-type folders are created so the layout is visible. */
export function writeShell(ws: string, opts: { title: string; rive?: boolean }): ProjectFiles {
  mkdirSync(join(ws, 'js', 'shots'), { recursive: true })
  mkdirSync(join(ws, 'css', 'shots'), { recursive: true })
  const files = projectFiles(ws)
  writeFileSync(join(ws, 'index.html'), shellHtml({ title: opts.title, rive: opts.rive, files }))
  return files
}

/**
 * Re-link the project's files into a shell we wrote, when they changed.
 * Returns the lines to tell the agent, or [] when nothing moved. A shell the
 * agent wrote by hand is left alone.
 */
export function refreshShell(ws: string): string[] {
  const path = join(ws, 'index.html')
  if (!existsSync(path)) return []
  const state = shellState(readFileSync(path, 'utf8'))
  if (!state.ours) return []
  const files = projectFiles(ws)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  if (same(state.styles, files.styles) && same(state.scripts, files.scripts)) return []
  writeFileSync(path, shellHtml({ title: state.title || basename(ws), rive: state.rive, files }))
  const added = [...files.styles, ...files.scripts].filter(
    f => ![...state.styles, ...state.scripts].includes(f),
  )
  const gone = [...state.styles, ...state.scripts].filter(
    f => ![...files.styles, ...files.scripts].includes(f),
  )
  const out: string[] = []
  if (added.length) out.push(`index.html now loads ${added.join(', ')}`)
  if (gone.length) out.push(`index.html no longer loads ${gone.join(', ')} (file gone)`)
  return out
}

/** Over this, a rewrite of an existing file is refused: the agent edits, or splits. */
export const REWRITE_LIMIT = 12 * 1024

/** Whether a `write` to `rel` inside `ws` is a rewrite to refuse — the reason, or null. */
export function rewriteBlock(ws: string, rel: string): string | null {
  const abs = resolve(ws, rel)
  if (!existsSync(abs)) return null
  const bytes = statSync(abs).size
  return bytes > REWRITE_LIMIT ? rewriteReason(rel, bytes) : null
}

/** The reason a `write` over an existing file this big is refused. */
export function rewriteReason(rel: string, bytes: number): string {
  const kb = (bytes / 1024).toFixed(0)
  return (
    `${rel} already exists (${kb} KB). Rewriting a file this size from memory is what the edits that could not find their text came from, ` +
    `and it costs a minute of output a time. Read the lines you are changing and \`edit\` them; ` +
    `a shot type that needs a whole new version goes in its own file — js/shots/<type>.js, css/shots/<type>.css — which motion_check links for you. ` +
    `To replace ${rel} wholesale on purpose, delete it first.`
  )
}
