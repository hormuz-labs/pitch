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

/** Human-readable title for a job, shared between the web dashboard (VideoCard)
 * and the API's public share page (og:title / <title>) so the two never drift. */
export function deriveJobTitle(parameters: Record<string, any> | null | undefined): string {
  if (parameters?.jobType === 'launch-video') {
    return launchVideoDisplayName(parameters)
  }
  if (parameters?.url) {
    return String(parameters.url)
      .replace(/^https?:\/\//, '')
      .split('/')[0]
  }
  return 'Untitled Job'
}
