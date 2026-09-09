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

export interface ThemeContextValue {
  theme: Accessor<Theme>
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>()

function initialTheme(): Theme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider(props: ParentProps) {
  const [theme, setTheme] = createSignal<Theme>(initialTheme())

  onMount(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)')
    const sync = (event: MediaQueryListEvent) => setTheme(event.matches ? 'dark' : 'light')
    preference.addEventListener('change', sync)
    onCleanup(() => preference.removeEventListener('change', sync))
  })

  createEffect(() => {
    const value = theme()
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value
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
