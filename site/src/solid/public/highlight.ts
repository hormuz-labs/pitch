/**
 * A small syntax highlighter for the docs' code blocks. The docs use only bash,
 * JavaScript and JSON, so a few token rules cover them without shipping a
 * highlighting library. Runs at render time, so prerendered pages carry the
 * colours. Returns escaped HTML with `<span class="tok-*">` wrappers.
 */

const escape = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

type Rule = [kind: string, pattern: RegExp]

const JS_KEYWORDS =
  'import|from|export|const|let|var|await|async|function|return|new|if|else|for|of|in|while|try|catch|throw|class|extends'

const RULES: Record<string, Rule[]> = {
  javascript: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    ['string', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/y],
    ['keyword', new RegExp(`\\b(?:${JS_KEYWORDS})\\b`, 'y')],
    ['literal', /\b(?:true|false|null|undefined)\b/y],
    ['number', /\b\d+(?:\.\d+)?\b/y],
    ['property', /\b[A-Za-z_$][\w$]*(?=\s*:)/y],
    ['function', /\b[A-Za-z_$][\w$]*(?=\s*\()/y],
  ],
  json: [
    ['property', /"(?:\\[\s\S]|[^"\\])*"(?=\s*:)/y],
    ['string', /"(?:\\[\s\S]|[^"\\])*"/y],
    ['literal', /\b(?:true|false|null)\b/y],
    ['number', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
  ],
  bash: [
    ['comment', /#[^\n]*/y],
    ['string', /"(?:\\[\s\S]|[^"\\])*"|'[^']*'/y],
    ['variable', /\$\{[^}]*\}|\$[A-Za-z_][\w]*/y],
    ['flag', /(?<=\s)--?[A-Za-z][\w-]*/y],
    ['function', /(?<=^|\n|\|\s?|\$\(\s?)\s*[a-z][\w-]*/y],
  ],
}
RULES.js = RULES.javascript
RULES.sh = RULES.bash

export function highlight(code: string, lang = 'text'): string {
  const rules = RULES[lang]
  if (!rules) return escape(code)
  let out = ''
  let plain = ''
  let i = 0
  while (i < code.length) {
    let matched = false
    for (const [kind, rx] of rules) {
      rx.lastIndex = i
      const m = rx.exec(code)
      if (m && m[0].length) {
        if (plain) out += escape(plain)
        plain = ''
        out += `<span class="tok-${kind}">${escape(m[0])}</span>`
        i += m[0].length
        matched = true
        break
      }
    }
    if (!matched) {
      plain += code[i]
      i++
    }
  }
  return out + escape(plain)
}
