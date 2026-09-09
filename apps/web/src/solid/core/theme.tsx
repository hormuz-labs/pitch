import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  type ParentProps,
  useContext,
} from 'solid-js'

export type Theme = 'light' | 'dark'

export interface ThemeContextValue {
  theme: Accessor<Theme>
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'pitch-theme'
const ThemeContext = createContext<ThemeContextValue>()

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable in privacy modes.
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider(props: ParentProps) {
  const [theme, setTheme] = createSignal<Theme>(initialTheme())

  createEffect(() => {
    const value = theme()
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // The DOM state remains authoritative when storage is unavailable.
    }
  })

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme: () => setTheme(value => (value === 'light' ? 'dark' : 'light')),
      }}
    >
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
