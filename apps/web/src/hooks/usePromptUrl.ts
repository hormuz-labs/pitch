import { useEffect, useState } from 'react'
import { firstUrlInText } from '../lib/authOrigins'

/** Wait for typing to settle so suggestions never flicker on partial domains. */
export function usePromptUrl(text: string, delayMs = 320): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const candidate = firstUrlInText(text)
    if (candidate === url) return
    const timer = window.setTimeout(() => setUrl(candidate), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, text, url])

  return url
}
