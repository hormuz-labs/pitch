import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface CardConfig {
  productName: string
  productLogoPath?: string
  pitchLogoPath: string
  cardSoundPath?: string
  duration: number
  fps: number
  width: number
  height: number
  outputPath: string
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

function buildCardSvg(
  productName: string,
  pitchLogoDataUri: string,
  productLogoDataUri: string | null,
  width: number,
  height: number,
  type: 'intro' | 'outro',
): string {
  const accentColor = '#6C63FF'
  const bgColor = '#0B0B1A'
  const subtleGlow = `<circle cx="${width / 2}" cy="${height / 2}" r="300" fill="${accentColor}" opacity="0.06"/>`
  const productCenterX = width / 2 - 340
  const pitchCenterX = width / 2 + 200
  const crossX = width / 2

  let productContent: string
  if (productLogoDataUri) {
    productContent = `<image href="${productLogoDataUri}" x="${productCenterX}" y="${height / 2 - 60}" width="320" height="120" preserveAspectRatio="xMidYMid meet"/>`
  } else {
    productContent = `<text x="${productCenterX + 160}" y="${height / 2 + 18}" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="52" font-weight="700" fill="white" text-anchor="middle">${escapeXml(productName)}</text>`
  }

  const tagline = type === 'outro'
    ? `<text x="${width / 2}" y="${height * 0.78}" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="22" fill="#888888" text-anchor="middle">trypitch.co</text>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  ${subtleGlow}
  ${productContent}
  <text x="${crossX}" y="${height / 2 + 22}" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="72" font-weight="300" fill="${accentColor}" text-anchor="middle">×</text>
  <image href="${pitchLogoDataUri}" x="${pitchCenterX}" y="${height / 2 - 55}" width="280" height="110" preserveAspectRatio="xMidYMid meet"/>
  ${tagline}
</svg>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function pngToDataUri(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  const b64 = buf.toString('base64')
  return `data:image/png;base64,${b64}`
}

async function svgToPng(svgPath: string, pngPath: string, width: number, height: number): Promise<void> {
  await execAsync(`rsvg-convert -w ${width} -h ${height} -o "${pngPath}" "${svgPath}"`)
}

async function generateCard(
  output: string,
  config: CardConfig,
  type: 'intro' | 'outro',
): Promise<string> {
  const { productName, productLogoPath, pitchLogoPath, duration, fps, width, height } = config
  const dir = path.dirname(output)

  const pitchLogoDataUri = pngToDataUri(pitchLogoPath)
  const productLogoDataUri = productLogoPath && fs.existsSync(productLogoPath)
    ? pngToDataUri(productLogoPath)
    : null

  const svg = buildCardSvg(productName, pitchLogoDataUri, productLogoDataUri, width, height, type)
  const svgPath = path.join(dir, `__card_${type}_${Date.now()}.svg`)
  const pngPath = path.join(dir, `__card_${type}_${Date.now()}.png`)

  try {
    fs.writeFileSync(svgPath, svg)
    await svgToPng(svgPath, pngPath, width, height)

    const fadeInSec = 0.4
    const fadeOutSec = type === 'outro' ? 0.6 : 0.2

    const hasDing = config.cardSoundPath && fs.existsSync(config.cardSoundPath)
    const dingInput = hasDing ? ` -i "${config.cardSoundPath}"` : ''
    const dingMix = hasDing
      ? `;[1:a][2:a]amix=inputs=2:duration=first:normalize=0[card_a]`
      : ''
    const audioMap = hasDing ? `-map "[card_a]"` : `-map 1:a`

    await execAsync(
      `ffmpeg -y -loop 1 -i "${pngPath}" ` +
        `-f lavfi -i "anullsrc=channel_layout=mono:sample_rate=24000"${dingInput} ` +
        `-vf "fade=t=in:st=0:d=${fadeInSec},fade=t=out:st=${duration - fadeOutSec}:d=${fadeOutSec}" ` +
        `-c:v libx264 -pix_fmt yuv420p ${audioMap} -c:a aac -ar 24000 -ac 1 -t ${duration} -r ${fps} -shortest ` +
        `"${output}"`,
    )

    return output
  } finally {
    try { fs.unlinkSync(svgPath) } catch {}
    try { fs.unlinkSync(pngPath) } catch {}
  }
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
  const contentFadedPath = path.join(dir, `__content_faded_${stamp}.mp4`)

  try {
    console.log('Generating intro card...')
    await generateCard(introPath, config, 'intro')

    console.log('Generating outro card...')
    await generateCard(outroPath, config, 'outro')

    const contentDur = await getDuration(contentPath)
    const contentFadeInStart = 0
    const contentFadeOutStart = Math.max(0, contentDur - crossfadeSec)

    console.log('Fading content edges...')
    await execAsync(
      `ffmpeg -y -i "${contentPath}" ` +
        `-vf "fade=t=in:st=${contentFadeInStart}:d=${crossfadeSec},fade=t=out:st=${contentFadeOutStart}:d=${crossfadeSec}" ` +
        `-c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p ` +
        `-c:a aac -ar 24000 -ac 1 ` +
        `"${contentFadedPath}"`,
    )

    const listFile = path.join(dir, `__concat_${stamp}.txt`)
    fs.writeFileSync(
      listFile,
      [
        `file '${introPath}'`,
        `file '${contentFadedPath}'`,
        `file '${outroPath}'`,
      ].join('\n'),
    )

    console.log('Concatenating intro + content + outro...')
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" ` +
        `-c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p ` +
        `-c:a aac -ar 24000 -ac 1 ` +
        `"${outputPath}"`,
    )

    try { fs.unlinkSync(listFile) } catch {}

    const finalDur = await getDuration(outputPath)
    console.log(`Intro/outro added. Final duration: ${finalDur.toFixed(2)}s`)

    return outputPath
  } catch (err) {
    throw err
  } finally {
    for (const f of [introPath, outroPath, contentFadedPath]) {
      try { fs.unlinkSync(f) } catch {}
    }
  }
}