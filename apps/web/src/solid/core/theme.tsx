import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  type ParentProps,
  useContext,
} from 'solid-js'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'pitch:theme'

export interface ThemeContextValue {
  theme: Accessor<Theme>
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>()

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function ThemeProvider(props: ParentProps) {
  const savedTheme = storedTheme()
  const [theme, setThemeSignal] = createSignal<Theme>(savedTheme ?? 'light')
  const setTheme = (value: Theme) => {
    setThemeSignal(value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // Theme switching still works when storage is unavailable.
    }
  }

  createEffect(() => {
    const value = theme()
    document.documentElement.dataset.theme = value
    document.documentElement.classList.toggle('dark', value === 'dark')
    document.documentElement.style.colorScheme = value
  })

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme: () => setTheme(theme() === 'light' ? 'dark' : 'light'),
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
