/**
 * The first shots.js.
 *
 * pitch motion scaffold used to write index.html and say "Next: write shots.js",
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
  title?: string | null
  copy?: { h1?: string[]; h2?: string[] }
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

/** A word a truncated heading must not end on — "The first AI founder Backed" reads as a typo. */
const DANGLING = /^(a|an|and|as|at|but|by|for|from|in|of|on|or|the|to|with|that|your|our)$/i

/** The first few words of a heading, so an opener is a line and not a paragraph. */
function firstWords(text: string | null | undefined, max: number): string[] {
  const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, max)
  while (words.length > 1 && DANGLING.test(words[words.length - 1])) words.pop()
  return words
}

/**
 * The opening shot, from the product's own words.
 *
 * An empty `shots: []` means the preview shows a blank stage until the agent
 * has finished thinking — measured at nine minutes on a real run, six of them
 * after the scaffold. The film's actual hook is the agent's to write, but a
 * first frame is not: the h1 the site already leads with, one word at a time,
 * is on brand by construction and is on screen the second this file lands.
 * It is labelled a placeholder because that is what it is — the agent
 * replaces it, and the check and the review judge it like any other shot.
 */
function openingShot(tokens: ReconTokens | null): string[] {
  const head = firstWords(tokens?.copy?.h1?.[0] ?? tokens?.title, 3)
  if (!head.length) {
    return ['    // { id: "hook", type: "line", dur: 1.4, cue: "first words", steps: [...] },']
  }
  // The second line arrives whole, not split down the middle: half of a
  // heading is a phrase nobody wrote.
  const rest = firstWords(tokens?.copy?.h2?.[0], 4)
  const steps = [`        { at: 0, add: [{ text: ${quote(head.join(' '))} }] },`]
  if (rest.length)
    steps.push(`        { at: 1.0, add: [{ text: ${quote(rest.join(' '))}, tone: "accent" }] },`)
  return [
    "    // PLACEHOLDER OPENER — the site's own words, so the preview is never",
    '    // blank. Replace it with your hook; keep saving after every shot.',
    '    {',
    '      id: "open",',
    '      type: "line",',
    `      dur: ${rest.length ? '2.2' : '1.4'},`,
    '      size: 150,',
    '      align: "center",',
    '      steps: [',
    ...steps,
    '      ],',
    '    },',
  ]
}

/** shots.js with the brand filled in and the shot list open. */
export function starterShots(tokens: ReconTokens | null, format?: string): string {
  const c = tokens?.colors ?? {}
  const measured = Boolean(c.bg && c.ink && c.accent)
  const bg = c.bg ?? '#FFFFFF'
  const ink = c.ink ?? '#111111'
  const accent = c.accent ?? '#2563EB'
  const note = measured
    ? 'measured by pitch motion recon (recon/brand-tokens.md has the evidence)'
    : 'PLACEHOLDERS — run pitch motion recon and put the measured values here'
  const fonts = fontEntries(tokens?.fonts)
  const lines = [
    '// shots.js — the film, as one data literal the engine compiles.',
    '// Fields: pitch motion schema --types <type> and pitch motion schema --section <name>.',
    'window.SHOTS = {',
    ...(format && format !== '16:9'
      ? [
          `  format: ${quote(format)},                  // the delivery frame: pitch motion schema --section format`,
        ]
      : []),
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
    '  // audio: { vo: "audio/vo.wav" },    // after pitch motion tts + motion_align',
    '  ambient: { kind: "none" },          // the stage: pitch motion schema --section "density layer"',
    '  motion: { exit: "none", drift: true, cutDur: 0.5 }, // every shot keeps moving; a shot with its own camera sets drift: false',
    '  shots: [',
    ...openingShot(tokens),
    '  ],',
    '};',
    '',
  ]
  return lines.join('\n')
}
