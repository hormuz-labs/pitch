// Light/dark theme shared by every island on the page. The inline script in
// the layout applies the saved theme before first paint.
import { type Accessor, createRoot, createSignal, type ParentProps } from 'solid-js'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'pitch:theme'

export interface ThemeContextValue {
  theme: Accessor<Theme>
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

function storedTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const attr = document.documentElement.dataset.theme
  if (attr === 'dark' || attr === 'light') return attr
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const value = createRoot<ThemeContextValue>(() => {
  const [theme, setThemeSignal] = createSignal<Theme>(storedTheme())
  const setTheme = (next: Theme) => {
    setThemeSignal(next)
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Theme switching still works when storage is unavailable.
    }
    const root = document.documentElement
    root.dataset.theme = next
    root.classList.toggle('dark', next === 'dark')
    root.style.colorScheme = next
  }
  return { theme, setTheme, toggleTheme: () => setTheme(theme() === 'light' ? 'dark' : 'light') }
})

export function ThemeProvider(props: ParentProps) {
  return props.children
}

export function useTheme(): ThemeContextValue {
  return value
}
