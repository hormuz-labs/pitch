/** Extract the target website host from a natural-language launch brief. */
export function websiteHostFromPrompt(prompt: string): string | null {
  const explicit = prompt.match(/https?:\/\/[^\s)\]}>,]+/i)?.[0]
  if (explicit) {
    try {
      return new URL(explicit).host.toLowerCase().replace(/^www\./, '')
    } catch {
      // Fall through to bare-domain parsing.
    }
  }

  const bare = prompt.match(/\b(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,})(?::\d+)?\b/i)
  return bare?.[1]?.toLowerCase() ?? null
}

/** Display a launch-video job using its target site without changing its internal project name. */
export function launchVideoDisplayName(parameters: {
  prompt?: string
  projectName?: string
}): string {
  return websiteHostFromPrompt(parameters.prompt ?? '') ?? parameters.projectName ?? 'Launch Video'
}

/** Use the target website for identity; fall back to a short prompt slug. */
export function launchVideoProjectName(prompt: string, existingNames: readonly string[]): string {
  const website = websiteHostFromPrompt(prompt)?.replace(/:/g, '-')
  const cleaned = prompt
    .toLowerCase()
    .replace(/\bhttps?:\/\//g, ' ')
    .replace(/\bwww\./g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
  const noise = new Set(['http', 'https', 'www', 'com'])
  const words = cleaned
    .split(/\s+/)
    .filter(word => word.length > 2 && !noise.has(word))
    .slice(0, 4)
  const base = website || words.join('-') || 'video'
  const taken = new Set(existingNames)
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix++) {
    if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`
  }
}
