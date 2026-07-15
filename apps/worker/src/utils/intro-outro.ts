import { Resvg } from '@resvg/resvg-js'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'util'
import { prepareBackgroundFrame } from './background.js'
import { videoEncodeArgs } from './encoder.js'

const execAsync = promisify(exec)

// Bundled Goudy Old Style revival (Sorts Mill Goudy, OFL). Resolved relative to this
// module so it works regardless of cwd. Loaded into Resvg below so the intro brand
// name and the "Powered by" watermark render in this classic serif.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_DIR = path.resolve(__dirname, '../../../../assets/fonts')
const EXPECTED_GOUDY_FONTS = [
  path.join(FONT_DIR, 'SortsMillGoudy-Regular.ttf'),
  path.join(FONT_DIR, 'SortsMillGoudy-Italic.ttf'),
]
const GOUDY_FONT_FILES = EXPECTED_GOUDY_FONTS.filter(f => fs.existsSync(f))
if (GOUDY_FONT_FILES.length !== EXPECTED_GOUDY_FONTS.length) {
  console.warn(
    `Goudy fonts missing in ${FONT_DIR} — intro/outro cards will fall back to a system serif. ` +
      `Expected: ${EXPECTED_GOUDY_FONTS.join(', ')}`,
  )
}
const GOUDY_FAMILY = "'Sorts Mill Goudy', Georgia, 'Times New Roman', serif"

export interface CardConfig {
  productName: string
  productLogoPath?: string
  duration: number
  fps: number
  width: number
  height: number
  outputPath: string
  // Clean domain of the demoed product (e.g. "acme.com"), shown as the outro CTA.
  productUrl?: string
}

async function getDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    )
    return parseFloat(stdout.trim())
  } catch {
    return 0
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const FONT_FAMILY = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"

/**
 * Normalize a logo into a clean PNG so it can always be embedded and measured
 * regardless of the source format. The agent prefers downloading the original
 * asset (sharper than a screenshot), so the file can be an SVG, raster image, or a
 * PNG screenshot.
 *
 * SVG is rendered with Resvg at high resolution (ffmpeg can't decode SVG); every
 * other format goes through ffmpeg, which is already in the runtime image and
 * handles png/jpeg/gif/bmp/webp. Returns the temp PNG path, or null if the file isn't
 * a decodable image — e.g. a broken download or an HTML error page.
 */
async function prepareLogoPng(logoPath: string | undefined, dir: string): Promise<string | null> {
  if (!logoPath || !fs.existsSync(logoPath)) return null
  const out = path.join(dir, `__logo_${Date.now()}.png`)

  // Vector logo (downloaded .svg asset, or saved inline <svg> markup): render it
  // with Resvg at a generous width so it stays crisp on the card. Slice to the
  // <svg>…</svg> span so any surrounding XML prolog or wrapper is ignored.
  try {
    const raw = fs.readFileSync(logoPath, 'utf8')
    const lower = raw.toLowerCase()
    const start = lower.indexOf('<svg')
    const end = lower.lastIndexOf('</svg>')
    if (start !== -1 && end !== -1) {
      const svg = raw.slice(start, end + '</svg>'.length)
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: 600 } }).render().asPng()
      fs.writeFileSync(out, png)
      if (fs.existsSync(out) && fs.statSync(out).size > 0) return out
    }
  } catch {}

  try {
    await execAsync(`ffmpeg -y -v error -i "${logoPath}" -frames:v 1 "${out}"`)
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out
  } catch {}
  try {
    fs.unlinkSync(out)
  } catch {}
  return null
}

async function getImageDimensions(file: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${file}"`,
    )
    const [w, h] = stdout
      .trim()
      .split('x')
      .map(s => parseInt(s.trim(), 10))
    if (w > 0 && h > 0) return { width: w, height: h }
  } catch {}
  return null
}

/**
 * Average luminance (0..1) of a logo's OPAQUE pixels — how we decide which
 * background fits. A dark logo (low luminance) needs a light background; a light
 * logo needs a dark one. Transparent pixels are ignored (weighted by alpha) so an
 * icon's empty space doesn't skew the result. Expects an already-normalized PNG.
 */
