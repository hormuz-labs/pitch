export interface ShowcaseFilm {
  file: string
  title: string
  category: string
  prompt: string
}

export const SHOWCASE_FILMS: readonly ShowcaseFilm[] = [
  {
    file: 'graphify.mp4',
    title: 'Graphify',
    category: 'Launch film',
    prompt: 'Make a cinematic launch film for Graphify’s developer workflow.',
  },
  {
    file: 'gtmcofounder.mp4',
    title: 'GTM Cofounder',
    category: 'Explainer',
    prompt: 'Explain how an AI cofounder turns product context into go-to-market work.',
  },
  {
    file: 'supermemory.mp4',
    title: 'Supermemory',
    category: 'Product film',
    prompt: 'Turn Supermemory’s product story into a focused launch video.',
  },
  {
    file: 'unsloth-launch.mp4',
    title: 'Unsloth',
    category: 'Launch film',
    prompt: 'Make a fast, technical launch film for Unsloth.',
  },
  {
    file: 'demo.mp4',
    title: 'Pitch',
    category: 'Product demo',
    prompt: 'Record a narrated walkthrough of the core Pitch workflow.',
  },
  {
    file: 'Thomas.mp4',
    title: 'Thomas',
    category: 'Launch film',
    prompt: 'Introduce Thomas as the world’s first autonomous AI founder.',
  },
  {
    file: 'leeter.mp4',
    title: 'Leeter',
    category: 'Explainer',
    prompt: 'Turn Leeter’s product story into a sharp, cinematic explainer.',
  },
  {
    file: 'productHunt.mp4',
    title: 'Product Hunt',
    category: 'Launch film',
    prompt: 'Create a countdown-driven launch film for Product Hunt.',
  },
  {
    file: 'quippy.mp4',
    title: 'Quippy',
    category: 'Product film',
    prompt: 'Make a concise product film that introduces Quippy’s core idea.',
  },
  {
    file: 'agentcard.mp4',
    title: 'AgentCard',
    category: 'Launch film',
    prompt: 'Create a polished launch film for AgentCard’s AI-native payment platform.',
  },
  {
    file: 'replit.mp4',
    title: 'Replit',
    category: 'Product demo',
    prompt: 'Show how Replit turns an idea into a working product.',
  },
]

export const AGENCY_FILMS = [SHOWCASE_FILMS[3], SHOWCASE_FILMS[1], SHOWCASE_FILMS[0]] as const
