/** Deck template presets; ids match the server's template registry. */
export interface DeckTemplateInfo {
  id: string
  name: string
  blurb: string
  swatch: [string, string, string]
}

export const DECK_TEMPLATES: DeckTemplateInfo[] = [
  {
    id: 'BRUTALIST_NEWSPAPER',
    name: 'Brutalist Newspaper',
    blurb: 'Editorial mono, heavy rules, ink on paper.',
    swatch: ['#f5f1e8', '#111111', '#d43d1a'],
  },
  {
    id: 'MINIMAL_CORPORATE',
    name: 'Minimal Corporate',
    blurb: 'Clean grid, generous white space, calm blue.',
    swatch: ['#ffffff', '#0f172a', '#2563eb'],
  },
  {
    id: 'DARK_TECH',
    name: 'Dark Tech',
    blurb: 'Neon accents on near-black, product-launch energy.',
    swatch: ['#0b0f19', '#e2e8f0', '#22d3ee'],
  },
  {
    id: 'COMIC_POP',
    name: 'Comic Pop',
    blurb: 'Bold outlines, halftones and speech bubbles.',
    swatch: ['#fff7d6', '#1a1a1a', '#ff3b7a'],
  },
  {
    id: 'TECH_DUEL',
    name: 'Tech Duel',
    blurb: 'Side-by-side comparisons, split layouts.',
    swatch: ['#0f172a', '#f8fafc', '#f59e0b'],
  },
  {
    id: 'STARTUP_AMPLIFY',
    name: 'Startup Amplify',
    blurb: 'Gradient hero, big numbers, pitch-ready.',
    swatch: ['#ffffff', '#111827', '#7c3aed'],
  },
]
