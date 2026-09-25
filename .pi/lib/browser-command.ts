/**
 * `pitch demo browser` commands, parsed.
 *
 * The agent writes a browser step the way it would type it — `click e53`,
 * `press ArrowRight`, `eval "el => el.src" e12` — and this turns it into one
 * typed operation for the host's Playwright page. Nothing here reaches a
 * shell: quotes group words, and that is all they do. A verb that is not in
 * the table is refused, so the command line cannot grow a way off the page.
 *
 * Pure: no fs, no Playwright. The host side is apps/api/src/render/utils/browser-driver.ts.
 */

export type BrowserOp =
  | { op: 'snapshot'; selector?: string }
  | { op: 'click' | 'dblclick' | 'hover' | 'check' | 'uncheck'; ref: string; button?: MouseButton }
  | { op: 'fill'; ref: string; text: string; submit?: boolean }
  | { op: 'select'; ref: string; values: string[] }
  | { op: 'type'; text: string }
  | { op: 'press'; key: string }
  | { op: 'goto'; url: string }
  | { op: 'back' | 'forward' | 'reload' }
  | { op: 'scroll'; dx: number; dy: number }
  | { op: 'focus'; ref: string }
  | { op: 'eval'; fn: string; ref?: string }
  | { op: 'screenshot'; file: string; ref?: string }
  | { op: 'wait'; ms: number }
  | { op: 'tab-list' }
  | { op: 'tab-new'; url?: string }
  | { op: 'tab-select' | 'tab-close'; index?: number }
  | { op: 'dialog'; accept: boolean; text?: string }

export type MouseButton = 'left' | 'right' | 'middle'

/** The verbs, as the agent types them, with a one-line usage each. */
export const BROWSER_VERBS: Record<string, string> = {
  snapshot: 'snapshot [css-selector]  — accessibility tree with refs (whole page or one region)',
  click: 'click <ref> [right|middle]',
  dblclick: 'dblclick <ref>',
  hover: 'hover <ref>',
  check: 'check <ref>',
  uncheck: 'uncheck <ref>',
  fill: 'fill <ref> <text> [--submit]  — visible typing (same as pitch demo fill-field)',
  select: 'select <ref> <value> [value…]',
  type: 'type <text>  — types into the focused element',
  press: 'press <key>  — e.g. Enter, ArrowRight, Control+a',
  goto: 'goto <url>',
  'go-back': 'go-back',
  'go-forward': 'go-forward',
  reload: 'reload',
  scroll: 'scroll <dy> [dx]  — smooth wheel scroll in CSS pixels (negative is up)',
  focus: 'focus <ref>  — smoothly scroll the element to the centre of the view',
  eval: 'eval "<function>" [ref]  — runs in the page; with a ref the function gets the element',
  screenshot: 'screenshot [ref] --filename <workspace path>',
  wait: 'wait <ms>  — let the page settle (at most 10000)',
  'tab-list': 'tab-list',
  'tab-new': 'tab-new [url]',
  'tab-select': 'tab-select <index>',
  'tab-close': 'tab-close [index]',
  'dialog-accept': 'dialog-accept [prompt text]  — accept the next alert/confirm/prompt',
  'dialog-dismiss': 'dialog-dismiss  — dismiss the next alert/confirm/prompt',
}

export function browserUsage(): string {
  return `Supported browser commands:\n${Object.values(BROWSER_VERBS)
    .map(line => `  ${line}`)
    .join('\n')}`
}

/**
 * Split a command line into words. Single and double quotes group; a
 * backslash escapes the next character (outside single quotes). No
 * expansion of any kind happens — `$(x)` is five characters.
 */
export function splitWords(line: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      inWord = true
    } else if (c === '\\' && i + 1 < line.length) {
      word += line[++i]
      inWord = true
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
    } else {
      word += c
      inWord = true
    }
  }
  if (quote) throw new Error('Unclosed quote in browser command.')
  if (inWord) words.push(word)
  return words
}

const REF = /^(?:f\d+)?e\d+$/

/** A snapshot ref (`e53`, `f1e7`), accepting `ref=e53` / `[ref=e53]`. */
export function parseRef(word: string | undefined, verb: string): string {
  const value = word?.replace(/^\[?ref=/, '').replace(/\]$/, '')
  if (!value || !REF.test(value))
    throw new Error(
      `${verb} needs a ref from the current snapshot, like e53 (got ${word ? `"${word}"` : 'nothing'}). Take a fresh snapshot.`,
    )
  return value
}

function number(word: string | undefined, what: string): number {
  const n = Number(word)
  if (word === undefined || !Number.isFinite(n)) throw new Error(`${what} must be a number.`)
  return n
}

