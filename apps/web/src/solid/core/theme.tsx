import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
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
  const [theme, setThemeSignal] = createSignal<Theme>(
    savedTheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )
  const [followsSystem, setFollowsSystem] = createSignal(savedTheme === null)
  const setTheme = (value: Theme) => {
    setFollowsSystem(false)
    setThemeSignal(value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // Theme switching still works when storage is unavailable.
    }
  }

  onMount(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)')
    const sync = (event: MediaQueryListEvent) => {
      if (followsSystem()) setThemeSignal(event.matches ? 'dark' : 'light')
    }
    preference.addEventListener('change', sync)
    onCleanup(() => preference.removeEventListener('change', sync))
  })

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
