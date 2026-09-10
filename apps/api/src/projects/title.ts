const URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,})(?:\/[^\s)]*)?/gi
const GENERIC_SUBDOMAINS = new Set(['app', 'dashboard', 'docs', 'go', 'm', 'www'])
const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'net', 'org'])
const OUTPUTS: Array<[RegExp, string]> = [
  [/\blaunch film\b/i, 'Launch film'],
  [/\blaunch video\b/i, 'Launch video'],
  [/\b(?:product )?demo(?: video)?\b/i, 'Demo'],
  [/\b(?:pdf|pdf document)\b/i, 'PDF'],
  [/\b(?:slide deck|presentation|deck)\b/i, 'Presentation'],
  [/\b(?:edited |edit )?(?:recording|video)\b/i, 'Video edit'],
]
const TRAILING_WORD = /^(?:a|an|and|about|for|of|on|or|the|to|using|with)$/i

function productName(host: string): string {
  const parts = host
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')
  let index = parts.length - 2
  if (parts.length > 2 && parts.at(-1)?.length === 2 && SECOND_LEVEL_SUFFIXES.has(parts.at(-2)!)) {
    index--
  }
  if (index > 0 && GENERIC_SUBDOMAINS.has(parts[index])) index--
  return (parts[index] || parts[0])
    .split('-')
    .filter(Boolean)
    .map(word => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

function concise(value: string, maxWords: number, maxLength: number): string {
  const words = value
    .replace(/\s+and\s+(?:add|create|give|include|make|provide|show|suggest|use)\b.*$/i, '')
    .replace(/\s+(?:based on|featuring|including|using|with)\b.*$/i, '')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
  while (
    words.length &&
    (words.join(' ').length > maxLength || TRAILING_WORD.test(words.at(-1)!))
  ) {
    words.pop()
  }
  return words.join(' ')
}

function promptTitle(prompt: string): string {
  let readable = prompt
    .replace(URL_PATTERN, (_match, host: string) => productName(host))
    .replace(/^\s*(?:(?:can|could|would) you|please|i (?:want|need)(?: you)? to)\s+/i, '')
    .split(/(?:\r?\n|[.!?](?:\s|$))/, 1)[0]
    .replace(/\s+/g, ' ')
    .trim()

  if (!readable) return ''
  readable = readable
    .replace(/^(?:make|create|build|generate|produce|design)\s+(?:(?:me|us)\s+)?(?:an?\s+)?/i, '')
    .trim()

  let output: string | undefined
  let outputMatch: RegExpMatchArray | null = null
  for (const [pattern, label] of OUTPUTS) {
    const match = readable.match(pattern)
    if (!match) continue
    output = label
    outputMatch = match
    break
  }

  if (output && outputMatch?.index !== undefined) {
    const before = readable.slice(0, outputMatch.index)
    const after = readable.slice(outputMatch.index + outputMatch[0].length)
    const candidate = /^(?:\s*(?:for|about|of|on)\b)/i.test(after) ? after : before
    const subject = concise(
      candidate
        .trim()
        .replace(/^(?:for|about|of|on)\s+(?:the\s+)?/i, '')
        .replace(/^(?:website|site|company|product)\s+(?:for\s+)?/i, ''),
      4,
      40,
    )
    if (!subject) return output
    return `${output} for ${subject}`
  }

  const title = concise(readable, 8, 48)
  if (!title) return ''
  return `${title[0].toUpperCase()}${title.slice(1)}`
}

function previousPromptTitle(prompt: string): string {
  const readable = prompt
    .replace(URL_PATTERN, (_match, host: string) => productName(host))
    .replace(/^\s*(?:(?:can|could|would) you|please|i (?:want|need)(?: you)? to)\s+/i, '')
    .split(/(?:\r?\n|[.!?](?:\s|$))/, 1)[0]
    .replace(/\s+/g, ' ')
    .trim()
  const words = readable.split(' ').slice(0, 8)
  while (words.join(' ').length > 60) words.pop()
  const title = words.join(' ')
  return title ? `${title[0].toUpperCase()}${title.slice(1)}` : ''
}

export function projectTitle(prompt: string, uploadNames: string[] = []): string {
  return promptTitle(prompt) || uploadNames[0] || 'Untitled project'
}

/** Replace titles created by previous automatic rules, but preserve custom titles. */
export function replaceLegacyUrlTitle(title: string, prompt: string): string {
  const firstHost = [...prompt.matchAll(URL_PATTERN)][0]?.[1]?.replace(/^www\./i, '')
  const trimmed = prompt.trim()
  const oldestPromptTitle = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
  const generated = [firstHost, oldestPromptTitle, previousPromptTitle(prompt)].filter(Boolean)
  return generated.some(candidate => candidate!.toLowerCase() === title.toLowerCase())
    ? projectTitle(prompt)
    : title
}
