/**
 * Branded poster frames for the showcase clips — a dark card with the Pitch
 * pixel wordmark and the film's name, generated as an inline SVG data URI so
 * the carousel never flashes plain white while a clip loads.
 */

// Pixel-block PITCH wordmark — same coordinates as <PitchWordmark>.
// Content spans x:30..588, y:38..148 inside a 20 20 580 140 viewBox.
const BLOCKS: [number, number][] = [
  // P
  [30, 38],
  [30, 61],
  [30, 84],
  [30, 107],
  [30, 130],
  [63, 38],
  [63, 84],
  [96, 38],
  [96, 61],
  [96, 84],
  // I
  [146, 38],
  [146, 130],
  [179, 38],
  [179, 61],
  [179, 84],
  [179, 107],
  [179, 130],
  [212, 38],
  [212, 130],
  // T
  [262, 38],
  [295, 38],
  [295, 61],
  [295, 84],
  [295, 107],
  [295, 130],
  [328, 38],
  // C
  [378, 38],
  [378, 61],
  [378, 84],
  [378, 107],
  [378, 130],
  [411, 38],
  [411, 130],
  [444, 38],
  [444, 130],
  // H
  [494, 38],
  [494, 61],
  [494, 84],
  [494, 107],
  [494, 130],
  [527, 84],
  [560, 38],
  [560, 61],
  [560, 84],
  [560, 107],
  [560, 130],
]

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, c => `&#${c.charCodeAt(0)};`)

export function filmPoster(title: string): string {
  const rects = BLOCKS.map(
    ([x, y]) => `<rect x="${x}" y="${y}" width="28" height="18" rx="3"/>`,
  ).join('')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
    `<defs>` +
    `<radialGradient id="g" cx="50%" cy="40%" r="70%">` +
    `<stop offset="0" stop-color="#1b1b20"/><stop offset="1" stop-color="#08080a"/>` +
    `</radialGradient>` +
    `<pattern id="d" width="36" height="36" patternUnits="userSpaceOnUse">` +
    `<circle cx="1.2" cy="1.2" r="1.2" fill="#ffffff" fill-opacity="0.045"/>` +
    `</pattern>` +
    `</defs>` +
    `<rect width="1280" height="720" fill="url(#g)"/>` +
    `<rect width="1280" height="720" fill="url(#d)"/>` +
    `<g transform="translate(640 300) scale(1.28) translate(-309 -93)" fill="#f4f4f3">${rects}</g>` +
    `<text x="640" y="474" text-anchor="middle" fill="#f4f4f3" ` +
    `font-family="ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" ` +
    `font-size="36" font-weight="500" letter-spacing="-1.2">${escapeXml(title)}</text>` +
    `<text x="640" y="516" text-anchor="middle" fill="#8a8f98" ` +
    `font-family="ui-monospace,Menlo,Consolas,monospace" font-size="15" letter-spacing="4">MADE WITH PITCH</text>` +
    `</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