/** Parse one browser command. Throws with the usage when it is not one. */
export function parseBrowserCommand(command: string): BrowserOp {
  let words = splitWords(command.trim())
  // Accept the old spelling: `playwright-cli [--raw] [-s=name] <verb> …`.
  if (words[0] === 'playwright-cli') words = words.slice(1)
  words = words.filter(w => w !== '--raw' && !/^(-s|--session)=/.test(w))
  const [verb, ...args] = words
  if (!verb) throw new Error(`Empty browser command.\n${browserUsage()}`)
  const flag = (name: string) => {
    const at = args.indexOf(name)
    if (at < 0) return undefined
    const value = args[at + 1]
    args.splice(at, 2)
    return value
  }

  switch (verb) {
    case 'snapshot':
      return args[0] ? { op: 'snapshot', selector: args.join(' ') } : { op: 'snapshot' }
    case 'click':
    case 'dblclick': {
      const button = args[1]
      if (button !== undefined && !['left', 'right', 'middle'].includes(button))
        throw new Error(`${verb} button must be left, right or middle.`)
      return {
        op: verb,
        ref: parseRef(args[0], verb),
        ...(button ? { button: button as MouseButton } : {}),
      }
    }
    case 'hover':
    case 'check':
    case 'uncheck':
      return { op: verb, ref: parseRef(args[0], verb) }
    case 'fill': {
      const submit = args.includes('--submit')
      const rest = args.filter(a => a !== '--submit')
      return { op: 'fill', ref: parseRef(rest[0], verb), text: rest.slice(1).join(' '), submit }
    }
    case 'select':
      if (args.length < 2) throw new Error('select needs a ref and at least one value.')
      return { op: 'select', ref: parseRef(args[0], verb), values: args.slice(1) }
    case 'type':
      if (!args.length) throw new Error('type needs the text to type.')
      return { op: 'type', text: args.join(' ') }
    case 'press':
      if (!args[0]) throw new Error('press needs a key, e.g. Enter or ArrowRight.')
      return { op: 'press', key: args[0] }
    case 'goto':
      if (!args[0] || !/^https?:\/\//i.test(args[0])) throw new Error('goto needs an http(s) URL.')
      return { op: 'goto', url: args[0] }
    case 'go-back':
      return { op: 'back' }
    case 'go-forward':
      return { op: 'forward' }
    case 'reload':
      return { op: 'reload' }
    case 'scroll':
    case 'mousewheel': {
      // mousewheel keeps playwright-cli's order (dx dy); scroll is dy-first.
      const [a, b] = args
      return verb === 'mousewheel'
        ? { op: 'scroll', dx: number(a, 'dx'), dy: number(b ?? '0', 'dy') }
        : { op: 'scroll', dy: number(a, 'dy'), dx: number(b ?? '0', 'dx') }
    }
    case 'focus':
      return { op: 'focus', ref: parseRef(args[0], verb) }
    case 'eval': {
      if (!args[0]) throw new Error('eval needs a function, e.g. eval "() => document.title".')
      return args[1]
        ? { op: 'eval', fn: args[0], ref: parseRef(args[1], verb) }
        : { op: 'eval', fn: args[0] }
    }
    case 'screenshot': {
      const file = flag('--filename')
      if (!file)
        throw new Error('screenshot needs --filename <workspace path>, e.g. recording/detail.png.')
      return args[0]
        ? { op: 'screenshot', file, ref: parseRef(args[0], verb) }
        : { op: 'screenshot', file }
    }
    case 'wait': {
      const ms = number(args[0] ?? '1000', 'wait')
      return { op: 'wait', ms: Math.max(0, Math.min(10_000, ms)) }
    }
    case 'tab-list':
      return { op: 'tab-list' }
    case 'tab-new':
      if (args[0] && !/^https?:\/\//i.test(args[0]))
        throw new Error('tab-new needs an http(s) URL.')
      return args[0] ? { op: 'tab-new', url: args[0] } : { op: 'tab-new' }
    case 'tab-select':
      return { op: 'tab-select', index: number(args[0], 'tab index') }
    case 'tab-close':
      return args[0]
        ? { op: 'tab-close', index: number(args[0], 'tab index') }
        : { op: 'tab-close' }
    case 'dialog-accept':
      return args.length
        ? { op: 'dialog', accept: true, text: args.join(' ') }
        : { op: 'dialog', accept: true }
    case 'dialog-dismiss':
      return { op: 'dialog', accept: false }
    case 'open':
    case 'close':
    case 'attach':
    case 'detach':
    case 'video-start':
    case 'video-stop':
      throw new Error(
        'The browser is opened and recorded by pitch demo record-start (or browser-open) and closed by record-stop. Do not open, close or attach it yourself.',
      )
    default:
      throw new Error(`"${verb}" is not a browser command.\n${browserUsage()}`)
  }
}

/** A press that moves an asset slideshow forward one page. */
export function isSlideAdvance(op: BrowserOp): boolean {
  return op.op === 'press' && (op.key === 'ArrowRight' || op.key === 'Space' || op.key === ' ')
}

/** Ops after which refs and cached geometry belong to a different page. */
export function mayNavigate(op: BrowserOp): boolean {
  return (
    [
      'click',
      'dblclick',
      'goto',
      'back',
      'forward',
      'reload',
      'tab-new',
      'tab-select',
      'tab-close',
    ].includes(op.op) ||
    (op.op === 'press' && op.key === 'Enter') ||
    (op.op === 'fill' && !!op.submit)
  )
}