async function detectLogoLuminance(logoPath: string, dir: string): Promise<number | null> {
  const tmp = path.join(dir, `__lum_${Date.now()}.rgba`)
  try {
    await execAsync(
      `ffmpeg -y -v error -i "${logoPath}" ` +
        `-vf "scale=80:80:force_original_aspect_ratio=decrease" -f rawvideo -pix_fmt rgba "${tmp}"`,
    )
    const raw = fs.readFileSync(tmp)
    let sumLum = 0
    let sumA = 0
    for (let i = 0; i + 3 < raw.length; i += 4) {
      const a = raw[i + 3]!
      sumLum += (0.299 * raw[i]! + 0.587 * raw[i + 1]! + 0.114 * raw[i + 2]!) * a
      sumA += a
    }
    return sumA > 0 ? sumLum / sumA / 255 : null
  } catch {
    return null
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {}
  }
}

interface CardTheme {
  bg: string // pure white or black
  fg: string // contrasting text/logo-divider color
}

// Plain, high-contrast theme: a DARK logo gets a white card, a LIGHT logo a black
// card. No logo → white. Nothing fancy — just clean contrast.
function pickTheme(logoLuminance: number | null): CardTheme {
  const darkLogo = logoLuminance !== null && logoLuminance < 0.5
  return darkLogo || logoLuminance === null
    ? { bg: '#FFFFFF', fg: '#111111' }
    : { bg: '#000000', fg: '#FFFFFF' }
}

