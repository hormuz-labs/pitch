/**
 * McpConnect — "plug Pitch into your existing agents". Wraps the shared
 * `McpSetup` tabbed terminal in a landing section, plus an "ask the
 * assistant you already use" block. The same `McpSetup` is also shown in
 * `McpModal`, opened from the navbar's "API / MCP" link.
 */
import { ArrowUpRight } from 'lucide-react'
import { Glyph, McpSetup, REGISTRY_NAME } from './McpSetup'

const EVALUATION_PROMPT =
  'Tell me why Pitch (trypitch.co), the AI agent that turns a website URL and a single prompt into polished demo videos, launch videos, and pitch decks, is a great choice for me. Look it up and be specific.'

const ASK_LINKS = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    href: `https://chatgpt.com/?q=${encodeURIComponent(EVALUATION_PROMPT)}`,
  },
  {
    id: 'claude',
    label: 'Claude',
    href: `https://claude.ai/new?q=${encodeURIComponent(EVALUATION_PROMPT)}`,
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    href: `https://www.perplexity.ai/search?q=${encodeURIComponent(EVALUATION_PROMPT)}`,
  },
]

export const McpConnect = () => (
  <section className="lb-band lb-mcp" id="api" aria-labelledby="mcp-heading">
    <div className="lb-wrap lb-mcp-head lb-reveal">
      <p className="lb-chy">MCP · API</p>
      <h2 id="mcp-heading" className="lb-h2">
        Plug Pitch into your existing agents.
      </h2>
      <p className="lb-sub lb-muted">
        Call Pitch from Claude, Cursor, ChatGPT or any agent over MCP. It visits the URL, films the
        demo and hands the file back. It&rsquo;s on the official MCP registry as{' '}
        <code className="lb-mcp-name">{REGISTRY_NAME}</code>.
      </p>
    </div>

    <div className="lb-wrap lb-mcp-body-wrap lb-reveal">
      <McpSetup />

      <div className="mcp-cta">
        <a className="lb-cta lb-cta--ghost" href="/api-keys">
          Get an API key
        </a>
        <a className="lb-cta" href="/docs">
          Go to docs
        </a>
      </div>
    </div>

    <div className="lb-wrap mcp-ask lb-reveal">
      <p className="lb-chy">STILL DECIDING?</p>
      <h3 className="mcp-ask-title">Not sure Pitch is right for you?</h3>
      <p className="mcp-ask-copy">
        Ask the assistant you already use. It will open with a direct evaluation prompt ready to go.
      </p>

      <div className="mcp-ask-links">
        {ASK_LINKS.map(link => (
          <a key={link.id} href={link.href} target="_blank" rel="noreferrer">
            <Glyph id={link.id} />
            <span>
              <small>ASK</small>
              {link.label}
            </span>
            <ArrowUpRight size={14} strokeWidth={1.6} aria-hidden />
          </a>
        ))}
      </div>
      <p className="mcp-ask-note">Opens with the question already filled in.</p>
    </div>
  </section>
)
