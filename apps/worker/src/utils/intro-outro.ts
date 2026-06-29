import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { videoEncodeArgs } from './encoder.js'

const execAsync = promisify(exec)

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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const FONT_FAMILY = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"

/**
 * Normalize a logo of ANY image format (png, jpeg, webp, gif, avif, svg, …) into a
 * clean PNG via sharp, so it can always be embedded and measured regardless of the
 * source type. (ffmpeg's native webp decoder is unreliable, so we use sharp.)
 * Returns the temp PNG path, or null if the file isn't a decodable image — e.g. a
 * broken download or an HTML error page saved as `.png`.
 */
async function prepareLogoPng(logoPath: string | undefined, dir: string): Promise<string | null> {
  if (!logoPath || !fs.existsSync(logoPath)) return null
  const out = path.join(dir, `__logo_${Date.now()}.png`)
  try {
    await sharp(logoPath).png().toFile(out)
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out
  } catch {}
  try {
    fs.unlinkSync(out)
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
      `<text x="${cx + 60}" y="${cy + 18}" font-family="${FONT_FAMILY}" font-size="54" font-weight="600" fill="${theme.fg}" text-anchor="start">${escapeXml(productName)}</text>`
  } else {
    body = `<text x="${cx}" y="${cy + 20}" font-family="${FONT_FAMILY}" font-size="68" font-weight="700" fill="${theme.fg}" text-anchor="middle">${escapeXml(productName)}</text>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${theme.bg}"/>
  ${body}
</svg>`
}

// Minimal outro: a CTA line with the product domain in a capsule below.
function buildOutroCardSvg(
  productName: string,
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
  <text x="${cx}" y="${cy - 24}" font-family="${FONT_FAMILY}" font-size="44" font-weight="500" fill="${theme.fg}" text-anchor="middle">Start with ${escapeXml(productName)}</text>
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
  <text x="${cx}" y="${y + 1.5}" font-family="${FONT_FAMILY}" font-size="22" font-weight="500" fill="#000000" fill-opacity="0.22" text-anchor="middle" letter-spacing="0.5">${txt}</text>
  <text x="${cx}" y="${y}" font-family="${FONT_FAMILY}" font-size="22" font-weight="500" fill="#C9C9D4" fill-opacity="0.62" text-anchor="middle" letter-spacing="0.5">${txt}</text>
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
    await execAsync(
      `ffmpeg -y -loop 1 -i "${pngPath}" ` +
        `-f lavfi -i "anullsrc=channel_layout=mono:sample_rate=24000" ` +
        `-vf "fade=t=in:st=0:d=0.4,fade=t=out:st=${outStart}:d=${fadeOut}" ` +
        `-c:v libx264 -pix_fmt yuv420p -map 0:v -map 1:a -c:a aac -ar 24000 -ac 1 ` +
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
  const logoPng = await prepareLogoPng(config.productLogoPath, dir)
  try {
    const logoUri = logoPng ? pngToDataUri(logoPng) : null
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

// Minimal outro: "Start with {Product}" + the domain in a capsule, gentle fade.
async function generateOutroCard(output: string, config: CardConfig): Promise<string> {
  const dir = path.dirname(output)
  const logoPng = await prepareLogoPng(config.productLogoPath, dir)
  try {
    const lum = logoPng ? await detectLogoLuminance(logoPng, dir) : null
    const theme = pickTheme(lum)
    await renderCardClip(
      buildOutroCardSvg(config.productName, (config.productUrl || '').trim(), theme, config.width, config.height),
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

async function svgToPng(svgPath: string, pngPath: string, width: number, height: number): Promise<void> {
  const svgContent = fs.readFileSync(svgPath, 'utf8')
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  fs.writeFileSync(pngPath, pngBuffer)
}

export async function addIntroOutro(
  contentPath: string,
  outputPath: string,
  config: CardConfig,
): Promise<string> {
  const dir = path.dirname(contentPath)
  const stamp = Date.now()
  const crossfadeSec = 0.3

  const introPath = path.join(dir, `__intro_${stamp}.mp4`)
  const outroPath = path.join(dir, `__outro_${stamp}.mp4`)
  const watermarkSvg = path.join(dir, `__wm_${stamp}.svg`)
  const watermarkPng = path.join(dir, `__wm_${stamp}.png`)

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

    // Fade the content edges, concat intro+content+outro, and stamp the watermark —
    // all in a SINGLE pass.
    console.log('Fading + concatenating intro + content + outro (+ watermark)...')
    const videoArgs = await videoEncodeArgs({ quality: 19, cpuPreset: 'veryfast' })
    await execAsync(
      `ffmpeg -y -i "${introPath}" -i "${contentPath}" -i "${outroPath}" -loop 1 -i "${watermarkPng}" ` +
        `-filter_complex "[1:v]fade=t=in:st=0:d=${crossfadeSec},fade=t=out:st=${contentFadeOutStart}:d=${crossfadeSec}[cv];` +
        `[0:v][0:a][cv][1:a][2:v][2:a]concat=n=3:v=1:a=1[cat][a];` +
        `[cat][3:v]overlay=0:0:shortest=1[v]" ` +
        `-map "[v]" -map "[a]" ` +
        `${videoArgs} ` +
        `-c:a aac -ar 24000 -ac 1 ` +
        `"${outputPath}"`,
    )

    const finalDur = await getDuration(outputPath)
    console.log(`Intro/outro + watermark added. Final duration: ${finalDur.toFixed(2)}s`)

    return outputPath
  } catch (err) {
    throw err
  } finally {
    for (const f of [introPath, outroPath, watermarkSvg, watermarkPng]) {
      try { fs.unlinkSync(f) } catch {}
    }
  }
}