import { createContext, useContext, useEffect } from 'react'

type Theme = 'light' | 'dark'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx | null>(null)

const STORAGE_KEY = 'pitch-theme'
const LIGHT_THEME: Theme = 'light'
const noThemeToggle = () => {}
const lightThemeContext: ThemeCtx = { theme: LIGHT_THEME, toggle: noThemeToggle }

function getInitial(): Theme {
  return LIGHT_THEME
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = getInitial()

  // Apply to <html> so all pages inherit via data-theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  // Dark mode is intentionally disabled. Keep the context API stable for any
  // older consumers while making the public experience light-only.
  return <ThemeContext.Provider value={lightThemeContext}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
