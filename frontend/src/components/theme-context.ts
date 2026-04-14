import { createContext } from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export type { Theme, ThemeProviderState }

export const ThemeContext = createContext<ThemeProviderState | undefined>(undefined)