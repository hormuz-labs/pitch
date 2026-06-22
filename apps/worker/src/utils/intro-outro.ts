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
  const fontFamily = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
  const cx = width / 2

  // Layout: product logo (if available) centered above product name,
  // "powered by" label, TryPitch logo below, trypitch.co at bottom for outro.
  const productLogoH = 80
  const productNameY = productLogoDataUri ? height * 0.38 : height * 0.42
  const poweredByY = productNameY + 60
  const pitchLogoY = poweredByY + 30
  const taglineY = height * 0.82

  let productBlock = ''
  if (productLogoDataUri) {
    productBlock =
      `<image href="${productLogoDataUri}" x="${cx - 160}" y="${productNameY - 80}" width="320" height="${productLogoH}" preserveAspectRatio="xMidYMid meet"/>` +
      `<text x="${cx}" y="${productNameY + 20}" font-family="${fontFamily}" font-size="40" font-weight="600" fill="white" text-anchor="middle" opacity="0.9">${escapeXml(productName)}</text>`
  } else {
    productBlock =
      `<text x="${cx}" y="${productNameY + 10}" font-family="${fontFamily}" font-size="56" font-weight="700" fill="white" text-anchor="middle">${escapeXml(productName)}</text>`
  }

  const poweredBy =
    `<text x="${cx}" y="${poweredByY}" font-family="${fontFamily}" font-size="18" font-weight="400" fill="#666666" text-anchor="middle" letter-spacing="2">POWERED BY</text>`

  const pitchLogo =
    `<image href="${pitchLogoDataUri}" x="${cx - 140}" y="${pitchLogoY}" width="280" height="90" preserveAspectRatio="xMidYMid meet"/>`

  const tagline = type === 'outro'
    ? `<text x="${cx}" y="${taglineY}" font-family="${fontFamily}" font-size="20" fill="#555555" text-anchor="middle">trypitch.co</text>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <circle cx="${cx}" cy="${height / 2}" r="280" fill="${accentColor}" opacity="0.04"/>
  ${productBlock}
  ${poweredBy}
  ${pitchLogo}
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
    let ffmpegCmd: string

    if (hasDing) {
      ffmpegCmd =
        `ffmpeg -y -loop 1 -i "${pngPath}" ` +
        `-f lavfi -i "anullsrc=channel_layout=mono:sample_rate=24000"${dingInput} ` +
        `-filter_complex "[1:a][2:a]amix=inputs=2:duration=first:normalize=0[card_a];[0:v]fade=t=in:st=0:d=${fadeInSec},fade=t=out:st=${duration - fadeOutSec}:d=${fadeOutSec}[v_faded]" ` +
        `-map "[v_faded]" -map "[card_a]" ` +
        `-c:v libx264 -pix_fmt yuv420p -c:a aac -ar 24000 -ac 1 -t ${duration} -r ${fps} -shortest ` +
        `"${output}"`
    } else {
      ffmpegCmd =
        `ffmpeg -y -loop 1 -i "${pngPath}" ` +
        `-f lavfi -i "anullsrc=channel_layout=mono:sample_rate=24000" ` +
        `-vf "fade=t=in:st=0:d=${fadeInSec},fade=t=out:st=${duration - fadeOutSec}:d=${fadeOutSec}" ` +
        `-c:v libx264 -pix_fmt yuv420p -map 1:a -c:a aac -ar 24000 -ac 1 -t ${duration} -r ${fps} -shortest ` +
        `"${output}"`
    }

    await execAsync(ffmpegCmd)

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