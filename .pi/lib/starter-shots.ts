/**
 * The first shots.js.
 *
 * motion_scaffold used to write index.html and say "Next: write shots.js",
 * and the agent's next nine turns went on the file's shape: it read
 * index.html, searched outside the workspace for an example, pulled a schema
 * section and wrote the file three times before the check accepted
 * `window.SHOTS`. The shape is not a creative decision, so the scaffold writes
 * it — with the brand recon measured, when recon ran — and the first turn
 * after scaffolding is a shot.
 */

export interface ReconFont {
  family: string
  weight?: string
  style?: string
  file: string
}

/** The parts of recon/brand-tokens.json the starter reads. */
export interface ReconTokens {
  colors?: { bg?: string | null; ink?: string | null; accent?: string | null }
  type?: { headFamily?: string | null; bodyFamily?: string | null }
  fonts?: ReconFont[]
}

const GENERIC =
  /^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive|fantasy|-apple-system|blinkmacsystemfont|inherit)$/i

function quote(s: string): string {
  return JSON.stringify(s)
}

/** A CSS stack for the brand's face: the face first, then a system fallback. */
export function fontStack(family: string | null | undefined): string {
  const face = (family ?? '').replace(/^["']|["']$/g, '').trim()
  if (!face || GENERIC.test(face))
    return '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif'
  return `"${face}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
}

/** The @font-face entries the engine self-hosts, one per family/weight/style recon saved. */
export function fontEntries(fonts: ReconFont[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const f of fonts ?? []) {
    if (!f?.family || !f.file) continue
    const key = `${f.family}|${f.weight ?? ''}|${f.style ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    const parts = [`family: ${quote(f.family)}`, `src: ${quote(f.file)}`]
    if (f.weight) parts.push(`weight: ${quote(String(f.weight))}`)
    if (f.style && f.style !== 'normal') parts.push(`style: ${quote(f.style)}`)
    out.push(`      { ${parts.join(', ')} },`)
  }
  return out
}

/** shots.js with the brand filled in and the shot list open. */
export function starterShots(tokens: ReconTokens | null): string {
  const c = tokens?.colors ?? {}
  const measured = Boolean(c.bg && c.ink && c.accent)
  const bg = c.bg ?? '#FFFFFF'
  const ink = c.ink ?? '#111111'
  const accent = c.accent ?? '#2563EB'
  const note = measured
    ? 'measured by motion_recon (recon/brand-tokens.md has the evidence)'
    : 'PLACEHOLDERS — run motion_recon and put the measured values here'
  const fonts = fontEntries(tokens?.fonts)
  const lines = [
    '// shots.js — the film, as one data literal the engine compiles.',
    '// Fields: motion_schema({ types: [...] }) and motion_schema({ section: "..." }).',
    'window.SHOTS = {',
    `  brand: {                          // ${note}`,
    `    bg: ${quote(bg)},`,
    `    ink: ${quote(ink)},`,
    `    accent: ${quote(accent)},`,
    `    font: ${quote(fontStack(tokens?.type?.headFamily))},`,
    ...(fonts.length
      ? [
          '    fonts: [                          // self-hosted by recon into assets/fonts/',
          ...fonts,
          '    ],',
        ]
      : []),
    '  },',
    '  // audio: { vo: "audio/vo.wav" },    // after motion_tts + motion_align',
    '  ambient: { kind: "none" },          // the stage: motion_schema({ section: "density layer" })',
    '  motion: { exit: "up", cutDur: 0.5 },',
    '  shots: [',
    '    // { id: "hook", type: "...", dur: 1.4, cue: "first words", beats: [...] },',
    '  ],',
    '};',
    '',
  ]
  return lines.join('\n')
}
