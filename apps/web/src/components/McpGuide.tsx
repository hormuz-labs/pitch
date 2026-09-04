import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { API_URL } from '../config'

const MCP_ENDPOINT = `${API_URL.replace(/\/$/, '')}/mcp`

const EXAMPLE_CONFIG = `{
  "mcpServers": {
    "pitch": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer pk_your_api_key_here"
      }
    }
  }
}`

export function McpGuide() {
  const [copied, setCopied] = useState(false)

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_CONFIG)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">MCP Server</h3>
        <p className="text-sm text-gray-500 mb-4">
          Connect external agents (Claude, Cursor, etc.) to Pitch via the Model Context Protocol.
          All calls are authenticated with an API key and charged to your account just like the web
          app.
        </p>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Endpoint
            </div>
            <code className="block px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-700 break-all font-mono">
              {MCP_ENDPOINT}
            </code>
          </div>

          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Authentication
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Create an API key on the{' '}
              <a href="/api-keys" className="text-indigo-600 hover:text-indigo-800 font-medium">
                API Keys
              </a>{' '}
              page, then send it as a Bearer token:
            </p>
            <code className="block px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-700 break-all font-mono">
              Authorization: Bearer pk_...
            </code>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Client config example
              </div>
              <button
                onClick={copyConfig}
                className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer border-none bg-transparent"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-700 overflow-x-auto font-mono">
              {EXAMPLE_CONFIG}
            </pre>
          </div>

          <div className="pt-2">
            <a
              href="/docs/mcp"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Read the full MCP docs
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">Available MCP tools</h3>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">create_project</code> — Start
            a project and send its first prompt. Charged by flow: demo video 3, launch video 6 to 13
            (by resolution, +1 for narration), deck 1 (2 when enhancing an upload), recording edit 2
          </li>
          <li>
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">prompt_project</code> — Send a
            follow-up to a project's agent: edits, changes, another take (free)
          </li>
          <li>
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">get_project</code> — Status,
            outputs, scenes or slides, share URL. This is what the agent polls (free)
          </li>
          <li>
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">list_projects</code>,{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">get_credits</code>,{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">get_pricing</code> — free
            reads
          </li>
        </ul>
      </div>
    </div>
  )
}