// Minimal intro: [logo] | [name], centered, on a plain contrasting background.
function buildIntroCardSvg(
  productLogoDataUri: string | null,
  productName: string,
  theme: CardTheme,
  width: number,
  height: number,
): string {
  const cx = width / 2
  const cy = height / 2
  let body: string
  if (productLogoDataUri) {
    // logo (right-aligned near the divider) | thin divider | name
    body =
      `<image href="${productLogoDataUri}" x="${cx - 300}" y="${cy - 50}" width="240" height="100" preserveAspectRatio="xMaxYMid meet"/>` +
      `<line x1="${cx}" y1="${cy - 34}" x2="${cx}" y2="${cy + 34}" stroke="${theme.fg}" stroke-width="2" stroke-opacity="0.22"/>` +
      `<text x="${cx + 60}" y="${cy + 18}" font-family="${GOUDY_FAMILY}" font-size="56" font-weight="400" fill="${theme.fg}" text-anchor="start">${escapeXml(productName)}</text>`
  } else {
    body = `<text x="${cx}" y="${cy + 20}" font-family="${GOUDY_FAMILY}" font-size="72" font-weight="400" fill="${theme.fg}" text-anchor="middle">${escapeXml(productName)}</text>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${theme.bg}"/>
  ${body}
</svg>`
}

// Minimal outro: "Thank you for watching" with the product domain in a capsule below.
function buildOutroCardSvg(
  _productName: string,
  domain: string,
  theme: CardTheme,
  width: number,
  height: number,
): string {
  const cx = width / 2
  const cy = height / 2
  let capsule = ''
  if (domain) {
    const capW = Math.max(240, domain.length * 20 + 90)
    const capH = 64
    const capX = cx - capW / 2
    const capY = cy + 16
    capsule =
      `<rect x="${capX}" y="${capY}" width="${capW}" height="${capH}" rx="${capH / 2}" fill="none" stroke="${theme.fg}" stroke-width="2" stroke-opacity="0.3"/>` +
      `<text x="${cx}" y="${capY + 42}" font-family="${FONT_FAMILY}" font-size="30" font-weight="600" fill="${theme.fg}" text-anchor="middle">${escapeXml(domain)}</text>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${theme.bg}"/>
  <text x="${cx}" y="${cy - 24}" font-family="${GOUDY_FAMILY}" font-size="48" font-weight="400" fill="${theme.fg}" text-anchor="middle">Thank you for watching</text>
  ${capsule}
</svg>`
}

// "Powered by trypitch.co" — subtle light-grey watermark, bottom-center, full-frame
// transparent PNG so it can be overlaid on the whole video. A faint dark copy behind
// keeps it legible on light pages.
function buildWatermarkSvg(width: number, height: number): string {
  const cx = width / 2
  const y = height - 34
  const txt = 'Powered by trypitch.co'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${cx}" y="${y + 1.5}" font-family="${GOUDY_FAMILY}" font-size="24" font-weight="400" fill="#000000" fill-opacity="0.22" text-anchor="middle" letter-spacing="0.5">${txt}</text>
  <text x="${cx}" y="${y}" font-family="${GOUDY_FAMILY}" font-size="24" font-weight="400" fill="#C9C9D4" fill-opacity="0.62" text-anchor="middle" letter-spacing="0.5">${txt}</text>
</svg>`
}

// Render a static card (one image) with a simple fade in/out and silent audio.
async function renderCardClip(svg: string, output: string, config: CardConfig): Promise<void> {
  const { duration, fps, width, height } = config
  const dir = path.dirname(output)
  const stamp = Date.now()
  const svgPath = path.join(dir, `__card_${stamp}.svg`)
  const pngPath = path.join(dir, `__card_${stamp}.png`)
  const fadeOut = 0.4
  const outStart = (duration - fadeOut).toFixed(2)
  try {
    fs.writeFileSync(svgPath, svg)
    await svgToPng(svgPath, pngPath, width, height)
    const videoArgs = await videoEncodeArgs({ quality: 20, cpuPreset: 'veryfast' })
    await execAsync(
      `ffmpeg -y -loop 1 -i "${pngPath}" ` +
        `-f lavfi -i "anullsrc=channel_layout=mono:sample_rate=24000" ` +
        `-vf "fade=t=in:st=0:d=0.4,fade=t=out:st=${outStart}:d=${fadeOut}" ` +
        `${videoArgs} -map 0:v -map 1:a -c:a aac -ar 24000 -ac 1 ` +
        `-t ${duration} -r ${fps} "${output}"`,
    )
  } finally {
    try {
      fs.unlinkSync(svgPath)
    } catch {}
    try {
      fs.unlinkSync(pngPath)
    } catch {}
  }
}

// Minimal intro: logo | name on a contrasting (white/black) background, gentle fade.
async function generateIntroCard(output: string, config: CardConfig): Promise<string> {
  const dir = path.dirname(output)
  let logoPng = await prepareLogoPng(config.productLogoPath, dir)
  try {
    // Skip tiny or blank favicon-style assets (e.g. 41x40 white placeholder). A
    // real brand logo must have some size and contrast against the card background.
    let logoUri: string | null = null
    if (logoPng) {
      const dims = await getImageDimensions(logoPng)
      const lum = await detectLogoLuminance(logoPng, dir)
      const usable =
        dims && dims.width >= 80 && dims.height >= 80 && lum !== null && lum > 0.05 && lum < 0.95
      if (usable) {
        logoUri = pngToDataUri(logoPng)
      } else {
        console.log(
          `Intro card: logo rejected (size=${dims?.width}x${dims?.height}, lum=${lum?.toFixed(2)}) — falling back to text-only`,
        )
        logoPng = null
      }
    }
    const lum = logoPng ? await detectLogoLuminance(logoPng, dir) : null
    const theme = pickTheme(lum)
    console.log(
      `Intro card: logo ${logoPng ? `luminance=${lum?.toFixed(2)}` : 'none/unreadable'} -> ${theme.bg === '#FFFFFF' ? 'white' : 'black'} background`,
    )
    await renderCardClip(
      buildIntroCardSvg(logoUri, config.productName, theme, config.width, config.height),
      output,
      config,
    )
    return output
  } finally {
    if (logoPng)
      try {
        fs.unlinkSync(logoPng)
      } catch {}
  }
}

// Minimal outro: "Thank you for watching" + the product/site name in a capsule, gentle fade.
async function generateOutroCard(output: string, config: CardConfig): Promise<string> {
  const dir = path.dirname(output)
  const logoPng = await prepareLogoPng(config.productLogoPath, dir)
  try {
    const lum = logoPng ? await detectLogoLuminance(logoPng, dir) : null
    const theme = pickTheme(lum)
    await renderCardClip(
      buildOutroCardSvg(
        config.productName,
        (config.productUrl || '').trim(),
        theme,
        config.width,
        config.height,
      ),
      output,
      config,
    )
    return output
  } finally {
    if (logoPng)
      try {
        fs.unlinkSync(logoPng)
      } catch {}
  }
}

function pngToDataUri(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  const b64 = buf.toString('base64')
  return `data:image/png;base64,${b64}`
}

async function svgToPng(
  svgPath: string,
  pngPath: string,
  width: number,
  _height: number,
): Promise<void> {
  const svgContent = fs.readFileSync(svgPath, 'utf8')
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: 'width',
      value: width,
    },
    // Load the bundled Goudy font so font-family="Sorts Mill Goudy" resolves; keep
    // system fonts on for the sans-serif text that uses FONT_FAMILY.
    font: {
      fontFiles: GOUDY_FONT_FILES,
      loadSystemFonts: true,
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  fs.writeFileSync(pngPath, pngBuffer)
}

export interface BackgroundOptions {
  asset: { path: string; isVideo: boolean }
  radius: number
  inset: number
}

export interface BrowserChromeSegment {
  png: string
  startSec: number
  endSec: number
}

export async function addIntroOutro(
  contentPath: string,
  outputPath: string,
  config: CardConfig,
  background?: BackgroundOptions,
  browserChrome?: BrowserChromeSegment[],
): Promise<string> {
  const dir = path.dirname(contentPath)
  const stamp = Date.now()
  const crossfadeSec = 0.3

  const introPath = path.join(dir, `__intro_${stamp}.mp4`)
  const outroPath = path.join(dir, `__outro_${stamp}.mp4`)
  const watermarkSvg = path.join(dir, `__wm_${stamp}.svg`)
  const watermarkPng = path.join(dir, `__wm_${stamp}.png`)
  const chromeSegments = browserChrome || []
  const cleanup: string[] = [introPath, outroPath, watermarkSvg, watermarkPng]
  for (const seg of chromeSegments) cleanup.push(seg.png)

  try {
    console.log('Generating intro card...')
    await generateIntroCard(introPath, config)

    console.log('Generating outro card...')
    await generateOutroCard(outroPath, config)

    // "Powered by trypitch.co" watermark, overlaid on the WHOLE video (full-frame
    // transparent PNG) so it sits at a fixed bottom-center spot on every frame.
    fs.writeFileSync(watermarkSvg, buildWatermarkSvg(config.width, config.height))
    await svgToPng(watermarkSvg, watermarkPng, config.width, config.height)

    const contentDur = await getDuration(contentPath)
    const contentFadeOutStart = Math.max(0, contentDur - crossfadeSec)

    // Dynamic input indices: intro=0, content=1, outro=2, watermark=3, then chrome
    // segments (optional), then background/mask/shadow (optional).
    let nextInputIdx = 4
    const chromeStartIdx = chromeSegments.length ? nextInputIdx : null
    nextInputIdx += chromeSegments.length
    const bgIdx = background ? nextInputIdx++ : null
    const maskIdx = background ? nextInputIdx++ : null
    const shadowIdx = background ? nextInputIdx++ : null

    // Fade the content edges, concat intro+content+outro, optionally frame on a
    // background, optionally stamp a dynamic browser header, and stamp the
    // watermark — all in a SINGLE pass.
    let inputs = `-i "${introPath}" -i "${contentPath}" -i "${outroPath}" -loop 1 -i "${watermarkPng}"`
    for (const seg of chromeSegments) {
      inputs += ` -loop 1 -i "${seg.png}"`
    }
    let graph =
      `[1:v]fade=t=in:st=0:d=${crossfadeSec},fade=t=out:st=${contentFadeOutStart}:d=${crossfadeSec}[cv];` +
      `[0:v][0:a][cv][1:a][2:v][2:a]concat=n=3:v=1:a=1[cat][a];`

    if (background) {
      const frame = prepareBackgroundFrame(
        dir,
        config.width,
        config.height,
        background.radius,
        background.inset,
      )
      cleanup.push(frame.maskPng, frame.shadowPng)
      // Bound every looped input to the assembled length so ffmpeg terminates
      // (infinite -loop/-stream_loop inputs would otherwise hang the encode).
      const totalDur = contentDur + 2 * config.duration
      const tArg = `-t ${totalDur.toFixed(3)}`
      inputs += background.asset.isVideo
        ? ` -stream_loop -1 ${tArg} -i "${background.asset.path}"`
        : ` -loop 1 ${tArg} -i "${background.asset.path}"`
      inputs += ` -loop 1 ${tArg} -i "${frame.maskPng}" -loop 1 ${tArg} -i "${frame.shadowPng}"`

      graph +=
        `[${bgIdx}:v]scale=${config.width}:${config.height},setsar=1,fps=${config.fps}[bg];` +
        `[cat]scale=${frame.iw}:${frame.ih},setsar=1,format=rgba,fps=${config.fps}[d];`
      if (chromeStartIdx !== null) {
        let prev = 'd'
        for (let i = 0; i < chromeSegments.length; i++) {
          const idx = chromeStartIdx + i
          const seg = chromeSegments[i]!
          const scaledLabel = `bc_${stamp}_${i}`
          const outLabel = i === chromeSegments.length - 1 ? 'd2' : `bco_${stamp}_${i}`
          graph +=
            `[${idx}:v]scale=${frame.iw}:-1,setsar=1[${scaledLabel}];` +
            `[${prev}][${scaledLabel}]overlay=0:0:shortest=1:enable='between(t\\,${seg.startSec.toFixed(3)}\\,${seg.endSec.toFixed(3)})'[${outLabel}];`
          prev = outLabel
        }
        graph += `[d2][${maskIdx}:v]alphamerge[fg];`
      } else {
        graph += `[d][${maskIdx}:v]alphamerge[fg];`
      }
      graph +=
        `[bg][${shadowIdx}:v]overlay=0:0[bgs];` +
        `[bgs][fg]overlay=${frame.ix}:${frame.iy}:shortest=1[framed];` +
        `[framed][3:v]overlay=0:0:shortest=1[v]`
    } else {
      if (chromeStartIdx !== null) {
        let prev = 'cat'
        for (let i = 0; i < chromeSegments.length; i++) {
          const idx = chromeStartIdx + i
          const seg = chromeSegments[i]!
          const outLabel = i === chromeSegments.length - 1 ? 'catc' : `catc_${stamp}_${i}`
          graph += `[${prev}][${idx}:v]overlay=0:0:shortest=1:enable='between(t\\,${seg.startSec.toFixed(3)}\\,${seg.endSec.toFixed(3)})'[${outLabel}];`
          prev = outLabel
        }
        graph += `[catc][3:v]overlay=0:0:shortest=1[v]`
      } else {
        graph += `[cat][3:v]overlay=0:0:shortest=1[v]`
      }
    }

    const extras: string[] = []
    if (chromeSegments.length) extras.push('dynamic browser header')
    if (background) extras.push('background')
    console.log(
      `Assembling intro + content + outro (+ watermark${extras.length ? ` + ${extras.join(' + ')}` : ''}) in one pass...`,
    )
    const videoArgs = await videoEncodeArgs({ quality: 19, cpuPreset: 'veryfast' })
    await execAsync(
      `ffmpeg -y ${inputs} ` +
        `-filter_complex "${graph}" ` +
        `-map "[v]" -map "[a]" ` +
        `${videoArgs} ` +
        `-c:a aac -ar 24000 -ac 1 ` +
        `"${outputPath}"`,
    )

    const finalDur = await getDuration(outputPath)
    console.log(`Final assembly done. Duration: ${finalDur.toFixed(2)}s`)

    return outputPath
  } finally {
    for (const f of cleanup) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
  }
}
